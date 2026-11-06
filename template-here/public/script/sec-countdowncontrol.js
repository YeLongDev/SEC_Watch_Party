// public/script/sec-countdowncontrol.js
// Operator controls for the SEC match countdown display.

(() => {
    const API = '/api/sec-countdown';
    const ROLES = ['gold', 'exp', 'mid', 'jungle', 'roam'];
    const ROLE_META = {
        gold: { label: 'GOLD', icon: 'Assets/lane/gold.png' },
        exp: { label: 'EXP', icon: 'Assets/lane/exp.png' },
        mid: { label: 'MID', icon: 'Assets/lane/mid.png' },
        jungle: { label: 'JUNGLE', icon: 'Assets/lane/junggle.png' },
        roam: { label: 'ROAM', icon: 'Assets/lane/roam.png' }
    };

    const $ = id => document.getElementById(id);

    const brandUploadBtn = $('brandUploadBtn');
    const brandPreview = $('brandPreview');
    const brandMark = brandUploadBtn;
    const teamNameInputs = [$('teamNameInput0'), $('teamNameInput1')];
    const teamScoreInputs = [$('teamScoreInput0'), $('teamScoreInput1')];
    const teamLogoBtns = [$('teamLogoBtn0'), $('teamLogoBtn1')];
    const teamLogoImgs = [$('teamLogoPreview0'), $('teamLogoPreview1')];
    const teamLogoFallbacks = [$('teamLogoFallback0'), $('teamLogoFallback1')];
    const lineupGrid = $('lineupGrid');
    const timerLiveLabel = $('timerLiveLabel');
    const timerLiveValue = $('timerLiveValue');
    const timerLiveProgress = $('timerLiveProgress');
    const timerLiveStatus = $('timerLiveStatus');
    const timerModePill = $('timerModePill');
    const timerModeText = $('timerModeText');
    const durationMin = $('durationMin');
    const durationSec = $('durationSec');
    const autoRevealToggle = $('autoRevealToggle');
    const startBtn = $('startBtn');
    const pauseBtn = $('pauseBtn');
    const resetBtn = $('resetBtn');
    const revealBtn = $('revealBtn');
    const hideRevealBtn = $('hideRevealBtn');
    const saveBtn = $('saveBtn');
    const dirtyPill = $('dirtyPill');
    const connPill = $('connPill');
    const connText = $('connText');
    const timerPill = $('timerPill');
    const timerPillText = $('timerPillText');
    const statusLine = $('statusLine');
    const outputUrl = $('outputUrl');
    const copyUrlBtn = $('copyUrlBtn');
    const copyOutputBtn = $('copyOutputBtn');
    const openDisplayBtn = $('openDisplayBtn');
    const presetRow = $('presetRow');
    const assetUploadInput = $('assetUploadInput');
    const toast = $('toast');
    const previewFrame = $('previewFrame');
    const previewIframe = $('previewIframe');

    let serverState = null;
    let clockOffset = 0;
    let localDeadline = null;
    let dirty = false;
    let autoSaveTimer = null;
    let saveInFlight = null;
    let saveQueued = false;
    let completionSent = false;
    let pendingUploadSlot = null;
    let socket = null;
    let reconnectTimer = null;
    let toastTimer = null;
    let loadRetryTimer = null;

    const displayUrl = `${window.location.origin}/sec-countdown.html`;
    outputUrl.value = displayUrl;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function initials(name, fallback) {
        const words = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return fallback;
        return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
    }

    function deepCopy(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function getPlayer(teamIndex, role) {
        if (!serverState || !serverState.teams[teamIndex]) return null;
        return (serverState.teams[teamIndex].players || []).find(player => player.role === role) || null;
    }

    /* ---------------- Lineup markup ---------------- */

    function buildLineups() {
        lineupGrid.innerHTML = [0, 1].map(teamIndex => {
            const rows = ROLES.map(role => {
                const meta = ROLE_META[role];
                return `
                    <div class="player-row" data-team="${teamIndex}" data-role="${role}">
                        <button class="player-thumb" data-upload="team${teamIndex}-${role}" type="button"
                                title="Upload ${meta.label} portrait">
                            <img class="player-thumb-img" alt="">
                            <span class="player-thumb-fallback">${meta.label.slice(0, 2)}</span>
                        </button>
                        <div class="player-row-fields">
                            <span class="player-role-line">
                                <img src="${meta.icon}" alt="" aria-hidden="true">
                                <span>${meta.label}</span>
                            </span>
                            <input class="player-name-input" data-player-name data-team="${teamIndex}"
                                   data-role="${role}" type="text" maxlength="60"
                                   placeholder="PLAYER NAME" autocomplete="off">
                        </div>
                        <button class="row-clear" data-clear-photo="team${teamIndex}-${role}" type="button"
                                title="Remove portrait">×</button>
                    </div>
                `;
            }).join('');

            return `
                <div class="lineup-team ${teamIndex === 0 ? 'team-blue' : 'team-red'}">
                    <div class="lineup-head">
                        <span>TEAM ${teamIndex + 1}</span>
                        <span class="lineup-team-name" data-lineup-name="${teamIndex}">TEAM ${teamIndex + 1}</span>
                    </div>
                    <div class="player-rows">${rows}</div>
                </div>
            `;
        }).join('');
    }

    /* ---------------- Auth / asset previews ---------------- */

    function setAssetImage(img, fallbackEl, container, path, fallbackText, activeClass) {
        if (fallbackEl) fallbackEl.textContent = fallbackText;
        if (!path) {
            img.removeAttribute('src');
            img.style.display = 'none';
            container.classList.remove(activeClass);
            if (fallbackEl) fallbackEl.style.display = 'flex';
            return;
        }

        img.style.display = '';
        container.classList.add(activeClass);
        if (fallbackEl) fallbackEl.style.display = 'none';
        img.onload = () => {
            img.style.display = '';
            container.classList.add(activeClass);
            if (fallbackEl) fallbackEl.style.display = 'none';
        };
        img.onerror = () => {
            img.style.display = 'none';
            container.classList.remove(activeClass);
            if (fallbackEl) fallbackEl.style.display = 'flex';
        };
        img.src = path;
    }

    function renderAssetPreviews() {
        if (!serverState) return;

        setAssetImage(brandPreview, null, brandMark, serverState.brand && serverState.brand.logo,
            'SEC', 'has-logo');

        [0, 1].forEach(teamIndex => {
            const team = serverState.teams[teamIndex] || { name: '', logo: '' };
            const inputName = teamNameInputs[teamIndex].value || team.name;
            setAssetImage(teamLogoImgs[teamIndex], teamLogoFallbacks[teamIndex], teamLogoBtns[teamIndex],
                team.logo, initials(inputName, `T${teamIndex + 1}`), 'has-logo');

            ROLES.forEach(role => {
                const player = getPlayer(teamIndex, role) || { name: '', photo: '' };
                const row = lineupGrid.querySelector(`.player-row[data-team="${teamIndex}"][data-role="${role}"]`);
                if (!row) return;
                const thumb = row.querySelector('.player-thumb');
                const thumbImg = row.querySelector('.player-thumb-img');
                const thumbFallback = row.querySelector('.player-thumb-fallback');
                const nameInput = row.querySelector('.player-name-input');
                const playerName = nameInput.value || player.name;
                setAssetImage(thumbImg, thumbFallback, thumb, player.photo,
                    initials(playerName, ROLE_META[role].label.slice(0, 2)), 'has-photo');
            });
        });
    }

    /* ---------------- Render form / state ---------------- */

    function renderFormValues() {
        if (!serverState) return;

        if (!dirty) {
            [0, 1].forEach(teamIndex => {
                const team = serverState.teams[teamIndex] || {};
                teamNameInputs[teamIndex].value = team.name || '';
                teamScoreInputs[teamIndex].value = team.score === undefined || team.score === null
                    ? ''
                    : String(team.score);
                const lineupName = lineupGrid.querySelector(`[data-lineup-name="${teamIndex}"]`);
                if (lineupName) lineupName.textContent = team.name || `TEAM ${teamIndex + 1}`;
            });

            lineupGrid.querySelectorAll('.player-name-input').forEach(input => {
                if (document.activeElement === input) return;
                const player = getPlayer(Number(input.dataset.team), input.dataset.role);
                input.value = player ? (player.name || '') : '';
            });
        }

        if (document.activeElement !== durationMin && document.activeElement !== durationSec) {
            const duration = Math.max(0, Number(serverState.timer.duration) || 0);
            durationMin.value = Math.floor(duration / 60);
            durationSec.value = duration % 60;
        }

        autoRevealToggle.checked = serverState.timer.autoReveal !== false;
        updatePresetHighlight();
        updateLineupNames();
    }

    function updateLineupNames() {
        [0, 1].forEach(teamIndex => {
            const lineupName = lineupGrid.querySelector(`[data-lineup-name="${teamIndex}"]`);
            if (lineupName) lineupName.textContent = teamNameInputs[teamIndex].value || `TEAM ${teamIndex + 1}`;
        });
    }

    function updatePresetHighlight() {
        const duration = serverState ? Math.max(0, Number(serverState.timer.duration) || 0) : 0;
        presetRow.querySelectorAll('.chip').forEach(chip => {
            chip.classList.toggle('active', Number(chip.dataset.seconds) === duration);
        });
    }

    function currentRemaining() {
        if (!serverState) return 0;
        if (serverState.timer.running && localDeadline !== null) {
            return Math.max(0, (localDeadline - (Date.now() + clockOffset)) / 1000);
        }
        return Math.max(0, Number(serverState.timer.remaining) || 0);
    }

    function formatClock(remaining, duration) {
        const totalSeconds = Math.max(0, Math.ceil(remaining - 0.0001));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0 || duration >= 3600) {
            return `${hours}:${pad(minutes)}:${pad(seconds)}`;
        }
        return `${pad(minutes)}:${pad(seconds)}`;
    }

    function setMode(mode) {
        timerModePill.classList.remove('running', 'revealed');
        if (mode === 'running') timerModePill.classList.add('running');
        if (mode === 'revealed') timerModePill.classList.add('revealed');
        timerModeText.textContent = mode === 'running'
            ? 'RUNNING'
            : mode === 'revealed'
                ? 'REVEALED'
                : mode === 'paused'
                    ? 'PAUSED'
                    : 'IDLE';
    }

    function renderTimer() {
        if (!serverState) return;

        const remaining = currentRemaining();
        const duration = Math.max(0, Number(serverState.timer.duration) || 0);
        const revealed = !!serverState.timer.revealed;
        const running = !!serverState.timer.running && remaining > 0;

        const clock = formatClock(remaining, duration);
        timerLiveValue.textContent = clock;
        timerLiveValue.classList.toggle('is-long', clock.length > 5);
        timerLiveProgress.style.width = `${duration > 0 ? clamp((remaining / duration) * 100, 0, 100) : 0}%`;

        timerLiveLabel.textContent = revealed ? 'ROLE MATCHUPS' : 'MATCH BEGINS IN';
        if (running && revealed) {
            timerLiveStatus.textContent = 'ROLE PAIRS LIVE';
        } else if (running) {
            timerLiveStatus.textContent = 'COUNTDOWN RUNNING';
        } else if (revealed) {
            timerLiveStatus.textContent = 'LINEUPS REVEALED';
        } else if (remaining <= 0 && duration > 0) {
            timerLiveStatus.textContent = 'MATCH STARTING';
        } else if (duration > 0 && remaining < duration) {
            timerLiveStatus.textContent = 'COUNTDOWN PAUSED';
        } else {
            timerLiveStatus.textContent = 'READY TO START';
        }

        if (running) {
            setMode('running');
        } else if (revealed) {
            setMode('revealed');
        } else if (duration > 0 && remaining < duration) {
            setMode('paused');
        } else {
            setMode('idle');
        }

        timerPill.classList.remove('running', 'revealed');
        if (running) {
            timerPill.classList.add('running');
            timerPillText.textContent = 'TIMER RUNNING';
        } else if (revealed) {
            timerPill.classList.add('revealed');
            timerPillText.textContent = 'REVEALED';
        } else if (duration > 0 && remaining < duration) {
            timerPillText.textContent = 'PAUSED';
        } else {
            timerPillText.textContent = 'IDLE';
        }

        startBtn.disabled = running;
        pauseBtn.disabled = !running;
        revealBtn.disabled = revealed;
        hideRevealBtn.disabled = !revealed;

        if (running) {
            startBtn.textContent = 'COUNTDOWN RUNNING';
        } else if (remaining > 0 && remaining < duration) {
            startBtn.textContent = 'RESUME COUNTDOWN';
        } else {
            startBtn.textContent = 'START COUNTDOWN';
        }
    }

    function renderState() {
        if (!serverState) return;
        renderFormValues();
        renderAssetPreviews();
        renderTimer();
    }

    function applyState(nextState, serverNow, animateReveal) {
        if (!nextState || !nextState.timer) return;

        if (typeof serverNow === 'number' && Number.isFinite(serverNow)) {
            clockOffset = serverNow - Date.now();
        }

        serverState = nextState;
        localDeadline = serverState.timer.running
            ? (Date.now() + clockOffset) + Math.max(0, Number(serverState.timer.remaining) || 0) * 1000
            : null;

        if (serverState.timer.running && Number(serverState.timer.remaining) > 0) {
            completionSent = false;
        }

        renderState();
    }

    /* ---------------- Dirty / save ---------------- */

    function setStatus(message) {
        statusLine.textContent = message;
    }

    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            toast.classList.remove('show');
        }, 2800);
    }

    function markDirty() {
        dirty = true;
        dirtyPill.hidden = false;
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = window.setTimeout(() => {
            saveConfig({ silent: true, quiet: true });
        }, 900);
    }

    function clearDirty() {
        dirty = false;
        dirtyPill.hidden = true;
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
    }

    function buildConfig() {
        const config = deepCopy(serverState);
        config.brand = config.brand || {};
        config.brand.logo = serverState.brand && serverState.brand.logo
            ? serverState.brand.logo
            : 'Assets/SEC/sec-logo.png';
        config.teams = [0, 1].map(teamIndex => {
            const source = serverState.teams[teamIndex] || {};
            const players = (source.players || ROLES.map(role => ({ role, name: '', photo: '' }))).map(player => {
                const input = lineupGrid.querySelector(
                    `.player-name-input[data-team="${teamIndex}"][data-role="${player.role}"]`
                );
                return {
                    name: input ? input.value.trim() : (player.name || ''),
                    role: player.role,
                    photo: player.photo || ''
                };
            });
            return {
                name: teamNameInputs[teamIndex].value.trim(),
                score: teamScoreInputs[teamIndex].value.trim(),
                logo: source.logo || '',
                players
            };
        });
        config.timer = {
            duration: serverState.timer.duration,
            remaining: serverState.timer.remaining,
            running: serverState.timer.running,
            startedAt: serverState.timer.startedAt,
            revealed: serverState.timer.revealed,
            autoReveal: autoRevealToggle.checked
        };
        return config;
    }

    async function saveConfig(options = {}) {
        if (!serverState) return null;

        if (saveInFlight) {
            saveQueued = true;
            return saveInFlight;
        }

        const { silent = false, quiet = false } = options;
        const config = buildConfig();
        if (!quiet) setStatus('Saving team, lineup and timer data...');

        saveInFlight = (async () => {
            try {
                const response = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'save', state: config })
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                if (payload && payload.state) {
                    serverState = payload.state;
                }
                clearDirty();
                renderState();
                if (!quiet) {
                    setStatus('All team, lineup and timer data saved.');
                    if (!silent) showToast('Configuration saved.');
                }
                return payload;
            } catch (error) {
                console.error('SEC countdown save failed:', error);
                setStatus('Could not save changes. Check the server connection.');
                if (!quiet) showToast('Save failed. Check the server connection.', 'error');
                return null;
            } finally {
                saveInFlight = null;
                if (saveQueued) {
                    saveQueued = false;
                    saveConfig({ silent: true, quiet: true });
                }
            }
        })();

        return saveInFlight;
    }

    /* ---------------- Actions ---------------- */

    async function apiAction(action, extra = {}, options = {}) {
        if (!serverState) return null;
        const { saveFirst = false } = options;

        if (saveFirst && dirty) {
            await saveConfig({ silent: true, quiet: true });
        }

        try {
            const response = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...extra })
            });
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(errorBody.message || `HTTP ${response.status}`);
            }
            const payload = await response.json();
            if (payload && payload.state) {
                applyState(payload.state, payload.serverNow, true);
            }
            return payload;
        } catch (error) {
            console.error(`SEC countdown action "${action}" failed:`, error);
            setStatus(`Action failed: ${error.message}`);
            showToast(`Action failed: ${error.message}`, 'error');
            return null;
        }
    }

    function durationFromInputs() {
        const minutes = clamp(Number.parseInt(durationMin.value, 10) || 0, 0, 1440);
        const seconds = clamp(Number.parseInt(durationSec.value, 10) || 0, 0, 59);
        return minutes * 60 + seconds;
    }

    async function applyDuration() {
        if (!serverState) return;
        const duration = durationFromInputs();
        if (duration <= 0) {
            showToast('Duration must be greater than zero.', 'warn');
            return;
        }
        const payload = await apiAction('set-duration', { duration }, { saveFirst: true });
        if (payload) {
            setStatus(`Countdown duration set to ${formatClock(duration, duration)}.`);
            showToast(`Timer set to ${formatClock(duration, duration)}.`);
        }
    }

    async function startCountdown() {
        if (!serverState) return;
        if (currentRemaining() <= 0 || serverState.timer.revealed) {
            setStatus('Starting a fresh countdown...');
        }
        const payload = await apiAction('start', {}, { saveFirst: true });
        if (payload) {
            setStatus('Countdown started.');
            showToast('Countdown started.');
        }
    }

    async function pauseCountdown() {
        const payload = await apiAction('pause', {}, { saveFirst: true });
        if (payload) {
            setStatus('Countdown paused.');
            showToast('Countdown paused.', 'warn');
        }
    }

    async function resetCountdown() {
        const payload = await apiAction('reset', {}, { saveFirst: true });
        if (payload) {
            setStatus('Countdown reset to the configured duration.');
            showToast('Countdown reset.');
        }
    }

    async function revealPairs() {
        const payload = await apiAction('reveal', {}, { saveFirst: true });
        if (payload) {
            setStatus('Role pairs revealed.');
            showToast('Role pairs revealed.');
        }
    }

    async function hidePairs() {
        const payload = await apiAction('hide-reveal', {}, { saveFirst: true });
        if (payload) {
            setStatus('Roster view restored.');
            showToast('Roster view restored.', 'warn');
        }
    }

    /* ---------------- Uploads ---------------- */

    function openAssetPicker(slot) {
        if (!slot) return;
        pendingUploadSlot = slot;
        assetUploadInput.value = '';
        assetUploadInput.click();
    }

    async function uploadAsset(slot, file) {
        const formData = new FormData();
        formData.append('slot', slot);
        formData.append('file', file);

        setStatus(`Uploading ${file.name}...`);
        try {
            const response = await fetch(`${API}/upload`, { method: 'POST', body: formData });
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(errorBody.message || `HTTP ${response.status}`);
            }
            const payload = await response.json();
            const path = payload.path;

            if (slot === 'brand-logo') {
                serverState.brand.logo = path;
            } else {
                const match = /^team(\d)-(logo|gold|exp|mid|jungle|roam)$/.exec(slot);
                if (!match) throw new Error('Unknown asset slot.');
                const teamIndex = Number(match[1]);
                const asset = match[2];
                if (asset === 'logo') {
                    serverState.teams[teamIndex].logo = path;
                } else {
                    const player = getPlayer(teamIndex, asset);
                    if (player) player.photo = path;
                }
            }

            renderAssetPreviews();
            await saveConfig({ silent: true, quiet: true });
            setStatus(`Uploaded ${file.name}.`);
            showToast('Image uploaded and saved.');
        } catch (error) {
            console.error('SEC countdown upload failed:', error);
            setStatus(`Upload failed: ${error.message}`);
            showToast(`Upload failed: ${error.message}`, 'error');
        }
    }

    async function clearAsset(slot) {
        if (!serverState) return;
        if (slot === 'brand-logo') {
            serverState.brand.logo = 'Assets/SEC/sec-logo.png';
        } else {
            const match = /^team(\d)-(logo|gold|exp|mid|jungle|roam)$/.exec(slot);
            if (!match) return;
            const teamIndex = Number(match[1]);
            const asset = match[2];
            if (asset === 'logo') {
                serverState.teams[teamIndex].logo = '';
            } else {
                const player = getPlayer(teamIndex, asset);
                if (player) player.photo = '';
            }
        }
        renderAssetPreviews();
        await saveConfig({ silent: true, quiet: true });
        setStatus('Asset removed.');
        showToast('Asset removed.', 'warn');
    }

    /* ---------------- Websocket / state load ---------------- */

    function setConnection(online) {
        connPill.classList.toggle('online', online);
        connText.textContent = online ? 'CONNECTED' : 'OFFLINE';
    }

    async function loadState() {
        if (loadRetryTimer) {
            clearTimeout(loadRetryTimer);
            loadRetryTimer = null;
        }
        try {
            const response = await fetch(API, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            setConnection(true);
            applyState(payload.state, payload.serverNow, false);
        } catch (error) {
            console.error('SEC countdown state load failed:', error);
            setConnection(false);
            setStatus('Cannot reach the countdown API. Retrying...');
            loadRetryTimer = window.setTimeout(loadState, 2500);
        }
    }

    function connectSocket() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}`);

        socket.addEventListener('open', () => {
            setConnection(true);
            loadState();
        });

        socket.addEventListener('message', event => {
            let message;
            try { message = JSON.parse(event.data); } catch (error) { return; }
            if (message && message.type === 'sec_countdown_update' && message.data) {
                applyState(message.data, message.serverNow, true);
            }
        });

        socket.addEventListener('close', () => {
            setConnection(false);
            reconnectTimer = window.setTimeout(connectSocket, 1800);
        });

        socket.addEventListener('error', () => {
            if (socket) socket.close();
        });
    }

    /* ---------------- Preview sizing ---------------- */

    function fitPreview() {
        if (!previewFrame || !previewIframe) return;
        const width = previewFrame.clientWidth;
        if (!width) return;
        const scale = width / 1920;
        previewIframe.style.transform = `scale(${scale})`;
    }

    if ('ResizeObserver' in window) {
        new ResizeObserver(fitPreview).observe(previewFrame);
    }
    window.addEventListener('resize', fitPreview);

    /* ---------------- Events ---------------- */

    brandUploadBtn.addEventListener('click', () => openAssetPicker('brand-logo'));

    teamLogoBtns.forEach((button, teamIndex) => {
        button.addEventListener('click', () => openAssetPicker(`team${teamIndex}-logo`));
    });

    document.querySelectorAll('[data-clear-logo]').forEach(button => {
        button.addEventListener('click', () => clearAsset(`team${button.dataset.clearLogo}-logo`));
    });

    lineupGrid.addEventListener('click', event => {
        const uploadButton = event.target.closest('[data-upload]');
        if (uploadButton) {
            openAssetPicker(uploadButton.dataset.upload);
            return;
        }
        const clearButton = event.target.closest('[data-clear-photo]');
        if (clearButton) {
            clearAsset(clearButton.dataset.clearPhoto);
        }
    });

    assetUploadInput.addEventListener('change', () => {
        const file = assetUploadInput.files && assetUploadInput.files[0];
        const slot = pendingUploadSlot;
        pendingUploadSlot = null;
        if (!file || !slot) return;
        uploadAsset(slot, file);
    });

    teamNameInputs.forEach((input, teamIndex) => {
        input.addEventListener('input', () => {
            updateLineupNames();
            renderAssetPreviews();
            if (dirty && autoSaveTimer) {
                // Keep the same debounce path so the preview and server stay close.
            }
            markDirty();
            const lineupName = lineupGrid.querySelector(`[data-lineup-name="${teamIndex}"]`);
            if (lineupName) lineupName.textContent = input.value || `TEAM ${teamIndex + 1}`;
        });
    });

    teamScoreInputs.forEach(input => {
        input.addEventListener('input', markDirty);
    });

    lineupGrid.addEventListener('input', event => {
        const input = event.target.closest('.player-name-input');
        if (!input) return;
        const row = input.closest('.player-row');
        const thumbFallback = row.querySelector('.player-thumb-fallback');
        if (thumbFallback) {
            thumbFallback.textContent = initials(input.value, ROLE_META[input.dataset.role].label.slice(0, 2));
        }
        markDirty();
    });

    autoRevealToggle.addEventListener('change', () => {
        if (!serverState) return;
        serverState.timer.autoReveal = autoRevealToggle.checked;
        markDirty();
        renderTimer();
        setStatus(autoRevealToggle.checked
            ? 'Auto reveal enabled at 0:00.'
            : 'Auto reveal disabled. Use Reveal Pairs manually.');
    });

    startBtn.addEventListener('click', startCountdown);
    pauseBtn.addEventListener('click', pauseCountdown);
    resetBtn.addEventListener('click', resetCountdown);
    revealBtn.addEventListener('click', revealPairs);
    hideRevealBtn.addEventListener('click', hidePairs);
    $('setDurationBtn').addEventListener('click', applyDuration);
    saveBtn.addEventListener('click', () => saveConfig());

    presetRow.addEventListener('click', event => {
        const chip = event.target.closest('.chip');
        if (!chip) return;
        const seconds = Number(chip.dataset.seconds);
        if (!Number.isFinite(seconds)) return;
        durationMin.value = Math.floor(seconds / 60);
        durationSec.value = seconds % 60;
        applyDuration();
    });

    [durationMin, durationSec].forEach(input => {
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyDuration();
            }
        });
    });

    copyUrlBtn.addEventListener('click', () => copyText(displayUrl));
    copyOutputBtn.addEventListener('click', () => copyText(outputUrl.value));
    openDisplayBtn.addEventListener('click', () => window.open(displayUrl, '_blank'));

    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            saveConfig();
        }
    });

    async function copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                outputUrl.focus();
                outputUrl.select();
                document.execCommand('copy');
            }
            showToast('Display URL copied.');
        } catch (error) {
            console.error('Copy failed:', error);
            showToast('Copy failed. Select the URL manually.', 'error');
        }
    }

    /* ---------------- Ticker ---------------- */

    function tick() {
        if (!serverState) return;
        renderTimer();

        const remaining = currentRemaining();
        if (serverState.timer.running && remaining <= 0 && !completionSent) {
            completionSent = true;
            serverState.timer.running = false;
            serverState.timer.remaining = 0;
            localDeadline = null;
            if (serverState.timer.autoReveal !== false) {
                serverState.timer.revealed = true;
            }
            renderTimer();
            apiAction('complete');
        }
    }

    /* ---------------- Init ---------------- */

    buildLineups();
    fitPreview();
    connectSocket();
    loadState();
    window.setInterval(tick, 100);
    window.setInterval(fitPreview, 1000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadState();
    });
})();
