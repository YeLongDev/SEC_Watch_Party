// import-players-intro.js
// One-off/rerunnable importer: reads ../Players Intro/teams_data.js and writes the 9 teams
// + their players (with real names and transparent photos) into the Central Control presets.
//
// Usage: node scripts/import-players-intro.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INTRO_DIR = path.join(ROOT, '..', 'Players Intro');
const DATA_FILE = path.join(INTRO_DIR, 'teams_data.js');
const ASSET_DIR = path.join(ROOT, 'public', 'Assets', 'presets', 'playersintro');
const PRESETS_FILE = path.join(ROOT, 'public', 'database', 'presets.json');

const ROLE_BY_INDEX = ['gold', 'exp', 'mid', 'junggle', 'roam', 'sub'];
const INTRO_ROLE_LABELS = new Set([
    'TEAM CAPTAIN', 'CO-CAPTAIN', 'STAR PLAYER', 'STRATEGIST', 'ANCHOR', 'FLEX PLAYER'
]);

// Manual repairs where the intro data itself has a broken/truncated value.
const PLAYER_OVERRIDES = {
    'DTE 1:0': { ign: 'Artézia.', realName: 'Auljosh C. Romero' }
};

function sanitizeKey(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || 'team';
}

function decodeDataUrl(dataUrl) {
    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(String(dataUrl || ''));
    if (!match) return null;
    return Buffer.from(match[1], 'base64');
}

function loadIntroData() {
    const source = fs.readFileSync(DATA_FILE, 'utf8');
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Could not find SIKAT_TEAMS_PRESETS object in teams_data.js');
    return JSON.parse(source.slice(start, end + 1));
}

function buildPresets(introData, existing) {
    const teams = [];
    const players = [];
    const now = Date.now();
    const existingLogoByName = new Map(
        (existing && Array.isArray(existing.teams) ? existing.teams : [])
            .map(team => [String(team.name || '').toLowerCase(), team.logo || ''])
    );
    const existingRealNameByKey = new Map(
        (existing && Array.isArray(existing.players) ? existing.players : [])
            .map(player => [`${player.teamId}|${player.ign}`, player.realName || ''])
    );

    const teamNames = Object.keys(introData).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    let teamCounter = 0;

    teamNames.forEach(name => {
        const src = introData[name] || {};
        const teamKey = sanitizeKey(src.key || name);
        const teamId = `team_intro_${teamKey}`;
        const teamFolder = path.join(ASSET_DIR, teamKey);

        teams.push({
            id: teamId,
            name: String(src.teamName || name).slice(0, 60),
            logo: existingLogoByName.get(String(src.teamName || name).toLowerCase()) || '',
            roster: [],
            importedFrom: 'players-intro',
            createdAt: now + teamCounter,
            updatedAt: now + teamCounter
        });
        teamCounter += 1;

        const roster = Array.isArray(src.players) ? src.players : [];
        roster.forEach((player, index) => {
            const override = PLAYER_OVERRIDES[`${name}:${index}`] || {};
            const ign = String(override.ign || player.name || `Player ${index + 1}`).slice(0, 60);
            const rawTitle = String(player.title || '').trim();
            const realName = override.realName
                || existingRealNameByKey.get(`${teamId}|${ign}`)
                || (!INTRO_ROLE_LABELS.has(rawTitle.toUpperCase()) && rawTitle && rawTitle !== ign ? rawTitle : '');

            let photo = '';
            const buffer = decodeDataUrl(player.photo);
            if (buffer) {
                fs.mkdirSync(teamFolder, { recursive: true });
                const filename = `${String(index + 1).padStart(2, '0')}.png`;
                fs.writeFileSync(path.join(teamFolder, filename), buffer);
                photo = `Assets/presets/playersintro/${teamKey}/${filename}`;
            }

            players.push({
                id: `player_intro_${teamKey}_${index + 1}`,
                ign: ign.slice(0, 60),
                realName: realName.slice(0, 120),
                photo,
                role: ROLE_BY_INDEX[index] || 'sub',
                teamId,
                order: index,
                createdAt: now + teamCounter,
                updatedAt: now + teamCounter
            });
            teamCounter += 1;
        });
    });

    return { version: 1, teams, players };
}

function main() {
    if (!fs.existsSync(DATA_FILE)) {
        console.error(`Missing ${DATA_FILE}`);
        process.exit(1);
    }

    console.log('Reading Players Intro data…');
    const introData = loadIntroData();
    let existing = null;
    try {
        existing = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
    } catch (error) {
        existing = null;
    }
    console.log('Writing player photos to', ASSET_DIR);
    const presets = buildPresets(introData, existing);

    fs.mkdirSync(path.dirname(PRESETS_FILE), { recursive: true });
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));

    const playerCount = presets.players.length;
    console.log('');
    console.log(`Imported ${presets.teams.length} teams and ${playerCount} players.`);
    presets.teams.forEach(team => {
        const count = presets.players.filter(player => player.teamId === team.id).length;
        console.log(`  - ${team.name}: ${count} players`);
    });
    console.log('');
    console.log('Wrote', PRESETS_FILE);
    console.log('Restart node server.js (or POST /api/presets) to load the new data.');
}

main();
