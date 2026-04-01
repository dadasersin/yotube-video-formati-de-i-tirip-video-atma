const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const defaultState = {
    dailyLimit: parseInt(process.env.DAILY_LIMIT) || 5,
    uploadHour: process.env.UPLOAD_HOUR || "03",
    queue: [],
    processedToday: 0,
    isBusy: false,
    lastResetDate: new Date().toLocaleDateString()
};

function readState() {
    if (!fs.existsSync(DB_PATH)) {
        writeState(defaultState);
        return defaultState;
    }
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        const state = JSON.parse(data);
        const today = new Date().toLocaleDateString();
        if (state.lastResetDate !== today) {
            state.processedToday = 0;
            state.lastResetDate = today;
            writeState(state);
        }
        return state;
    } catch (error) {
        console.error("Error reading db.json:", error);
        return defaultState;
    }
}

function writeState(state) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error("Error writing to db.json:", error);
    }
}

module.exports = { readState, writeState };
