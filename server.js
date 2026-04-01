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
// Render/Linux environment should use /tmp/ for temporary storage
const upload = multer({ dest: '/tmp/' });

// Global progress state
let currentProgress = {
    percent: 0,
    timemark: "00:00:00",
    status: "Hazır",
    videoTitle: ""
};

// SSE clients
let clients = [];

// --- MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// --- AUTHENTICATION ---
function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) return next();
    res.redirect('/login');
}

// --- SSE FOR PROGRESS ---
app.get('/progress', isAuthenticated, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);
    req.on('close', () => clients = clients.filter(c => c.id !== clientId));
    res.write(`data: ${JSON.stringify(currentProgress)}\n\n`);
});

function broadcastProgress() {
    clients.forEach(c => c.res.write(`data: ${JSON.stringify(currentProgress)}\n\n`));
}

// --- ROUTES ---
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || '123';
    if (username === adminUser && password === adminPass) {
        req.session.isLoggedIn = true;
        res.redirect('/');
    } else {
        res.render('login', { error: 'Hatalı giriş!' });
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
        res.status(400).send("Eksik bilgi!");
    }
});

// --- QUANTUM SHIELD PROCESSING ---
async function processQueue() {
    let state = readState();
    if (state.isBusy) return;

    state.isBusy = true;
    writeState(state);

    while (state.queue.length > 0) {
        if (state.processedToday >= state.dailyLimit) break;
        const videoData = state.queue[0];
        await applyShieldAndUpload(videoData);
        state = readState();
    }

    state.isBusy = false;
    writeState(state);
}

async function applyShieldAndUpload(videoData) {
    const inputPath = videoData.path;
    const outputFilename = 'shielded_' + Date.now() + '.mp4';
    const outputPath = path.join('/tmp/', outputFilename);

    currentProgress.videoTitle = videoData.title;
    currentProgress.status = "Kalkan Uygulanıyor (Anti-Copyright)...";
    broadcastProgress();

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoFilters([
                'hflip',                // Aynalama
                'scale=1.1*iw:-1',      // %10 Zoom
                'crop=iw/1.1:ih/1.1',   // Kırpma
                'hue=s=1.2:b=0.1'       // Renk Manipülasyonu
            ])
            .audioFilters([
                'asetrate=44100*1.03',  // Ses perdesi değişimi
                'aresample=44100'
            ])
            .videoCodec('libx264')
            .addOptions(['-crf 24', '-preset superfast'])
            .on('progress', (progress) => {
                currentProgress.percent = Math.floor(progress.percent || 0);
                currentProgress.timemark = progress.timemark;
                broadcastProgress();
            })
            .on('end', async () => {
                currentProgress.status = "YouTube'a Yükleniyor (Gizli)...";
                broadcastProgress();

                try {
                    await uploadToYouTube(outputPath, {
                        title: videoData.title,
                        description: `Quantum Shield V3 Protected Upload`,
                    });

                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

                    let newState = readState();
                    newState.processedToday++;
                    newState.queue = newState.queue.filter(v => v.path !== videoData.path);
                    writeState(newState);

                    currentProgress.status = "Hazır";
                    currentProgress.percent = 0;
                    broadcastProgress();
                    resolve();
                } catch (err) {
                    reject(err);
                }
            })
            .on('error', (err) => reject(err))
            .save(outputPath);
    });
}

// --- CRON ---
const uploadHour = process.env.UPLOAD_HOUR || "03";
cron.schedule(`0 ${uploadHour} * * *`, () => {
    processQueue().catch(err => console.error(err));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Quantum Shield Port ${PORT} Aktif.`));
