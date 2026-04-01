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
    cookie: { secure: false } // Set to true if using HTTPS
}));

// --- AUTHENTICATION CHECK ---
function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) {
        return next();
    }
    res.redirect('/login');
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
    if (state.isProcessing) {
        console.log("Zaten bir işlem devam ediyor.");
        return;
    }

    console.log("=== Gece Mesaisi Başladı: Videolar İşleniyor ===");

    // Refresh processedToday check (done inside readState)
    state = readState();

    for (let i = 0; i < state.queue.length; i++) {
        state = readState(); // Refresh state in each loop

        if (state.processedToday >= state.dailyLimit) {
            console.log("Günlük limite ulaşıldı, kalanlar yarına devredildi.");
            break;
        }

        const videoData = state.queue[0]; // Always take the first one
        await processAndUpload(videoData);
    }
}

async function processAndUpload(videoData) {
    let state = readState();
    state.isProcessing = true;
    writeState(state);

    const inputPath = videoData.path;
    const outputFilename = 'final_' + Date.now() + '_' + videoData.originalname;
    const outputPath = path.join(__dirname, 'uploads', outputFilename);

    console.log(`İşleniyor: ${videoData.title}`);

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoCodec('libx264')
            .size('1920x1080')
            .addOptions(['-crf 23', '-preset slow'])
            .on('end', async () => {
                console.log(`${videoData.title} başarıyla dönüştürüldü. YouTube'a yükleniyor...`);

                try {
                    await uploadToYouTube(outputPath, {
                        title: videoData.title,
                        description: `Uploaded via Quantum Auto-Upload`,
                    });

                    // Cleanup
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

                    // Update State
                    let newState = readState();
                    newState.processedToday++;
                    newState.queue = newState.queue.filter(v => v.path !== videoData.path);
                    newState.isProcessing = false;
                    writeState(newState);

                    console.log(`${videoData.title} tamamlandı.`);
                    resolve();
                } catch (err) {
                    console.error("YouTube Yükleme Hatası:", err);
                    let newState = readState();
                    newState.isProcessing = false;
                    writeState(newState);
                    reject(err);
                }
            })
            .on('error', (err) => {
                console.error("FFmpeg Hatası:", err);
                let newState = readState();
                newState.isProcessing = false;
                writeState(newState);
                reject(err);
            })
            .save(outputPath);
    });
}

// --- CRON JOB ---
const uploadHour = process.env.UPLOAD_HOUR || "03";
cron.schedule(`0 ${uploadHour} * * *`, () => {
    processQueue().catch(err => console.error("Queue Processing Error:", err));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    🚀 Quantum Auto-Upload Aktif!
    📍 Arayüz: http://localhost:${PORT}
    ⏰ İşlem Saati: Her gece ${uploadHour}:00
    `);
});
