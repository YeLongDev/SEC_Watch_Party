// centralcontrol.js — Central Control panel
// Presets (teams + players), one-click match setup, live actions, embedded panels.
// All writes go through /api/*; images are stored as paths in Assets/presets/.

const $ = (id) => document.getElementById(id);

const ROLE_ORDER = ['gold', 'exp', 'mid', 'junggle', 'roam', 'sub'];
const ROLE_LABEL = { gold: 'Gold', exp: 'Exp', mid: 'Mid', junggle: 'Jungle', roam: 'Roam', sub: 'Sub' };

const PLAYERS_INTRO_URL = 'playersintro/';

const CONTROL_PAGES = [
    ['control.html', 'Draft Control'],
    ['controlban6.html', 'Draft Control (6 bans)'],
    ['postgamecontrol.html', 'Postgame Control'],
    ['mvpcontrol.html', 'MVP Control'],
    ['schedulecontrol.html', 'Schedule Control'],
    ['notifcontrol.html', 'Notification Control'],
    ['drawcontrol.html', 'Map Draw Control'],
    ['costumoverlaycontrol.html', 'Theme Control'],
    ['sec-countdowncontrol.html', 'SEC Countdown Control']
];

const DISPLAY_PAGES = [
    ['display.html', 'Draft Display'],
    ['display2.html', 'Draft Display 2'],
    ['displayban6.html', 'Draft Display (6 bans)'],
    ['display2ban6.html', 'Draft Display 2 (6 bans)'],
    ['displaycostum.html', 'Custom Draft Display'],
    ['displaycostumban6.html', 'Custom Draft (6 bans)'],
    ['postdraft.html', 'Post Draft'],
    ['postdraft2.html', 'Post Draft 2'],
    ['postdraftcostum.html', 'Custom Post Draft'],
    ['scoreboard.html', 'Scoreboard'],
    ['scoreboardcostum.html', 'Custom Scoreboard'],
    ['scoreboardocr.html', 'Scoreboard OCR'],
    ['scoreboardcostumocr.html', 'Custom Scoreboard OCR'],
    ['previousdraft.html', 'Previous Draft'],
    ['notifdisplay.html', 'Notification Display'],
    ['builds.html', 'Builds'],
    ['globalban.html', 'Global Ban'],
    ['sec-display.html', 'SEC Draft Display'],
    ['sec-scoreboard.html', 'SEC Scoreboard'],
    ['sec-postdraft.html', 'SEC Post Draft'],
    ['sec-countdown.html', 'SEC Countdown'],
    ['sec-mvpdisplay.html', 'SEC MVP Display'],
    ['mvpdisplay.html', 'MVP Display'],
    ['postgame.html', 'Postgame'],
    ['scheduledisplay.html', 'Schedule Display'],
    ['drawdisplay.html', 'Map Draw Display'],
    ['drawdisplay2.html', 'Map Draw Display 2'],
    ['drawdisplay3.html', 'Map Draw Display 3'],
    ['drawfinal.html', 'Map Draw Final'],
    [PLAYERS_INTRO_URL, 'Players Intro Studio']
];

const NOTIFICATIONS = [
    ['videoPlayer1', 'Turtle Spawn'],
    ['videoPlayer2', 'Blue Turtle'],
    ['videoPlayer3', 'Red Turtle'],
    ['videoPlayer4', 'Lord Spawn'],
    ['videoPlayer5', 'Blue Lord'],
    ['videoPlayer6', 'Red Lord'],
    ['videoPlayer7', 'First Blood'],
    ['videoPlayer8', 'Double Kill'],
    ['videoPlayer9', 'Triple Kill'],
    ['videoPlayer10', 'Maniac'],
    ['videoPlayer11', 'Savage'],
    ['videoPlayer12', 'Wipe Out']
];

let presets = { version: 1, teams: [], players: [] };
let matchData = null;
let mvpData = null;
let secState = null;

let editingTeamId = null;
let editingPlayerId = null;
let socket = null;
let reconnectTimer = null;
let toastTimer = null;
let panelFile = 'control.html';

// ---------------------------------------------------------------- helpers

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function roleLabel(role) {
    return ROLE_LABEL[role] || 'None';
}

function toast(message, type = '') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast show ${type}`.trim();
    clearTimeout(toastTimer);
    const duration = type === 'error' ? 6000 : 3200;
    toastTimer = setTimeout(() => { el.className = 'toast'; }, duration);
}

function setApplyStatus(message, type = '') {
    const el = $('applyStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `apply-status ${type}`.trim();
}

function teamById(id) {
    return presets.teams.find(team => team.id === id) || null;
}

function playerById(id) {
    return presets.players.find(player => player.id === id) || null;
}

function playersOfTeam(teamId) {
    return presets.players
        .filter(player => player.teamId === teamId)
        .sort((a, b) => {
            const aOrder = Number.isFinite(a.order) ? a.order : null;
            const bOrder = Number.isFinite(b.order) ? b.order : null;
            if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return aOrder - bOrder;
            if (aOrder !== null && bOrder === null) return -1;
            if (aOrder === null && bOrder !== null) return 1;
            return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
                || (a.ign || '').localeCompare(b.ign || '');
        });
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
    return data;
}

async function uploadAsset(file, kind, id) {
    if (!file) return '';
    const form = new FormData();
    form.append('kind', kind);
    form.append('id', id);
    form.append('file', file);
    const response = await fetch('/api/presets/upload', { method: 'POST', body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Upload failed (${response.status})`);
    return data.path || '';
}

// ---------------------------------------------------------------- save

async function savePresets() {
    try {
        const data = await postJson('/api/presets', presets);
        if (data.presets) presets = data.presets;
        renderPresets();
        toast('Presets saved.', 'ok');
        return true;
    } catch (error) {
        console.error('Save presets failed:', error);
        toast(`Could not save presets: ${error.message}`, 'error');
        return false;
    }
}

// ---------------------------------------------------------------- render: presets

function renderPresets() {
    renderTeamSelects();
    renderTeamList();
    renderPlayerList();
    renderSetup();
    renderPlayersIntro();
    updateCounters();
}

function updateCounters() {
    const el = $('presetCount');
    if (el) el.textContent = `${presets.teams.length} TEAMS / ${presets.players.length} PLAYERS`;
}

function renderTeamSelects() {
    const options = presets.teams
        .map(team => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name || 'Untitled team')}</option>`)
        .join('');

    const playerTeam = $('playerTeam');
    if (playerTeam) {
        const current = playerTeam.value;
        playerTeam.innerHTML = `<option value="">— Free agent —</option>${options}`;
        if (current && presets.teams.some(team => team.id === current)) playerTeam.value = current;
    }

    ['setupBlueTeam', 'setupRedTeam'].forEach(id => {
        const select = $(id);
        if (!select) return;
        const current = select.value;
        const placeholder = id === 'setupBlueTeam' ? 'Select blue team…' : 'Select red team…';
        select.innerHTML = `<option value="">${placeholder}</option>${options}`;
        if (current && presets.teams.some(team => team.id === current)) select.value = current;
    });
}

function renderTeamList() {
    const container = $('teamList');
    if (!container) return;
    if (!presets.teams.length) {
        container.innerHTML = '<div class="empty-list">No teams yet. Create your first team preset above.</div>';
        return;
    }

    container.innerHTML = presets.teams.map(team => {
        const roster = playersOfTeam(team.id).length;
        const logo = team.logo
            ? `<img src="${escapeHtml(team.logo)}" alt="" onerror="this.style.display='none'">`
            : `<div class="team-fallback" style="width:46px;height:46px;border-radius:10px;display:grid;place-items:center;background:#000;font-family:'Big Noodle Titling',sans-serif;color:#a855f7;">${escapeHtml((team.name || '?').slice(0, 2).toUpperCase())}</div>`;
        return `
            <div class="team-card" data-team="${escapeHtml(team.id)}">
                ${logo}
                <div class="card-main">
                    <div class="card-title">${escapeHtml(team.name || 'Untitled team')}</div>
                    <div class="card-sub">${roster} player${roster === 1 ? '' : 's'}</div>
                </div>
                <div class="card-actions">
                    <button type="button" class="btn" data-action="edit-team" data-id="${escapeHtml(team.id)}">EDIT</button>
                    <button type="button" class="btn danger" data-action="delete-team" data-id="${escapeHtml(team.id)}">DELETE</button>
                </div>
            </div>`;
    }).join('');
}

function renderPlayerList() {
    const container = $('playerList');
    if (!container) return;
    if (!presets.players.length) {
        container.innerHTML = '<div class="empty-list">No players yet. Create your first player preset above.</div>';
        return;
    }

    const sortKey = (player) => {
        const team = teamById(player.teamId);
        const order = Number.isFinite(player.order) ? String(player.order).padStart(4, '0') : '9999';
        return `${team ? team.name : '~Free agent'}|${order}|${ROLE_ORDER.indexOf(player.role)}|${player.ign}`;
    };

    const rows = [...presets.players].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    container.innerHTML = rows.map(player => {
        const team = teamById(player.teamId);
        const photo = player.photo || 'Assets/player/playertemp.png';
        return `
            <div class="player-card" data-player="${escapeHtml(player.id)}">
                <img src="${escapeHtml(photo)}" alt="" onerror="this.src='Assets/player/playertemp.png'">
                <div class="card-main">
                    <div class="card-title">${escapeHtml(player.ign || 'Unnamed player')}
                        <span class="role-tag">${escapeHtml(roleLabel(player.role))}</span>
                    </div>
                    ${player.realName ? `<div class="card-sub card-realname">${escapeHtml(player.realName)}</div>` : ''}
                    <div class="card-sub">${team ? escapeHtml(team.name) : 'Free agent'}</div>
                </div>
                <div class="card-actions">
                    <button type="button" class="btn" data-action="edit-player" data-id="${escapeHtml(player.id)}">EDIT</button>
                    <button type="button" class="btn danger" data-action="delete-player" data-id="${escapeHtml(player.id)}">DELETE</button>
                </div>
            </div>`;
    }).join('');
}

// ---------------------------------------------------------------- render: players intro

function renderPlayersIntro() {
    const container = $('introTeams');
    if (!container) return;

    const statusEl = $('introStatus');
    if (statusEl) {
        statusEl.textContent = `${presets.teams.length} team preset${presets.teams.length === 1 ? '' : 's'} available to the studio · ${presets.players.length} players`;
    }

    if (!presets.teams.length) {
        container.innerHTML = '<div class="empty-list">No team presets yet. Create or import teams in the PRESETS tab first.</div>';
        return;
    }

    const sortedTeams = [...presets.teams].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    container.innerHTML = sortedTeams.map(team => {
        const roster = playersOfTeam(team.id);
        const logo = team.logo
            ? `<img src="${escapeHtml(team.logo)}" alt="" onerror="this.style.display='none'">`
            : `<div class="intro-team-fallback">${escapeHtml((team.name || '?').slice(0, 2).toUpperCase())}</div>`;
        const photos = roster.slice(0, 6).map(player => `
            <span class="intro-player" title="${escapeHtml(player.ign)}${player.realName ? ` — ${escapeHtml(player.realName)}` : ''}">
                <img src="${escapeHtml(player.photo || 'Assets/player/playertemp.png')}" alt="" onerror="this.src='Assets/player/playertemp.png'">
                <em>${escapeHtml(player.ign || '—')}</em>
            </span>`).join('');
        return `
            <div class="intro-team-card">
                <div class="intro-team-head">
                    ${logo}
                    <div class="card-main">
                        <div class="card-title">${escapeHtml(team.name || 'Untitled team')}</div>
                        <div class="card-sub">${roster.length} player${roster.length === 1 ? '' : 's'}</div>
                    </div>
                    <a class="btn" href="${PLAYERS_INTRO_URL}" target="_blank" rel="noopener">OPEN STUDIO</a>
                </div>
                <div class="intro-player-strip">${photos || '<span class="card-sub">No players yet.</span>'}</div>
            </div>`;
    }).join('');
}

// ---------------------------------------------------------------- render: setup

function slotOptions(side, index, role, teamId, selectedId) {
    const teamPlayers = playersOfTeam(teamId);
    const freeAgents = playersOfTeam('');

    const option = (player) => {
        const selected = player.id === selectedId ? ' selected' : '';
        return `<option value="${escapeHtml(player.id)}"${selected}>${escapeHtml(player.ign || 'Unnamed')} · ${escapeHtml(roleLabel(player.role))}</option>`;
    };

    let html = '<option value="">— empty —</option>';
    if (teamPlayers.length) {
        html += `<optgroup label="Team players">${teamPlayers.map(option).join('')}</optgroup>`;
    }
    if (freeAgents.length) {
        html += `<optgroup label="Free agents">${freeAgents.map(option).join('')}</optgroup>`;
    }

    return `<div class="slot-row">
        <span class="slot-role">${escapeHtml(roleLabel(role))}</span>
        <select id="${side}-slot-${index}" data-role="${role}">${html}</select>
    </div>`;
}

function renderSetupSide(side, teamId) {
    const prefix = side === 'blue' ? 'Blue' : 'Red';
    const team = teamById(teamId);
    const nameEl = $(`setup${prefix}Name`);
    const logoEl = $(`setup${prefix}Logo`);
    const slotsEl = $(`setup${prefix}Slots`);

    if (nameEl) nameEl.textContent = team ? (team.name || 'Untitled team') : `${prefix.toUpperCase()} TEAM`;
    if (logoEl) {
        if (team && team.logo) {
            logoEl.src = team.logo;
            logoEl.hidden = false;
        } else {
            logoEl.removeAttribute('src');
            logoEl.hidden = true;
        }
    }

    if (!slotsEl) return;
    if (!team) {
        slotsEl.innerHTML = '<div class="empty-list">Choose a team preset to fill these slots.</div>';
        return;
    }

    const roster = playersOfTeam(team.id);
    const used = new Set();
    slotsEl.innerHTML = ROLE_ORDER.map((role, index) => {
        const auto = roster.find(player => player.role === role && !used.has(player.id));
        if (auto) used.add(auto.id);
        return slotOptions(side, index, role, team.id, auto ? auto.id : '');
    }).join('');
}

function renderSetup() {
    renderSetupSide('blue', $('setupBlueTeam') ? $('setupBlueTeam').value : '');
    renderSetupSide('red', $('setupRedTeam') ? $('setupRedTeam').value : '');
}

function getSlotIds(side) {
    return ROLE_ORDER.map((_, index) => {
        const select = $(`${side}-slot-${index}`);
        return select ? select.value : '';
    });
}

// ---------------------------------------------------------------- render: current match

function renderCurrentMatch() {
    const container = $('currentMatch');
    if (!container) return;
    if (!matchData || !matchData.teamdata) {
        container.innerHTML = '<div class="empty-list">No match data yet.</div>';
        return;
    }

    const renderTeam = (key, label) => {
        const team = matchData.teamdata[key] || {};
        const players = Array.isArray(team.playerlist) ? team.playerlist : [];
        return `<div class="current-team ${key === 'blueteam' ? 'blue' : 'red'}">
            <h3>${escapeHtml(team.teamname || label)} <span style="color:var(--muted);font-size:.75rem;">${escapeHtml(team.score ?? '0')}</span></h3>
            ${players.map(player => `
                <div class="current-player">
                    <span>${escapeHtml(player.name || '—')}</span>
                    <span>${escapeHtml(roleLabel(player.role || player.lane || 'none'))}</span>
                </div>`).join('')}
        </div>`;
    };

    container.innerHTML = renderTeam('blueteam', 'BLUE TEAM') + renderTeam('redteam', 'RED TEAM');
}

// ---------------------------------------------------------------- actions: teams

function resetTeamForm() {
    editingTeamId = null;
    $('teamForm').reset();
    $('teamSubmit').textContent = 'ADD TEAM';
    $('teamCancel').hidden = true;
    $('teamLogoPreview').hidden = true;
}

async function handleTeamSubmit(event) {
    event.preventDefault();
    const name = $('teamName').value.trim();
    if (!name) return;

    const id = editingTeamId || makeId('team');
    const file = $('teamLogo').files && $('teamLogo').files[0];
    const existing = teamById(id);
    let logo = existing ? existing.logo : '';

    if (file) {
        try {
            const path = await uploadAsset(file, 'team-logo', id);
            if (path) logo = path;
        } catch (error) {
            toast(`Logo upload failed: ${error.message}`, 'error');
            return;
        }
    }

    if (existing) {
        existing.name = name;
        existing.logo = logo;
        existing.updatedAt = Date.now();
    } else {
        presets.teams.push({ id, name, logo, roster: [], createdAt: Date.now(), updatedAt: Date.now() });
    }

    const saved = await savePresets();
    if (saved) {
        resetTeamForm();
        toast(existing ? 'Team updated.' : 'Team created.', 'ok');
    }
}

async function handleDeleteTeam(id) {
    const team = teamById(id);
    if (!team) return;
    const roster = playersOfTeam(id);
    if (roster.length) {
        toast(`Cannot delete ${team.name}: ${roster.length} player(s) still belong to it. Reassign them first.`, 'error');
        return;
    }
    if (!confirm(`Delete team "${team.name}"?`)) return;

    presets.teams = presets.teams.filter(item => item.id !== id);
    if ($('setupBlueTeam').value === id) $('setupBlueTeam').value = '';
    if ($('setupRedTeam').value === id) $('setupRedTeam').value = '';
    await savePresets();
    toast('Team deleted.', 'ok');
}

function editTeam(id) {
    const team = teamById(id);
    if (!team) return;
    editingTeamId = id;
    $('teamName').value = team.name || '';
    $('teamSubmit').textContent = 'UPDATE TEAM';
    $('teamCancel').hidden = false;
    $('teamLogo').value = '';
    if (team.logo) {
        $('teamLogoPreviewImg').src = team.logo;
        $('teamLogoPreview').hidden = false;
    } else {
        $('teamLogoPreview').hidden = true;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------------------------------------------------------- actions: players

function resetPlayerForm() {
    editingPlayerId = null;
    $('playerForm').reset();
    $('playerTeam').value = '';
    $('playerSubmit').textContent = 'ADD PLAYER';
    $('playerCancel').hidden = true;
    $('playerPhotoPreview').hidden = true;
}

async function handlePlayerSubmit(event) {
    event.preventDefault();
    const ign = $('playerIgn').value.trim();
    if (!ign) return;

    const id = editingPlayerId || makeId('player');
    const file = $('playerPhoto').files && $('playerPhoto').files[0];
    const existing = playerById(id);
    let photo = existing ? existing.photo : '';

    if (file) {
        try {
            const path = await uploadAsset(file, 'player-photo', id);
            if (path) photo = path;
        } catch (error) {
            toast(`Photo upload failed: ${error.message}`, 'error');
            return;
        }
    }

    const payload = {
        ign,
        realName: $('playerRealName').value.trim(),
        role: $('playerRole').value,
        teamId: $('playerTeam').value,
        photo
    };

    if (existing) {
        Object.assign(existing, payload, { updatedAt: Date.now() });
    } else {
        presets.players.push({ id, ...payload, createdAt: Date.now(), updatedAt: Date.now() });
    }

    const saved = await savePresets();
    if (saved) {
        resetPlayerForm();
        toast(existing ? 'Player updated.' : 'Player created.', 'ok');
    }
}

async function handleDeletePlayer(id) {
    const player = playerById(id);
    if (!player) return;
    if (!confirm(`Delete player "${player.ign}"?`)) return;

    presets.players = presets.players.filter(item => item.id !== id);
    await savePresets();
    toast('Player deleted.', 'ok');
}

function editPlayer(id) {
    const player = playerById(id);
    if (!player) return;
    editingPlayerId = id;
    $('playerIgn').value = player.ign || '';
    $('playerRealName').value = player.realName || '';
    $('playerRole').value = player.role || 'gold';
    $('playerTeam').value = player.teamId || '';
    $('playerPhoto').value = '';
    $('playerSubmit').textContent = 'UPDATE PLAYER';
    $('playerCancel').hidden = false;
    if (player.photo) {
        $('playerPhotoPreviewImg').src = player.photo;
        $('playerPhotoPreview').hidden = false;
    } else {
        $('playerPhotoPreview').hidden = true;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------------------------------------------------------- actions: apply

async function applyToMatch() {
    const blueTeamId = $('setupBlueTeam').value;
    const redTeamId = $('setupRedTeam').value;

    if (!blueTeamId || !redTeamId) {
        setApplyStatus('Select both a blue and a red team preset first.', 'error');
        return;
    }
    if (blueTeamId === redTeamId) {
        setApplyStatus('Blue and red must be different teams.', 'error');
        return;
    }

    const blue = teamById(blueTeamId);
    const red = teamById(redTeamId);
    const summary = `Apply ${blue.name} vs ${red.name} to the match?\n\nThis replaces team names, logos and all 10 players.`;
    if (!confirm(summary)) return;

    const button = $('applyBtn');
    button.disabled = true;
    setApplyStatus('Applying presets…');

    const payload = {
        blueTeamId,
        redTeamId,
        bluePlayerIds: getSlotIds('blue'),
        redPlayerIds: getSlotIds('red'),
        resetStats: $('resetStats').checked,
        resetScore: $('resetScore').checked,
        resetDraft: $('resetDraft').checked,
        resetMvp: $('resetMvp').checked
    };

    try {
        const data = await postJson('/api/presets/apply', payload);
        if (data.matchdata) matchData = data.matchdata;
        renderCurrentMatch();
        setApplyStatus(`Applied ${blue.name} vs ${red.name}. control.html and every display are updated.`, 'ok');
        toast('Presets applied to the match.', 'ok');
    } catch (error) {
        console.error('Apply failed:', error);
        setApplyStatus(`Apply failed: ${error.message}`, 'error');
        toast('Could not apply presets.', 'error');
    } finally {
        button.disabled = false;
    }
}

// ---------------------------------------------------------------- live actions

function formatSeconds(value) {
    const total = Math.max(0, Math.round(Number(value) || 0));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderSecState() {
    const el = $('secReadout');
    if (!el) return;
    if (!secState || !secState.timer) {
        el.textContent = 'Reading timer…';
        return;
    }
    const timer = secState.timer;
    const status = timer.running ? 'RUNNING' : (timer.revealed ? 'REVEALED' : 'PAUSED');
    el.textContent = `${formatSeconds(timer.remaining)} / ${formatSeconds(timer.duration)} · ${status}`;
}

async function secAction(action) {
    try {
        const data = await postJson('/api/sec-countdown', { action });
        if (data.state) {
            secState = data.state;
            renderSecState();
        }
        toast(`SEC countdown: ${action}.`, 'ok');
    } catch (error) {
        toast(`Countdown action failed: ${error.message}`, 'error');
    }
}

function renderMvp() {
    const el = $('mvpReadout');
    if (!el) return;
    if (mvpData && mvpData.mvp) {
        const mvp = mvpData.mvp;
        el.textContent = `MVP: ${mvp.nickname || 'Player'}${mvp.teamName ? ` — ${mvp.teamName}` : ''} (${mvp.side || 'blue'} side)`;
    } else {
        el.textContent = 'No MVP selected. Tick one in postgame control.';
    }
}

async function hideMvp() {
    try {
        await postJson('/api/mvp', { mvp: null });
        mvpData = { mvp: null };
        renderMvp();
        toast('MVP display hidden.', 'ok');
    } catch (error) {
        toast(`Could not hide MVP: ${error.message}`, 'error');
    }
}

async function triggerNotification(videoId, label) {
    try {
        await postJson('/api/notification', { videoId });
        $('notifReadout').textContent = `Sent: ${label} (${videoId})`;
        toast(`Notification: ${label}`, 'ok');
    } catch (error) {
        toast(`Notification failed: ${error.message}`, 'error');
    }
}

async function archiveDraft() {
    try {
        await postJson('/api/archive-draft', {});
        $('recordReadout').textContent = 'Current draft saved to previous draft.';
        toast('Draft archived.', 'ok');
    } catch (error) {
        toast(`Archive failed: ${error.message}`, 'error');
    }
}

async function saveMatchRecord() {
    try {
        await postJson('/api/save-match-record', {});
        $('recordReadout').textContent = 'Match data archived into savedmatch/ (rotates 7 records).';
        toast('Match record archived.', 'ok');
    } catch (error) {
        toast(`Archive failed: ${error.message}`, 'error');
    }
}

async function deleteAllRecords() {
    if (!confirm('Delete every archived match record?')) return;
    if (!confirm('This cannot be undone. Continue?')) return;
    try {
        await postJson('/api/delete-all-records', {});
        $('recordReadout').textContent = 'All archived match records deleted.';
        toast('All records deleted.', 'ok');
    } catch (error) {
        toast(`Delete failed: ${error.message}`, 'error');
    }
}

// ---------------------------------------------------------------- panels & links

function populatePanelSelect() {
    const select = $('panelSelect');
    if (!select) return;
    select.innerHTML = CONTROL_PAGES
        .map(([file, label]) => `<option value="${file}">${escapeHtml(label)} — ${file}</option>`)
        .join('');
    select.value = panelFile;
}

function setPanel(file) {
    panelFile = file;
    const frame = $('panelFrame');
    const link = $('openPanelBtn');
    if (frame) frame.src = file;
    if (link) link.href = file;
    const select = $('panelSelect');
    if (select) select.value = file;
}

function renderLinks() {
    const grid = $('linkGrid');
    if (!grid) return;
    const groups = [
        ['CONTROL', CONTROL_PAGES],
        ['DISPLAY / UTILITY', DISPLAY_PAGES]
    ];

    grid.innerHTML = groups.map(([group, files]) => files.map(([file, label]) => `
        <div class="link-card">
            <div class="tag">${escapeHtml(group)}</div>
            <div class="name">${escapeHtml(label)}</div>
            <div class="card-sub">${escapeHtml(file)}</div>
            <div class="actions">
                <a class="btn" href="${escapeHtml(file)}" target="_blank" rel="noopener">LOCAL</a>
                <a class="btn" href="http://${escapeHtml(window.location.hostname)}:3000/${escapeHtml(file)}" target="_blank" rel="noopener">NET IP</a>
            </div>
        </div>`).join('')).join('');
}

// ---------------------------------------------------------------- websocket

function setConnection(connected) {
    const pill = $('connStatus');
    const text = $('connText');
    if (pill) pill.classList.toggle('connected', connected);
    if (text) text.textContent = connected ? 'CONNECTED' : 'OFFLINE';
}

function connectSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onopen = () => {
        clearTimeout(reconnectTimer);
        setConnection(true);
    };

    socket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'presets_update' && msg.data) {
                presets = msg.data;
                renderPresets();
            } else if (msg.type === 'matchdata_update' && msg.data) {
                matchData = msg.data;
                renderCurrentMatch();
            } else if (msg.type === 'mvp_update') {
                mvpData = { mvp: msg.data || null };
                renderMvp();
            } else if (msg.type === 'sec_countdown_update' && msg.data) {
                secState = msg.data;
                renderSecState();
            }
        } catch (error) {
            console.error('Central control WS error:', error);
        }
    };

    socket.onclose = () => {
        setConnection(false);
        reconnectTimer = setTimeout(connectSocket, 1800);
    };

    socket.onerror = () => {
        try { socket.close(); } catch (error) {}
    };
}

// ---------------------------------------------------------------- bind & init

function switchTab(name) {
    document.querySelectorAll('#tabs button').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${name}`);
    });
}

function bindEvents() {
    document.querySelectorAll('#tabs button').forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    $('teamForm').addEventListener('submit', handleTeamSubmit);
    $('playerForm').addEventListener('submit', handlePlayerSubmit);

    $('teamCancel').addEventListener('click', resetTeamForm);
    $('playerCancel').addEventListener('click', resetPlayerForm);

    $('teamList').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const id = button.dataset.id;
        if (button.dataset.action === 'edit-team') editTeam(id);
        if (button.dataset.action === 'delete-team') handleDeleteTeam(id);
    });

    $('playerList').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const id = button.dataset.id;
        if (button.dataset.action === 'edit-player') editPlayer(id);
        if (button.dataset.action === 'delete-player') handleDeletePlayer(id);
    });

    $('teamLogo').addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        $('teamLogoPreviewImg').src = URL.createObjectURL(file);
        $('teamLogoPreview').hidden = false;
    });

    $('playerPhoto').addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        $('playerPhotoPreviewImg').src = URL.createObjectURL(file);
        $('playerPhotoPreview').hidden = false;
    });

    ['setupBlueTeam', 'setupRedTeam'].forEach(id => {
        $(id).addEventListener('change', renderSetup);
    });

    $('applyBtn').addEventListener('click', applyToMatch);
    $('reloadBtn').addEventListener('click', () => loadAll());
    const refreshIntro = $('refreshIntroBtn');
    if (refreshIntro) refreshIntro.addEventListener('click', () => loadAll());

    document.querySelectorAll('[data-sec]').forEach(button => {
        button.addEventListener('click', () => secAction(button.dataset.sec));
    });

    $('hideMvpBtn').addEventListener('click', hideMvp);
    $('archiveDraftBtn').addEventListener('click', archiveDraft);
    $('saveRecordBtn').addEventListener('click', saveMatchRecord);
    $('deleteRecordsBtn').addEventListener('click', deleteAllRecords);

    const notif = $('notifButtons');
    if (notif) {
        notif.innerHTML = NOTIFICATIONS
            .map(([id, label]) => `<button type="button" class="btn" data-video="${id}">${escapeHtml(label)}</button>`)
            .join('');
        notif.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-video]');
            if (!button) return;
            const entry = NOTIFICATIONS.find(([id]) => id === button.dataset.video);
            triggerNotification(button.dataset.video, entry ? entry[1] : button.dataset.video);
        });
    }

    $('panelSelect').addEventListener('change', (event) => setPanel(event.target.value));
    $('refreshPanelBtn').addEventListener('click', () => {
        const frame = $('panelFrame');
        if (frame) frame.src = frame.src;
    });
}

async function loadAll() {
    try {
        const [presetData, match, mvp, sec] = await Promise.all([
            fetch('/api/presets').then(r => r.json()),
            fetch('/api/matchdata').then(r => r.json()),
            fetch('/api/mvp').then(r => r.json()),
            fetch('/api/sec-countdown').then(r => r.json())
        ]);
        presets = presetData || { version: 1, teams: [], players: [] };
        matchData = match;
        mvpData = mvp;
        secState = sec && sec.state ? sec.state : null;
    } catch (error) {
        console.error('Central control load failed:', error);
        toast('Could not load server data.', 'error');
    }

    renderPresets();
    renderCurrentMatch();
    renderMvp();
    renderSecState();
}

function init() {
    populatePanelSelect();
    renderLinks();
    bindEvents();
    connectSocket();
    loadAll();
}

init();
