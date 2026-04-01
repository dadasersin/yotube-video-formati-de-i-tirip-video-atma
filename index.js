require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const { readState, writeState } = require('./storage');
const { uploadToYouTube } = require('./youtube');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Global progress state
let currentProgress = {
    percent: 0,
    timemark: "00:00:00",
    status: "Hazır",
    videoTitle: ""
};

// SSE clients
let clients = [];

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// --- MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// --- AUTHENTICATION CHECK ---
function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) {
        return next();
    }
    res.redirect('/login');
}

// --- SSE ENDPOINT ---
app.get('/progress', isAuthenticated, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
    });

    // Send initial status
    res.write(`data: ${JSON.stringify(currentProgress)}\n\n`);
});

function broadcastProgress() {
    clients.forEach(c => c.res.write(`data: ${JSON.stringify(currentProgress)}\n\n`));
}

// --- ROUTES ---
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || '123';

    if (username === adminUser && password === adminPass) {
        req.session.isLoggedIn = true;
        res.redirect('/');
    } else {
        res.render('login', { error: 'Geçersiz kullanıcı adı veya şifre!' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', isAuthenticated, (req, res) => {
    const state = readState();
    res.render('dashboard', { state });
});

app.post('/add-to-queue', isAuthenticated, upload.single('video'), (req, res) => {
    const { title } = req.body;
    if (req.file && title) {
        const state = readState();
        state.queue.push({
            ...req.file,
            title,
            addedAt: new Date().toISOString()
        });
        writeState(state);
        res.redirect('/');
    } else {
        res.status(400).send("Dosya veya başlık eksik.");
    }
});

// --- VIDEO PROCESSING ---
async function processQueue() {
    let state = readState();
    if (state.isProcessing) return;

    console.log("=== Gece Mesaisi Başladı ===");
    state = readState();

    while (state.queue.length > 0) {
        if (state.processedToday >= state.dailyLimit) {
            console.log("Günlük limite ulaşıldı.");
            break;
        }

        const videoData = state.queue[0];
        await processAndUpload(videoData);
        state = readState(); // Refresh for next loop
    }
}

async function processAndUpload(videoData) {
    let state = readState();
    state.isProcessing = true;
    writeState(state);

    currentProgress.videoTitle = videoData.title;
    currentProgress.status = "Dönüştürülüyor...";
    broadcastProgress();

    const inputPath = videoData.path;
    const outputFilename = 'final_' + Date.now() + '_' + videoData.originalname;
    const outputPath = path.join(__dirname, 'uploads', outputFilename);

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoCodec('libx264')
            .size('1920x1080')
            .addOptions(['-crf 23', '-preset slow'])
            .on('progress', (progress) => {
                currentProgress.percent = Math.floor(progress.percent || 0);
                currentProgress.timemark = progress.timemark;
                broadcastProgress();
            })
            .on('end', async () => {
                currentProgress.status = "YouTube'a Yükleniyor...";
                currentProgress.percent = 100;
                broadcastProgress();

                try {
                    await uploadToYouTube(outputPath, {
                        title: videoData.title,
                        description: `Uploaded via Quantum Auto-Upload`,
                    });

                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

                    let newState = readState();
                    newState.processedToday++;
                    newState.queue = newState.queue.filter(v => v.path !== videoData.path);
                    newState.isProcessing = false;
                    writeState(newState);

                    currentProgress.status = "Hazır";
                    currentProgress.percent = 0;
                    currentProgress.videoTitle = "";
                    broadcastProgress();
                    resolve();
                } catch (err) {
                    let newState = readState();
                    newState.isProcessing = false;
                    writeState(newState);
                    reject(err);
                }
            })
            .on('error', (err) => {
                let newState = readState();
                newState.isProcessing = false;
                writeState(newState);
                reject(err);
            })
            .save(outputPath);
    });
}

const uploadHour = process.env.UPLOAD_HOUR || "03";
cron.schedule(`0 ${uploadHour} * * *`, () => {
    processQueue().catch(err => console.error(err));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Quantum Auto-Upload Aktif! http://localhost:${PORT}`);
});
