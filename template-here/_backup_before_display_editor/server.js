// server.js - PORT 3000 (Safe & Rare) & Strict IP Filter
// FULL REVISED VERSION - Fix WebSocket Freezing, Lag on LAN, Race Conditions, Manual IP Selector & Recursive GitHub Sync

const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const fs = require('fs').promises; 
const fsSync = require('fs');      
const path = require('path');
const os = require('os');
const multer = require('multer');  

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Players Intro studio lives in the sibling project folder. Serving it from this server lets
// the studio read /api/presets on the same origin (no CORS) while keeping the original files
// untouched. If the folder is missing the route is simply skipped.
const playersIntroDir = path.join(__dirname, '..', 'Players Intro');
if (fsSync.existsSync(playersIntroDir)) {
    app.use('/playersintro', express.static(playersIntroDir));
}

// ==========================================
// 1. ASYNC QUEUE WRITER
// ==========================================
class AsyncQueue {
    constructor() {
        this.queue = Promise.resolve();
    }
    enqueue(task) {
        this.queue = this.queue.then(task).catch(err => {
            console.error('Queue Error:', err);
        });
        return this.queue;
    }
}
const fileQueue = new AsyncQueue();

// ==========================================
// 2. FOLDER & FILE PREPARATION
// ==========================================
const dbDir = path.join(__dirname, 'public/database');
const savedMatchDir = path.join(dbDir, 'savedmatch'); 
const unifiedDir = path.join(__dirname, 'public/Assets/costum/Theme');
const flagDir = path.join(__dirname, 'public/Assets/nationalflag');
const mvpPhotoDir = path.join(__dirname, 'public/Assets/mvp');
const heroPickDir = path.join(__dirname, 'public/Assets/HeroPick');
const itemSpellDir = path.join(__dirname, 'public/Assets/itemandspell');
const playerAssetDir = path.join(__dirname, 'public/Assets/player');
const secCountdownDir = path.join(__dirname, 'public/Assets/SEC/countdown');
const presetsDir = path.join(__dirname, 'public/Assets/presets');

if (!fsSync.existsSync(dbDir)) fsSync.mkdirSync(dbDir, { recursive: true });
if (!fsSync.existsSync(savedMatchDir)) fsSync.mkdirSync(savedMatchDir, { recursive: true });
if (!fsSync.existsSync(unifiedDir)) fsSync.mkdirSync(unifiedDir, { recursive: true });
if (!fsSync.existsSync(flagDir)) fsSync.mkdirSync(flagDir, { recursive: true });
if (!fsSync.existsSync(mvpPhotoDir)) fsSync.mkdirSync(mvpPhotoDir, { recursive: true });
if (!fsSync.existsSync(secCountdownDir)) fsSync.mkdirSync(secCountdownDir, { recursive: true });
if (!fsSync.existsSync(presetsDir)) fsSync.mkdirSync(presetsDir, { recursive: true });

const matchDataPath  = path.join(dbDir, 'matchdatateam.json');
const draftDataPath  = path.join(dbDir, 'matchdraft.json');
const prevDraftPath  = path.join(dbDir, 'previousmatchdraft.json');
const mapDrawPath    = path.join(dbDir, 'mapdraw.json');
const mvpDataPath    = path.join(dbDir, 'mvpdata.json');
const notifPath      = path.join(dbDir, 'notification.json');
const schedulePath   = path.join(dbDir, 'schedule.json');
const itemsPath      = path.join(dbDir, 'items.json');
const flagJsonPath   = path.join(dbDir, 'flags.json'); 
const themePath      = path.join(unifiedDir, 'theme.json');
const playerLanePath = path.join(dbDir, 'playerlane.json'); 
const secCountdownPath = path.join(dbDir, 'seccountdown.json');
const presetsPath    = path.join(dbDir, 'presets.json');

const storageUnified = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, unifiedDir); },
    filename: (req, file, cb) => { cb(null, file.originalname); }
});
const uploadUnified = multer({ storage: storageUnified });

const storageFlag = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, flagDir); },
    filename: (req, file, cb) => { cb(null, file.originalname); }
});
const uploadFlag = multer({ storage: storageFlag });

const storageMvpPhoto = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, mvpPhotoDir); },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const base = path.basename(file.originalname, path.extname(file.originalname))
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 48) || 'player';
        cb(null, `${base}_${Date.now()}${ext}`);
    }
});
const uploadMvpPhoto = multer({
    storage: storageMvpPhoto,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, ['.png', '.jpg', '.jpeg', '.webp'].includes(ext));
    }
});

const storageSecCountdown = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, secCountdownDir); },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const slot = String(req.body.slot || 'asset')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 60) || 'asset';
        cb(null, `${slot}_${Date.now()}${ext}`);
    }
});
const uploadSecCountdown = multer({
    storage: storageSecCountdown,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, ['.png', '.jpg', '.jpeg', '.webp'].includes(ext));
    }
});

// Central-control preset assets (team logos + player photos) are stored as files and
// referenced by path in presets.json — never as base64, to keep JSON small.
const storagePreset = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, presetsDir); },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const kind = String(req.body.kind || 'asset')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 32) || 'asset';
        const id = String(req.body.id || 'preset')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 48) || 'preset';
        cb(null, `${kind}_${id}_${Date.now()}${ext}`);
    }
});
const uploadPreset = multer({
    storage: storagePreset,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, ['.png', '.jpg', '.jpeg', '.webp'].includes(ext));
    }
});

// ==========================================
// 3. DEFAULT DATA GENERATORS
// ==========================================
const defaultMatchData = {
    "game_duration": "00:00", "game_number": 0, "winmatches": "none",
    "teamdata": {
        "blueteam": { "teamname": "BLUE TEAM", "score": "0", "logo": "", "totalgold": 0, "turret": 0, "lord": 0, "turtle": 0, "playerlist": Array(5).fill().map(() => ({ "name": "Player", "hero": "", "level": 0, "KDA": "0/0/0", "gold": 0, "spell": "idle", "banhero": "", "itemlist": ["idle","idle","idle","idle","idle","idle"] })) },
        "redteam": { "teamname": "RED TEAM", "score": "0", "logo": "", "totalgold": 0, "turret": 0, "lord": 0, "turtle": 0, "playerlist": Array(5).fill().map(() => ({ "name": "Player", "hero": "", "level": 0, "KDA": "0/0/0", "gold": 0, "spell": "idle", "banhero": "", "itemlist": ["idle","idle","idle","idle","idle","idle"] })) }
    }
};

const defaultTheme = {
    fontFile: "Renegade Pursuit.otf", useCustomFont: false, fontSizeMultiplier: 1.0, 
    images: { heroPickBg: "", lowerBg: "", lowerMidBg: "" },
    colors: { bluePrimary: "#00d2ff", blueDark: "#003e4d", redPrimary: "#ff2a2a", redDark: "#4d0000", scoreBlue: "#00d2ff", scoreRed: "#ff2a2a", upperBg: "#000000", lowerBg: "#0a0a0a", lowerMidBg: "#111111", heroPickBg: "#1e1e1e", logoTeamBg: "#000000", postDraftBg: "#1a1a1a", playerNameBg: "#000000", laneLogoBg: "rgba(0,0,0,0.8)", timerBlue: "#00d2ff", timerMid: "#ffffff", timerRed: "#ff2a2a", playerName: "#ffffff", phaseText: "#ffffff", laneIconType: "white", laneLogoBorder: "#ffffff", auraBan: "#ff0000", auraPick: "#ffffff", globalBorder: "rgba(255, 255, 255, 0.2)" },
    gradients: { upperBg: { enabled: false, colorB: "#333333", angle: 90 }, lowerBg: { enabled: false, colorB: "#333333", angle: 90 }, lowerMidBg: { enabled: false, colorB: "#333333", angle: 90 }, heroPickBg: { enabled: false, colorB: "#333333", angle: 90 }, logoTeamBg: { enabled: false, colorB: "#333333", angle: 90 }, sbBgTeamName: { enabled: false, colorB: "#333333", angle: 90 }, sbBgLogo: { enabled: false, colorB: "#333333", angle: 90 }, sbBgScore: { enabled: false, colorB: "#333333", angle: 90 }, sbBgCombined: { enabled: false, colorB: "#333333", angle: 90 }, sbBgBox1: { enabled: false, colorB: "#333333", angle: 90 }, sbBgSecondary: { enabled: false, colorB: "#333333", angle: 90 } },
    scoreboard: { teamNameBlue: "#00d2ff", teamNameRed: "#ff2a2a", bgTeamName: "#1e1e1e", bgLogo: "#000000", bgScore: "#000000", bgCombined: "#0a0a0a", bgBox1: "#1e1e1e", bgSecondary: "#1e1e1e", borderBottom: "rgba(255, 255, 255, 0.2)", activeFlag: "indonesia.png", disableGlow: false, disableShadow: false },
    opacity: { upper: 100, lower: 100, heroPick: 100, logoTeam: 60, postDraft: 100 },
    toggles: { hideLaneLogo: false, disableGlow: false, hidePattern: false, hidePostDraftBg: false, disableBoxShadow: false },
    animations: { banType: "pulse", pickType: "pulse", heroAnim: "fade" }
};

const defaultDraftData = {
    "draftdata": {
        "timer": "60", "timer_running": false, "current_phase": 0,
        "blueside": { "ban": [{},{},{},{},{}], "pick": [{},{},{},{},{}] },
        "redside": { "ban": [{},{},{},{},{}], "pick": [{},{},{},{},{}] }
    }
};

// ==========================================
// CENTRAL CONTROL PRESETS (teams + players)
// ==========================================
const PRESET_ROLES = ['gold', 'exp', 'mid', 'junggle', 'roam', 'sub'];
const ROLE_SLOT_ORDER = { gold: 0, exp: 1, mid: 2, junggle: 3, jungle: 3, roam: 4, sub: 5 };

function createDefaultPresets() {
    return { version: 1, teams: [], players: [] };
}

function makePresetId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePresetRole(value, fallback) {
    const role = String(value || '').toLowerCase();
    if (role === 'jungle' || role === 'junggle') return 'junggle';
    return PRESET_ROLES.includes(role) ? role : fallback;
}

function normalizePresets(input) {
    const base = createDefaultPresets();
    const source = (input && typeof input === 'object') ? input : {};
    const seenTeamIds = new Set();
    const seenPlayerIds = new Set();
    const now = Date.now();

    const rawTeams = Array.isArray(source.teams) ? source.teams.slice(0, 200) : [];
    base.teams = rawTeams.map(team => {
        const item = (team && typeof team === 'object') ? team : {};
        let id = String(item.id || '').trim().slice(0, 64) || makePresetId('team');
        if (seenTeamIds.has(id)) id = makePresetId('team');
        seenTeamIds.add(id);
        return {
            id,
            name: String(item.name || '').slice(0, 60),
            logo: String(item.logo || '').slice(0, 300),
            roster: [],
            createdAt: Number(item.createdAt) || now,
            updatedAt: Number(item.updatedAt) || now
        };
    });

    const rawPlayers = Array.isArray(source.players) ? source.players.slice(0, 2000) : [];
    base.players = rawPlayers.map(player => {
        const item = (player && typeof player === 'object') ? player : {};
        let id = String(item.id || '').trim().slice(0, 72) || makePresetId('player');
        if (seenPlayerIds.has(id)) id = makePresetId('player');
        seenPlayerIds.add(id);
        const teamId = String(item.teamId || '').trim();
        const hasOrder = Number.isFinite(Number(item.order)) && item.order !== null && item.order !== '';
        return {
            id,
            ign: String(item.ign || '').slice(0, 60),
            realName: String(item.realName || '').slice(0, 120),
            photo: String(item.photo || '').slice(0, 300),
            role: normalizePresetRole(item.role, 'gold'),
            teamId: seenTeamIds.has(teamId) ? teamId : '',
            ...(hasOrder ? { order: Number(item.order) } : {}),
            createdAt: Number(item.createdAt) || now,
            updatedAt: Number(item.updatedAt) || now
        };
    });

    // Roster is derived from players.teamId so the two views can never drift apart.
    // Imported Players Intro rosters carry an explicit `order`; fall back to role order.
    base.teams.forEach(team => {
        team.roster = base.players
            .filter(player => player.teamId === team.id)
            .sort((a, b) => {
                const aOrder = Number.isFinite(a.order) ? a.order : null;
                const bOrder = Number.isFinite(b.order) ? b.order : null;
                if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return aOrder - bOrder;
                if (aOrder !== null && bOrder === null) return -1;
                if (aOrder === null && bOrder !== null) return 1;
                return (ROLE_SLOT_ORDER[a.role] ?? 9) - (ROLE_SLOT_ORDER[b.role] ?? 9)
                    || a.ign.localeCompare(b.ign);
            })
            .map(player => player.id);
    });

    base.version = 1;
    return base;
}

function emptyPresetPlayer() {
    return {
        name: '', hero: '', level: 0, KDA: '0/0/0', gold: 0, spell: 'idle',
        banhero: '', lane: 'none', role: 'none', photo: '',
        itemlist: ['idle', 'idle', 'idle', 'idle', 'idle', 'idle']
    };
}

const SEC_ROLES = ['gold', 'exp', 'mid', 'jungle', 'roam'];

function createDefaultSecCountdown() {
    return {
        brand: { logo: 'Assets/SEC/sec-logo.png' },
        teams: [0, 1].map(teamIndex => ({
            name: teamIndex === 0 ? 'TEAM 1' : 'TEAM 2',
            score: '0',
            logo: '',
            players: SEC_ROLES.map(role => ({ name: '', role, photo: '' }))
        })),
        timer: {
            duration: 300,
            remaining: 300,
            running: false,
            startedAt: null,
            revealed: false,
            autoReveal: true
        },
        updatedAt: null
    };
}

function clampSecNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function normalizeSecCountdown(input) {
    const base = createDefaultSecCountdown();
    const state = (input && typeof input === 'object') ? input : {};
    const teams = Array.isArray(state.teams) ? state.teams : [];

    base.brand.logo = (state.brand && typeof state.brand.logo === 'string' && state.brand.logo.trim())
        ? state.brand.logo.trim()
        : 'Assets/SEC/sec-logo.png';

    base.teams = [0, 1].map(teamIndex => {
        const sourceTeam = (teams[teamIndex] && typeof teams[teamIndex] === 'object') ? teams[teamIndex] : {};
        const sourcePlayers = Array.isArray(sourceTeam.players) ? sourceTeam.players : [];
        return {
            name: typeof sourceTeam.name === 'string' ? sourceTeam.name.slice(0, 80) : base.teams[teamIndex].name,
            score: typeof sourceTeam.score === 'string'
                ? sourceTeam.score.slice(0, 20)
                : String(sourceTeam.score ?? '0').slice(0, 20),
            logo: typeof sourceTeam.logo === 'string' ? sourceTeam.logo : '',
            players: SEC_ROLES.map((role, playerIndex) => {
                const player = sourcePlayers.find(entry => entry && entry.role === role)
                    || sourcePlayers[playerIndex]
                    || {};
                return {
                    name: typeof player.name === 'string' ? player.name.slice(0, 60) : '',
                    role,
                    photo: typeof player.photo === 'string' ? player.photo : ''
                };
            })
        };
    });

    const sourceTimer = (state.timer && typeof state.timer === 'object') ? state.timer : {};
    const duration = Math.round(clampSecNumber(sourceTimer.duration, 0, 86400, 300));
    const remaining = clampSecNumber(sourceTimer.remaining, 0, duration, duration);
    base.timer = {
        duration,
        remaining: Math.round(remaining),
        running: sourceTimer.running === true,
        startedAt: sourceTimer.startedAt ? String(sourceTimer.startedAt) : null,
        revealed: sourceTimer.revealed === true,
        autoReveal: sourceTimer.autoReveal !== false
    };
    base.updatedAt = state.updatedAt ? String(state.updatedAt) : null;
    return base;
}

function secTimerRemaining(state, nowMs) {
    const timer = state.timer;
    if (timer.running && timer.startedAt) {
        const started = Date.parse(timer.startedAt);
        if (Number.isFinite(started)) {
            return Math.max(0, timer.duration - (nowMs - started) / 1000);
        }
    }
    return Math.max(0, Number(timer.remaining) || 0);
}

function presentSecCountdown(state, nowMs) {
    const presented = JSON.parse(JSON.stringify(state));
    if (presented.timer.running && presented.timer.startedAt) {
        presented.timer.remaining = Math.max(0, presented.timer.duration
            - (nowMs - Date.parse(presented.timer.startedAt)) / 1000);
        if (presented.timer.remaining <= 0) {
            presented.timer.remaining = 0;
            presented.timer.running = false;
            presented.timer.startedAt = null;
            if (presented.timer.autoReveal) presented.timer.revealed = true;
        }
    }
    presented.serverNow = nowMs;
    return presented;
}

function mergeSecCountdownConfig(current, incoming) {
    const next = normalizeSecCountdown(current);
    const source = (incoming && typeof incoming === 'object') ? incoming : {};

    if (Array.isArray(source.teams)) {
        const normalizedTeams = normalizeSecCountdown({ ...next, teams: source.teams }).teams;
        next.teams = normalizedTeams;
    }
    if (source.brand && typeof source.brand.logo === 'string') {
        next.brand.logo = source.brand.logo.trim() || 'Assets/SEC/sec-logo.png';
    }

    const sourceTimer = (source.timer && typeof source.timer === 'object') ? source.timer : {};
    if (sourceTimer.duration !== undefined) {
        const newDuration = Math.round(clampSecNumber(sourceTimer.duration, 0, 86400, next.timer.duration));
        const durationChanged = newDuration !== next.timer.duration;
        next.timer.duration = newDuration;
        if (!next.timer.running && durationChanged) {
            next.timer.remaining = newDuration;
            next.timer.revealed = false;
        }
        if (next.timer.remaining > newDuration) next.timer.remaining = newDuration;
    }
    if (sourceTimer.autoReveal !== undefined) {
        next.timer.autoReveal = sourceTimer.autoReveal !== false;
    }

    next.updatedAt = new Date().toISOString();
    return normalizeSecCountdown(next);
}

if (!fsSync.existsSync(matchDataPath)) fsSync.writeFileSync(matchDataPath, JSON.stringify(defaultMatchData, null, 2));
if (!fsSync.existsSync(draftDataPath)) fsSync.writeFileSync(draftDataPath, JSON.stringify(defaultDraftData, null, 2));
if (!fsSync.existsSync(prevDraftPath)) fsSync.writeFileSync(prevDraftPath, JSON.stringify(defaultDraftData, null, 2));
if (!fsSync.existsSync(themePath)) fsSync.writeFileSync(themePath, JSON.stringify(defaultTheme, null, 2)); 
if (!fsSync.existsSync(mapDrawPath)) fsSync.writeFileSync(mapDrawPath, JSON.stringify({ "drawdata": { "status": "idle" } }, null, 2));
if (!fsSync.existsSync(mvpDataPath)) fsSync.writeFileSync(mvpDataPath, JSON.stringify({ "mvp": null }, null, 2));
if (!fsSync.existsSync(schedulePath)) fsSync.writeFileSync(schedulePath, JSON.stringify({}, null, 2));
if (!fsSync.existsSync(notifPath)) fsSync.writeFileSync(notifPath, JSON.stringify({}, null, 2));
if (!fsSync.existsSync(playerLanePath)) fsSync.writeFileSync(playerLanePath, JSON.stringify({}, null, 2));
if (!fsSync.existsSync(secCountdownPath)) fsSync.writeFileSync(secCountdownPath, JSON.stringify(createDefaultSecCountdown(), null, 2));
if (!fsSync.existsSync(presetsPath)) fsSync.writeFileSync(presetsPath, JSON.stringify(createDefaultPresets(), null, 2));

if (!fsSync.existsSync(itemsPath)) {
    const defaultItems = [ "winter_truncheon", "immortality", "athena_shield", "blade_armor", "antique_cuirass", "oracle", "radiant_armor", "twilight_armor", "guardian_helmet", "sky_guardian_helmet", "thunder_belt", "cursed_helmet" ];
    fsSync.writeFileSync(itemsPath, JSON.stringify(defaultItems, null, 2));
}

// ==========================================
// 4. IN-MEMORY CACHE
// ==========================================
let cache = {
    matchdata: defaultMatchData, matchdraft: defaultDraftData, theme: defaultTheme,
    mapdraw: { "drawdata": { "status": "idle" } }, mvp: { "mvp": null }, schedule: {},
    notification: {}, secCountdown: createDefaultSecCountdown(), presets: createDefaultPresets()
};

async function loadCache() {
    try { cache.matchdata = JSON.parse(await fs.readFile(matchDataPath, 'utf8')); } catch(e) {}
    try { cache.matchdraft = JSON.parse(await fs.readFile(draftDataPath, 'utf8')); } catch(e) {}
    try { cache.theme = JSON.parse(await fs.readFile(themePath, 'utf8')); } catch(e) {}
    try { cache.mapdraw = JSON.parse(await fs.readFile(mapDrawPath, 'utf8')); } catch(e) {}
    try { cache.mvp = JSON.parse(await fs.readFile(mvpDataPath, 'utf8')); } catch(e) {}
    try { cache.schedule = JSON.parse(await fs.readFile(schedulePath, 'utf8')); } catch(e) {}
    try { cache.notification = JSON.parse(await fs.readFile(notifPath, 'utf8')); } catch(e) {}
    try { cache.secCountdown = normalizeSecCountdown(JSON.parse(await fs.readFile(secCountdownPath, 'utf8'))); } catch(e) {}
    try { cache.presets = normalizePresets(JSON.parse(await fs.readFile(presetsPath, 'utf8'))); } catch(e) {}
    console.log(">> In-Memory Cache Loaded!");
}
loadCache();

async function initFlagDB() {
    if (!fsSync.existsSync(flagJsonPath)) {
        try {
            const files = await fs.readdir(flagDir);
            const imageFiles = files.filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file));
            await fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2));
        } catch (error) { await fs.writeFile(flagJsonPath, JSON.stringify([], null, 2)); }
    }
}
initFlagDB();

// ==========================================
// 5. HELPER FUNCTIONS
// ==========================================
function getLocalIp() {
    const nets = os.networkInterfaces();
    let candidateIp = 'localhost';
    const virtualKeywords = ['virtual', 'vmware', 'vbox', 'virtualbox', 'wsl', 'hyper-v', 'vethernet', 'docker', 'vpn', 'zerotier', 'tap', 'tun'];
    for (const name of Object.keys(nets)) {
        const isVirtual = virtualKeywords.some(keyword => name.toLowerCase().includes(keyword));
        if (!isVirtual) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('ethernet')) { return net.address; }
                    candidateIp = net.address;
                }
            }
        }
    }
    return candidateIp;
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

async function listAssetNames(dir) {
    try {
        const files = await fs.readdir(dir);
        return files
            .filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file))
            .map(file => path.basename(file, path.extname(file)))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        return [];
    }
}

// ==========================================
// MVP <-> MATCH DATA LIVE BRIDGE
// The MVP display must not depend on mvpcontrol.html being the only writer.
// Any control panel that saves matchdata (control, postgame, central, presets)
// refreshes the currently selected MVP player here, then broadcasts mvp_update.
// ==========================================
function assetPathFromValue(value, folder) {
    if (!value) return '';
    const text = String(value).trim();
    if (!text || text === 'idle') return '';
    if (/^(https?:|data:|blob:|\/)/i.test(text)) return text;
    if (text.startsWith('Assets/')) return text;
    if (text.includes('/')) return text;
    return `Assets/${folder}/${text}.png`;
}

function resolveMvpPlayer(mvp, matchData) {
    if (!mvp || !matchData || !matchData.teamdata) return null;

    const teams = [
        { key: 'blueteam', side: 'blue' },
        { key: 'redteam', side: 'red' }
    ];

    // Preferred lookup: the checkbox id written by postgamecontrol.
    // Accepts mvp-blueteam-3, mvp-redteam-1, plus mvp-blue-0 / mvp-red-0 variants.
    const idMatch = String(mvp.checkboxId || '').match(/^mvp-(blueteam|redteam|blue|red)-(\d+)$/i);
    if (idMatch) {
        const rawTeam = idMatch[1].toLowerCase();
        const teamKey = rawTeam === 'blue' ? 'blueteam' : rawTeam === 'red' ? 'redteam' : rawTeam;
        const index = Number(idMatch[2]);
        const team = matchData.teamdata[teamKey];
        const player = team && Array.isArray(team.playerlist) ? team.playerlist[index] : null;
        if (player) {
            return { player, team, teamKey, index };
        }
    }

    // Fallback: find the player by nickname, preferring the recorded side.
    const wantedName = String(mvp.nickname || '').trim().toLowerCase();
    if (!wantedName) return null;

    const orderedTeams = mvp.side === 'red'
        ? [teams[1], teams[0]]
        : [teams[0], teams[1]];

    for (const teamInfo of orderedTeams) {
        const team = matchData.teamdata[teamInfo.key];
        const players = team && Array.isArray(team.playerlist) ? team.playerlist : [];
        const index = players.findIndex(player =>
            String((player && player.name) || '').trim().toLowerCase() === wantedName
        );
        if (index !== -1) {
            return { player: players[index], team, teamKey: teamInfo.key, index };
        }
    }

    return null;
}

function buildSyncedMvp(mvp, resolved) {
    const { player, team, teamKey, index } = resolved;
    const side = teamKey === 'blueteam' ? 'blue' : 'red';
    const playerName = String(player.name || mvp.nickname || 'PLAYER').trim() || 'PLAYER';

    const heroImg = player.hero
        ? assetPathFromValue(player.hero, 'HeroPick')
        : 'Assets/HeroPick/idle.png';

    let playerPhoto = (player.photo && String(player.photo).trim())
        ? String(player.photo).trim()
        : (player.name ? `Assets/player/${player.name}.png` : '');
    if (!playerPhoto) playerPhoto = 'Assets/player/playertemp.png';

    const items = Array.from({ length: 6 }, (_, itemIndex) => {
        const value = Array.isArray(player.itemlist) ? player.itemlist[itemIndex] : '';
        const text = value == null ? '' : String(value).trim();
        return (!text || text === 'idle') ? 'idle' : text;
    });

    const spellText = String(player.spell == null ? '' : player.spell).trim();
    const spell = (!spellText || spellText === 'idle') ? '' : spellText;

    return {
        ...mvp,
        checkboxId: `mvp-${teamKey}-${index}`,
        side,
        nickname: playerName,
        teamName: (team && team.teamname) ? team.teamname : (mvp.teamName || (side === 'blue' ? 'BLUE TEAM' : 'RED TEAM')),
        heroImg,
        playerPhoto,
        stats: {
            LVL: String(player.level == null ? '0' : player.level),
            KDA: String(player.KDA == null ? '0/0/0' : player.KDA),
            GOLD: String(player.gold == null ? '0' : player.gold),
            SPELL: spell,
            'ITEM 1': items[0],
            'ITEM 2': items[1],
            'ITEM 3': items[2],
            'ITEM 4': items[3],
            'ITEM 5': items[4],
            'ITEM 6': items[5]
        }
    };
}

function syncMvpFromMatchData({ broadcastUpdate = true, persist = true } = {}) {
    const currentMvp = cache.mvp && cache.mvp.mvp;
    if (!currentMvp) return false;

    const resolved = resolveMvpPlayer(currentMvp, cache.matchdata);
    if (!resolved) return false;

    const nextMvp = buildSyncedMvp(currentMvp, resolved);
    if (JSON.stringify(nextMvp) === JSON.stringify(currentMvp)) return false;

    cache.mvp = { ...cache.mvp, mvp: nextMvp };
    if (broadcastUpdate) broadcast({ type: 'mvp_update', data: nextMvp });
    if (persist) {
        fileQueue.enqueue(() => fs.writeFile(mvpDataPath, JSON.stringify(cache.mvp, null, 2)));
    }
    return true;
}

// ==========================================
// 6. WEBSOCKET SERVER
// ==========================================
function heartbeat() { this.isAlive = true; }

wss.on('connection', ws => {
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    ws.on('message', message => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'update') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(msg));
                    }
                });
            }
        } catch (e) { console.error('WebSocket Message Error:', e); }
    });
});

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate(); 
        ws.isAlive = false; ws.ping(); 
    });
}, 30000);

wss.on('close', function close() { clearInterval(interval); });

// ==========================================
// 7. API ROUTES
// ==========================================

// --- GITHUB ASSET UPDATER (WITH PROGRESS & STRUCTURAL PLACEMENT) ---
app.post('/api/sync-github', async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'github_config.json');
        
        if (!fsSync.existsSync(configPath)) {
            return res.status(400).json({ message: 'github_config.json not found on server.' });
        }

        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        const { owner, repo, branch, token } = config;

        const apiHeaders = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'FalseOverlayTool-Updater'
        };

        const rawHeaders = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3.raw'
        };

        const rawBaseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

        // 1. Fetch update.json (Manifest)
        const manifestResponse = await fetch(`${rawBaseUrl}/update.json`, { headers: rawHeaders });
        if (!manifestResponse.ok) throw new Error('Failed to read update.json from GitHub');
        
        const rawText = await manifestResponse.text();
        if (!rawText.trim()) throw new Error("update.json is empty or invalid!");
        
        const manifest = JSON.parse(rawText);
        const targets = manifest.files; 

        // 2. Fetch repo structure
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
        const treeResponse = await fetch(treeUrl, { headers: apiHeaders });
        if (!treeResponse.ok) throw new Error('Failed to read repository structure from GitHub API');
        
        const treeData = await treeResponse.json();
        const allRepoFiles = treeData.tree.filter(item => item.type === 'blob').map(item => item.path);

        let filesToDownload = new Set();

        // 3. Match targets
        for (const target of targets) {
            if (allRepoFiles.includes(target)) {
                filesToDownload.add(target);
            } else {
                const folderPrefix = target.endsWith('/') ? target : `${target}/`;
                const matchedFiles = allRepoFiles.filter(file => file.startsWith(folderPrefix));
                matchedFiles.forEach(file => filesToDownload.add(file));
            }
        }

        let updatedCount = 0;
        let errors = [];
        const totalFiles = filesToDownload.size;

        if (totalFiles === 0) {
            return res.json({ message: "No files matched the update target.", version: manifest.version });
        }

        // 4. Download and map exactly to the local directory structure
        for (const filePath of filesToDownload) {
            try {
                const fileUrl = `${rawBaseUrl}/${filePath}`;
                const fileRes = await fetch(fileUrl, { headers: rawHeaders });
                
                if (!fileRes.ok) {
                    errors.push(`${filePath} (Not Found)`);
                    continue;
                }

                const arrayBuffer = await fileRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // This logic exactly mirrors the GitHub repo folder path to the local project path
                const targetLocalPath = path.join(__dirname, filePath);
                const targetDir = path.dirname(targetLocalPath);
                
                if (!fsSync.existsSync(targetDir)) {
                    await fs.mkdir(targetDir, { recursive: true });
                }

                await fileQueue.enqueue(() => fs.writeFile(targetLocalPath, buffer));
                
                updatedCount++;
                
                // Broadcast Progress to active WebSockets
                broadcast({
                    type: 'sync_progress',
                    current: updatedCount,
                    total: totalFiles,
                    filename: filePath
                });

            } catch (err) {
                errors.push(`${filePath} (Error: ${err.message})`);
            }
        }

        res.json({ 
            message: `Update Complete. ${updatedCount} files updated.`, 
            version: manifest.version,
            errors: errors.length > 0 ? errors : null
        });

    } catch (error) {
        console.error("GitHub Sync Error:", error);
        res.status(500).json({ message: 'Failed to synchronize with GitHub.', error: error.message });
    }
});

// --- MATCH DATA API ---
app.get('/api/matchdata', (req, res) => { res.json(cache.matchdata); });
app.post('/api/matchdata', (req, res) => {
    try {
        cache.matchdata = req.body; 
        broadcast({ type: 'matchdata_update', data: cache.matchdata }); 
        broadcast({ type: 'update', data: { matchdata: cache.matchdata } }); 

        // Keep the selected MVP in step with every control panel that edits match data.
        syncMvpFromMatchData();
        
        const payload = JSON.stringify(cache.matchdata, null, 2);
        fileQueue.enqueue(() => fs.writeFile(matchDataPath, payload));
        res.json({ message: 'Match data saved' });
    } catch (error) { res.status(500).json({ message: 'Error saving match data' }); }
});

// --- MATCH DRAFT API ---
app.get('/api/matchdraft', (req, res) => { res.json(cache.matchdraft); });
app.post('/api/matchdraft', (req, res) => {
    try {
        cache.matchdraft = req.body; 
        broadcast({ type: 'draftdata_update', data: cache.matchdraft.draftdata });
        
        const payload = JSON.stringify(cache.matchdraft, null, 2);
        fileQueue.enqueue(() => fs.writeFile(draftDataPath, payload));
        res.json({ message: 'Draft data saved' });
    } catch (error) { res.status(500).json({ message: 'Error saving draft' }); }
});

// --- THEME API ---
app.get('/api/theme', (req, res) => { res.json(cache.theme); });
app.post('/api/theme', (req, res) => {
    try {
        cache.theme = req.body; 
        broadcast({ type: 'theme_update', data: cache.theme });
        
        const payload = JSON.stringify(cache.theme, null, 2);
        fileQueue.enqueue(() => fs.writeFile(themePath, payload));
        res.json({ message: 'Theme saved' });
    } catch (error) { res.status(500).json({ message: 'Error saving theme' }); }
});

app.post('/api/theme-reset', (req, res) => {
    try {
        cache.theme = defaultTheme; 
        broadcast({ type: 'theme_update', data: cache.theme });
        
        const payload = JSON.stringify(cache.theme, null, 2);
        fileQueue.enqueue(() => fs.writeFile(themePath, payload));
        res.json({ message: 'Theme Reset to Default', theme: cache.theme });
    } catch (error) { res.status(500).json({ message: 'Error resetting theme' }); }
});

// --- UNIFIED UPLOAD API (Theme Assets) ---
app.post('/api/upload-asset', uploadUnified.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    const targetField = req.body.targetField; 
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    try {
        if (!cache.theme.images) cache.theme.images = {};

        if (targetField === 'font' && (ext === '.ttf' || ext === '.otf')) {
            cache.theme.fontFile = req.file.originalname; 
            cache.theme.useCustomFont = true;
        } 
        else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
            if (targetField === 'heroPickBg') cache.theme.images.heroPickBg = req.file.originalname;
            else if (targetField === 'lowerBg') cache.theme.images.lowerBg = req.file.originalname;
            else if (targetField === 'lowerMidBg') cache.theme.images.lowerMidBg = req.file.originalname;
        }
        
        broadcast({ type: 'theme_update', data: cache.theme });
        
        const payload = JSON.stringify(cache.theme, null, 2);
        fileQueue.enqueue(() => fs.writeFile(themePath, payload));
        
        res.json({ message: 'Asset uploaded successfully', filename: req.file.originalname, updatedTheme: cache.theme });
    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ message: 'Error updating theme config' });
    }
});

// --- FLAG API ---
app.get('/api/flags', async (req, res) => {
    try {
        const files = await fs.readdir(flagDir);
        const imageFiles = files.filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file));
        fileQueue.enqueue(() => fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2)));
        res.json(imageFiles);
    } catch (error) { res.json([]); }
});

app.post('/api/upload-flag', uploadFlag.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    try {
        const files = await fs.readdir(flagDir);
        const imageFiles = files.filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file));
        fileQueue.enqueue(() => fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2)));
        res.json({ message: 'Flag uploaded successfully', filename: req.file.originalname, list: imageFiles });
    } catch (error) { res.status(500).json({ message: 'Error uploading flag' }); }
});

// --- EXTRAS API ---
app.get('/api/items', async (req, res) => {
    try { const data = await fs.readFile(itemsPath, 'utf8'); res.json(JSON.parse(data)); } catch (error) { res.json([]); }
});

app.get('/api/schedule', (req, res) => { res.json(cache.schedule); });
app.post('/api/schedule', (req, res) => {
    try {
        cache.schedule = req.body;
        broadcast({ type: 'schedule_update', data: cache.schedule });
        fileQueue.enqueue(() => fs.writeFile(schedulePath, JSON.stringify(cache.schedule, null, 2)));
        res.json({ message: 'Schedule saved' });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/mapdraw', (req, res) => { res.json(cache.mapdraw); });
app.post('/api/mapdraw', (req, res) => {
    try {
        cache.mapdraw = req.body;
        broadcast({ type: 'mapdraw_update', data: cache.mapdraw.drawdata });
        fileQueue.enqueue(() => fs.writeFile(mapDrawPath, JSON.stringify(cache.mapdraw, null, 2)));
        res.json({ message: 'Map saved' });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/mvp', (req, res) => {
    // Self-heal stale saved MVP data (e.g. after a server restart) before returning it.
    syncMvpFromMatchData({ broadcastUpdate: true, persist: true });
    res.json(cache.mvp);
});
app.post('/api/mvp', (req, res) => {
    try {
        cache.mvp = req.body;
        broadcast({ type: 'mvp_update', data: cache.mvp.mvp });
        fileQueue.enqueue(() => fs.writeFile(mvpDataPath, JSON.stringify(cache.mvp, null, 2)));
        res.json({ message: 'MVP saved' });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

// --- MVP CONTROL ASSETS & PHOTO UPLOAD ---
app.get('/api/mvp-assets', async (req, res) => {
    try {
        const [heroes, itemAssets, players] = await Promise.all([
            listAssetNames(heroPickDir),
            listAssetNames(itemSpellDir),
            listAssetNames(playerAssetDir)
        ]);
        res.json({ heroes, itemAssets, players });
    } catch (error) {
        res.status(500).json({ message: 'Error reading MVP assets' });
    }
});

app.post('/api/mvp-photo', uploadMvpPhoto.single('photo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded. Use PNG, JPG, JPEG, or WEBP.' });
    }
    res.json({
        message: 'MVP photo uploaded',
        filename: req.file.filename,
        path: `Assets/mvp/${req.file.filename}`
    });
});

// --- SEC COUNTDOWN CONTROL / DISPLAY ---
app.get('/api/sec-countdown', (req, res) => {
    try {
        const now = Date.now();
        const presented = presentSecCountdown(cache.secCountdown, now);
        if (presented.timer.running !== cache.secCountdown.timer.running
            || (presented.timer.remaining <= 0 && cache.secCountdown.timer.remaining > 0)) {
            cache.secCountdown = normalizeSecCountdown(presented);
            fileQueue.enqueue(() => fs.writeFile(secCountdownPath, JSON.stringify(cache.secCountdown, null, 2)));
        }
        res.json({ state: presented, serverNow: now });
    } catch (error) {
        console.error('SEC countdown load error:', error);
        res.status(500).json({ message: 'Error loading SEC countdown' });
    }
});

app.post('/api/sec-countdown', (req, res) => {
    try {
        const action = String(req.body.action || 'save');
        const now = Date.now();
        let next = normalizeSecCountdown(cache.secCountdown);

        if (action === 'save' || action === 'update') {
            next = mergeSecCountdownConfig(next, req.body.state || req.body);
        } else if (action === 'start') {
            let remaining = secTimerRemaining(next, now);
            if (remaining <= 0) {
                next.timer.revealed = false;
                remaining = next.timer.duration;
                next.timer.remaining = Math.round(remaining);
            }
            const elapsedBeforeStart = Math.max(0, (next.timer.duration - remaining) * 1000);
            next.timer.running = true;
            next.timer.startedAt = new Date(now - elapsedBeforeStart).toISOString();
            next.updatedAt = new Date(now).toISOString();
        } else if (action === 'pause') {
            next.timer.remaining = Math.round(secTimerRemaining(next, now));
            next.timer.running = false;
            next.timer.startedAt = null;
            next.updatedAt = new Date(now).toISOString();
        } else if (action === 'reset') {
            next.timer.remaining = next.timer.duration;
            next.timer.running = false;
            next.timer.startedAt = null;
            next.timer.revealed = false;
            next.updatedAt = new Date(now).toISOString();
        } else if (action === 'reveal') {
            next.timer.revealed = true;
            next.updatedAt = new Date(now).toISOString();
        } else if (action === 'hide-reveal' || action === 'hide') {
            next.timer.revealed = false;
            next.updatedAt = new Date(now).toISOString();
        } else if (action === 'complete') {
            next.timer.running = false;
            next.timer.startedAt = null;
            next.timer.remaining = 0;
            if (next.timer.autoReveal) next.timer.revealed = true;
            next.updatedAt = new Date(now).toISOString();
        } else if (action === 'set-duration') {
            const duration = Math.round(clampSecNumber(req.body.duration, 0, 86400, next.timer.duration));
            next.timer.duration = duration;
            next.timer.remaining = duration;
            next.timer.running = false;
            next.timer.startedAt = null;
            next.timer.revealed = false;
            next.updatedAt = new Date(now).toISOString();
        } else {
            return res.status(400).json({ message: `Unknown SEC countdown action: ${action}` });
        }

        next = normalizeSecCountdown(next);
        cache.secCountdown = next;
        const presented = presentSecCountdown(next, now);
        broadcast({ type: 'sec_countdown_update', data: presented, serverNow: now });
        fileQueue.enqueue(() => fs.writeFile(secCountdownPath, JSON.stringify(next, null, 2)));
        res.json({ message: 'SEC countdown saved', state: presented, serverNow: now });
    } catch (error) {
        console.error('SEC countdown save error:', error);
        res.status(500).json({ message: 'Error saving SEC countdown' });
    }
});

app.post('/api/sec-countdown/upload', uploadSecCountdown.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded. Use PNG, JPG, JPEG, or WEBP.' });
    }
    res.json({
        message: 'SEC countdown asset uploaded',
        filename: req.file.filename,
        path: `Assets/SEC/countdown/${req.file.filename}`,
        slot: req.body.slot || ''
    });
});

// --- CENTRAL CONTROL PRESETS API ---
app.get('/api/presets', (req, res) => {
    res.json(cache.presets);
});

app.post('/api/presets', (req, res) => {
    try {
        const next = normalizePresets(req.body);
        cache.presets = next;
        broadcast({ type: 'presets_update', data: next });
        fileQueue.enqueue(() => fs.writeFile(presetsPath, JSON.stringify(next, null, 2)));
        res.json({ message: 'Presets saved', presets: next });
    } catch (error) {
        console.error('Presets save error:', error);
        res.status(500).json({ message: 'Error saving presets' });
    }
});

app.post('/api/presets/upload', uploadPreset.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded. Use PNG, JPG, JPEG, or WEBP (max 5 MB).' });
    }
    res.json({
        message: 'Preset asset uploaded',
        filename: req.file.filename,
        path: `Assets/presets/${req.file.filename}`,
        kind: req.body.kind || 'asset'
    });
});

// Applies two team presets (and their chosen players) to the live match data in one
// server-side write, so it cannot race control.html's autosave.
app.post('/api/presets/apply', (req, res) => {
    try {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const resetStats = body.resetStats !== false;
        const resetScore = body.resetScore !== false;
        const resetDraft = body.resetDraft !== false;
        const resetMvp = body.resetMvp !== false;

        const teamById = new Map(cache.presets.teams.map(team => [team.id, team]));
        const playerById = new Map(cache.presets.players.map(player => [player.id, player]));
        const currentMatch = (cache.matchdata && typeof cache.matchdata === 'object') ? cache.matchdata : defaultMatchData;
        const currentTeams = currentMatch.teamdata || {};

        const resolveIds = (team, requested) => {
            const list = Array.isArray(requested) && requested.length
                ? requested
                : (Array.isArray(team.roster) ? team.roster : []);
            return list.map(id => String(id));
        };

        const buildTeam = (teamKey, teamId, requestedIds) => {
            const preset = teamById.get(String(teamId || ''));
            if (!preset) {
                throw new Error(`Unknown ${teamKey} preset id: ${teamId}`);
            }
            const returning = currentTeams[teamKey] || {};
            const existingPlayers = Array.isArray(returning.playerlist) ? returning.playerlist : [];
            const ids = resolveIds(preset, requestedIds);

            const playerlist = Array.from({ length: 5 }, (_, index) => {
                const presetPlayer = playerById.get(ids[index] || '');
                const previous = (existingPlayers[index] && typeof existingPlayers[index] === 'object')
                    ? existingPlayers[index] : {};
                const base = resetStats
                    ? emptyPresetPlayer()
                    : { ...emptyPresetPlayer(), ...previous, itemlist: Array.isArray(previous.itemlist)
                        ? previous.itemlist.slice(0, 6).concat(Array(6).fill('idle')).slice(0, 6)
                        : ['idle', 'idle', 'idle', 'idle', 'idle', 'idle'] };
                if (!presetPlayer) return base;
                return {
                    ...base,
                    name: presetPlayer.ign,
                    lane: presetPlayer.role,
                    role: presetPlayer.role,
                    photo: presetPlayer.photo
                };
            });

            return {
                ...returning,
                teamname: preset.name,
                logo: preset.logo,
                presetId: preset.id,
                score: resetScore ? '0' : (returning.score ?? '0'),
                totalgold: resetStats ? 0 : Number(returning.totalgold) || 0,
                turret: resetStats ? 0 : Number(returning.turret) || 0,
                lord: resetStats ? 0 : Number(returning.lord) || 0,
                turtle: resetStats ? 0 : Number(returning.turtle) || 0,
                playerlist
            };
        };

        const nextMatch = {
            ...currentMatch,
            game_duration: resetStats ? '00:00' : (currentMatch.game_duration || '00:00'),
            winmatches: resetScore ? 'none' : (currentMatch.winmatches || 'none'),
            teamdata: {
                ...currentTeams,
                blueteam: buildTeam('blueteam', body.blueTeamId, body.bluePlayerIds),
                redteam: buildTeam('redteam', body.redTeamId, body.redPlayerIds)
            }
        };

        cache.matchdata = nextMatch;
        broadcast({ type: 'matchdata_update', data: cache.matchdata });
        broadcast({ type: 'update', data: { matchdata: cache.matchdata } });
        fileQueue.enqueue(() => fs.writeFile(matchDataPath, JSON.stringify(cache.matchdata, null, 2)));

        if (resetDraft) {
            cache.matchdraft = JSON.parse(JSON.stringify(defaultDraftData));
            broadcast({ type: 'draftdata_update', data: cache.matchdraft.draftdata });
            fileQueue.enqueue(() => fs.writeFile(draftDataPath, JSON.stringify(cache.matchdraft, null, 2)));
        }

        if (resetMvp) {
            cache.mvp = { mvp: null };
            broadcast({ type: 'mvp_update', data: null });
            fileQueue.enqueue(() => fs.writeFile(mvpDataPath, JSON.stringify(cache.mvp, null, 2)));
        } else {
            // A preset apply can change names/heroes/photos without resetting the MVP.
            syncMvpFromMatchData();
        }

        res.json({
            message: 'Presets applied to match',
            matchdata: cache.matchdata,
            resetStats,
            resetDraft,
            resetMvp
        });
    } catch (error) {
        console.error('Presets apply error:', error);
        res.status(400).json({ message: error.message || 'Error applying presets' });
    }
});


app.get('/api/notification', (req, res) => { res.json(cache.notification || {}); });
app.post('/api/notification', (req, res) => {
    try {
        const videoId = req.body.videoId;
        if (!videoId) return res.status(400).json({ message: 'videoId is required' });

        const payload = { currentVideo: videoId, timestamp: Date.now() };
        cache.notification = payload;
        broadcast({ type: 'notification_trigger', videoId, timestamp: payload.timestamp });
        fileQueue.enqueue(() => fs.writeFile(notifPath, JSON.stringify(payload, null, 2)));
        res.json({ message: 'Notification triggered', videoId, timestamp: payload.timestamp });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/save-match-record', async (req, res) => {
    try {
        fileQueue.enqueue(async () => {
            if (!fsSync.existsSync(savedMatchDir)) await fs.mkdir(savedMatchDir, { recursive: true });
            for (let i = 6; i >= 1; i--) {
                const currentFile = path.join(savedMatchDir, `matchdata${i}.json`);
                const nextFile = path.join(savedMatchDir, `matchdata${i + 1}.json`);
                try { await fs.access(currentFile); await fs.rename(currentFile, nextFile); } catch (err) {}
            }
            const destPath = path.join(savedMatchDir, 'matchdata1.json');
            await fs.writeFile(destPath, JSON.stringify(cache.matchdata, null, 2));
        });
        res.json({ message: 'Match archived successfully (Queued)' });
    } catch (error) { res.status(500).json({ message: 'Error archiving match data' }); }
});

app.post('/api/archive-draft', (req, res) => {
    try {
        fileQueue.enqueue(() => fs.writeFile(prevDraftPath, JSON.stringify(cache.matchdraft, null, 2)));
        broadcast({ type: 'analyzer_update' });
        res.json({ message: 'Draft archived (Queued)' });
    } catch (error) { res.status(500).json({ message: 'Error archiving draft' }); }
});

app.get('/api/previousdraft', async (req, res) => {
    try { const data = await fs.readFile(prevDraftPath, 'utf8'); res.json(JSON.parse(data)); } catch (error) { res.status(500).json({ message: 'Error reading prev draft' }); }
});

app.post('/api/analyzer-control', (req, res) => {
    broadcast({ type: 'analyzer_control', action: req.body.action });
    res.json({ message: `Analyzer command sent` });
});

app.post('/api/delete-all-records', async (req, res) => {
    try {
        fileQueue.enqueue(async () => {
            if (fsSync.existsSync(savedMatchDir)) {
                const files = await fs.readdir(savedMatchDir);
                for (const file of files) {
                    await fs.unlink(path.join(savedMatchDir, file));
                }
            }
        });
        res.json({ message: 'All match records deleted successfully (Queued)' });
    } catch (error) {
        console.error("Delete all records error:", error);
        res.status(500).json({ message: 'Error deleting match records' });
    }
});

// --- IP MANAGEMENT API ---
app.get('/api/ips', (req, res) => {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ips.push({ name: name, ip: net.address });
            }
        }
    }
    res.json(ips);
});

app.post('/api/set-ip', (req, res) => {
    try {
        const newIp = req.body.ip;
        fsSync.writeFileSync(path.join(__dirname, 'public/serverip.txt'), newIp);
        res.json({ message: 'IP updated to ' + newIp });
    } catch (error) { 
        res.status(500).json({ message: 'Error saving IP' }); 
    }
});

// ==========================================
// 8. START SERVER
// ==========================================
const port = 3000;
const ipFilePath = path.join(__dirname, 'public/serverip.txt');

let localIp = getLocalIp(); 
if (fsSync.existsSync(ipFilePath)) {
    const savedIp = fsSync.readFileSync(ipFilePath, 'utf8').trim();
    if (savedIp) localIp = savedIp;
}

server.listen(port, async () => {
    console.log('=============================================');
    console.log(` SERVER STARTED (False MLBB OVERLAY TOOL V5) `);
    console.log(` Local:   http://localhost:${port}`);
    console.log(` Network: http://${localIp}:${port}`);
    console.log(` Status:  Cache & Async Queue Active! `);
    console.log('=============================================');

    try { await fs.writeFile(ipFilePath, localIp); } catch (error) {}
});