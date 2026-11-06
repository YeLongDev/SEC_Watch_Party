// public/script/sec-countdown.js
// SEC match countdown display: live timer, team rail, and role-pair reveal.

(() => {
    const ROLES = ['gold', 'exp', 'mid', 'jungle', 'roam'];
    const ROLE_META = {
        gold: { label: 'GOLD', icon: 'Assets/lane/gold.png' },
        exp: { label: 'EXP', icon: 'Assets/lane/exp.png' },
        mid: { label: 'MID', icon: 'Assets/lane/mid.png' },
        jungle: { label: 'JUNGLE', icon: 'Assets/lane/junggle.png' },
        roam: { label: 'ROAM', icon: 'Assets/lane/roam.png' }
    };

    const stage = document.getElementById('countdownStage');
    const roleGrid = document.getElementById('roleGrid');
    const brandLogo = document.getElementById('brandLogo');
    const timerDisplay = document.getElementById('timerDisplay');
    const timerProgress = document.getElementById('timerProgress');
    const timerStatus = document.getElementById('timerStatus');
    const timerEyebrow = document.getElementById('timerEyebrow');
    const revealState = document.getElementById('revealState');
    const rosterMode = document.getElementById('rosterMode');
    const revealFlash = document.getElementById('revealFlash');

    let localState = null;
    let clockOffset = 0;
    let localDeadline = null;
    let completionRequested = false;
    let revealKnown = false;
    let socket = null;
    let reconnectTimer = null;
    let statusPollTimer = null;

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function initials(name, fallback) {
        const words = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return fallback;
        return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
    }

    function buildRoleGrid() {
        roleGrid.innerHTML = ROLES.map(role => {
            const meta = ROLE_META[role];
            const cards = [0, 1].map(teamIndex => `
                <article class="player-card ${teamIndex === 0 ? 'team-blue' : 'team-red'}"
                         data-team="${teamIndex}" data-role="${role}">
                    <div class="player-photo">
                        <img class="player-photo-img" src="" alt="" onerror="this.classList.add('is-broken')">
                        <div class="photo-fallback">
                            <img src="${meta.icon}" alt="" aria-hidden="true">
                            <span data-fallback>${teamIndex === 0 ? 'T1' : 'T2'}</span>
                        </div>
                    </div>
                    <div class="player-body">
                        <span class="player-team">TEAM ${teamIndex + 1} · ${meta.label}</span>
                        <span class="player-name" data-player-name>PLAYER</span>
                    </div>
                </article>
            `).join('');

            return `
                <div class="role-column" data-role="${role}">
                    <div class="role-heading">
                        <img class="role-icon" src="${meta.icon}" alt="" aria-hidden="true">
                        <span class="role-name">${meta.label}</span>
                    </div>
                    <div class="role-pair">${cards}</div>
                </div>
            `;
        }).join('');
    }

    function setBrandLogo(path) {
        const source = path || 'Assets/SEC/sec-logo.png';
        brandLogo.style.visibility = '';
        brandLogo.onload = () => { brandLogo.style.visibility = ''; };
        brandLogo.onerror = () => { brandLogo.style.visibility = 'hidden'; };
        brandLogo.src = source;
    }

    function renderTeam(teamIndex, team) {
        const name = document.getElementById(`teamName${teamIndex}`);
        const score = document.getElementById(`teamScore${teamIndex}`);
        const logoImg = document.getElementById(`teamLogo${teamIndex}`);
        const fallback = document.getElementById(`teamLogoFallback${teamIndex}`);
        const logoWrap = logoImg.closest('.team-logo');

        name.textContent = team.name || `TEAM ${teamIndex + 1}`;
        score.textContent = (team.score === undefined || team.score === null || team.score === '')
            ? '0'
            : String(team.score);
        fallback.textContent = initials(team.name, `T${teamIndex + 1}`);

        logoImg.onload = () => {
            logoImg.classList.remove('is-broken');
            logoImg.style.display = '';
            logoWrap.classList.add('has-logo');
        };
        logoImg.onerror = () => {
            logoImg.classList.add('is-broken');
            logoWrap.classList.remove('has-logo');
        };

        if (team.logo) {
            logoImg.style.display = '';
            logoImg.src = team.logo;
        } else {
            logoImg.removeAttribute('src');
            logoImg.style.display = 'none';
            logoImg.classList.remove('is-broken');
            logoWrap.classList.remove('has-logo');
        }
    }

    function renderPlayer(teamIndex, role, player) {
        const card = roleGrid.querySelector(`.player-card[data-team="${teamIndex}"][data-role="${role}"]`);
        if (!card) return;

        const img = card.querySelector('.player-photo-img');
        const name = card.querySelector('[data-player-name]');
        const fallback = card.querySelector('[data-fallback]');
        const label = ROLE_META[role].label;

        name.textContent = player.name || 'PLAYER';
        fallback.textContent = initials(player.name, label.slice(0, 2));

        img.onload = () => {
            img.classList.remove('is-broken');
            card.classList.add('has-photo');
        };
        img.onerror = () => {
            img.classList.add('is-broken');
            card.classList.remove('has-photo');
        };

        if (player.photo) {
            img.style.display = '';
            img.src = player.photo;
        } else {
            img.removeAttribute('src');
            img.style.display = 'none';
            img.classList.remove('is-broken');
            card.classList.remove('has-photo');
        }
    }

    function renderState() {
        if (!localState) return;

        setBrandLogo(localState.brand && localState.brand.logo);

        (localState.teams || []).forEach((team, teamIndex) => {
            if (!team) return;
            renderTeam(teamIndex, team);
            (team.players || []).forEach(player => renderPlayer(teamIndex, player.role, player));
        });

        const revealed = !!localState.timer.revealed;
        rosterMode.textContent = revealed ? 'ROLE PAIRS · SIDE BY SIDE' : 'ROLE MATCHUPS ON REVEAL';
    }

    function playRevealFlash() {
        revealFlash.classList.remove('is-active');
        // Force a reflow so the animation restarts on repeated reveals.
        void revealFlash.offsetWidth;
        revealFlash.classList.add('is-active');
        window.setTimeout(() => revealFlash.classList.remove('is-active'), 1000);
    }

    function applyReveal(reveal, animate) {
        const shouldAnimate = animate && revealKnown && stage.classList.contains('is-revealed') !== reveal;
        const cards = shouldAnimate ? Array.from(roleGrid.querySelectorAll('.player-card')) : [];
        const firstRects = cards.map(card => card.getBoundingClientRect());

        stage.classList.toggle('is-revealed', reveal);

        if (shouldAnimate) {
            const lastRects = cards.map(card => card.getBoundingClientRect());
            cards.forEach((card, index) => {
                const first = firstRects[index];
                const last = lastRects[index];
                if (!first.width || !last.width || !last.height) return;
                const dx = first.left - last.left;
                const dy = first.top - last.top;
                const sx = first.width / last.width;
                const sy = first.height / last.height;
                card.style.transition = 'none';
                card.style.transformOrigin = 'top left';
                card.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
            });

            requestAnimationFrame(() => {
                cards.forEach(card => {
                    card.style.transition = 'transform 950ms cubic-bezier(0.19, 0.9, 0.22, 1)';
                    card.style.transform = 'translate(0, 0) scale(1, 1)';
                });
            });

            window.setTimeout(() => {
                cards.forEach(card => {
                    card.style.transition = '';
                    card.style.transform = '';
                    card.style.transformOrigin = '';
                });
            }, 1150);

            playRevealFlash();
        }

        revealKnown = true;
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

    function currentRemaining() {
        if (!localState) return 0;
        if (localState.timer.running && localDeadline !== null) {
            return Math.max(0, (localDeadline - (Date.now() + clockOffset)) / 1000);
        }
        return Math.max(0, Number(localState.timer.remaining) || 0);
    }

    function updateTimer() {
        if (!localState) return;

        let remaining = currentRemaining();
        const duration = Math.max(0, Number(localState.timer.duration) || 0);
        const autoReveal = localState.timer.autoReveal !== false;
        const wasRunning = localState.timer.running;

        if (remaining <= 0 && localState.timer.running && !completionRequested) {
            completionRequested = true;
            localState.timer.remaining = 0;
            localState.timer.running = false;
            localDeadline = null;
            if (autoReveal && !localState.timer.revealed) {
                localState.timer.revealed = true;
                applyReveal(true, true);
                rosterMode.textContent = 'ROLE PAIRS · SIDE BY SIDE';
            }
            finishCountdown();
            remaining = 0;
        }

        const clock = formatClock(remaining, duration);
        timerDisplay.textContent = clock;
        timerDisplay.classList.toggle('is-long', clock.length > 5);

        const percent = duration > 0 ? Math.max(0, Math.min(100, (remaining / duration) * 100)) : 0;
        timerProgress.style.width = `${percent}%`;

        stage.classList.toggle('is-running', localState.timer.running && remaining > 0);
        stage.classList.toggle('is-zero', remaining <= 0);

        const revealed = !!localState.timer.revealed;
        revealState.textContent = revealed ? 'REVEALED' : (autoReveal ? 'AUTO AT 0:00' : 'MANUAL');

        if (revealed && remaining <= 0) {
            timerEyebrow.textContent = 'ROLE MATCHUPS REVEALED';
            timerStatus.textContent = 'LINEUPS REVEALED';
        } else if (revealed) {
            timerEyebrow.textContent = 'ROLE MATCHUPS';
            timerStatus.textContent = 'ROLE PAIRS LIVE';
        } else if (remaining <= 0) {
            timerEyebrow.textContent = 'MATCH BEGINS IN';
            timerStatus.textContent = 'MATCH STARTING';
        } else if (wasRunning && localState.timer.running) {
            timerEyebrow.textContent = 'MATCH BEGINS IN';
            timerStatus.textContent = 'COUNTDOWN RUNNING';
        } else if (duration > 0 && remaining < duration) {
            timerEyebrow.textContent = 'MATCH BEGINS IN';
            timerStatus.textContent = 'COUNTDOWN PAUSED';
        } else {
            timerEyebrow.textContent = 'MATCH BEGINS IN';
            timerStatus.textContent = 'READY TO START';
        }
    }

    async function finishCountdown() {
        try {
            const response = await fetch('/api/sec-countdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'complete' })
            });
            if (!response.ok) return;
            const payload = await response.json();
            if (payload && payload.state) {
                applyState(payload.state, payload.serverNow, false);
            }
        } catch (error) {
            // The display stays on 00:00 even if the completion sync fails.
            console.error('SEC countdown completion sync failed:', error);
        }
    }

    function applyState(nextState, serverNow, animateReveal) {
        if (!nextState || !nextState.timer) return;

        const previousRevealed = !!(localState && localState.timer.revealed);
        const nextRevealed = !!nextState.timer.revealed;

        if (typeof serverNow === 'number' && Number.isFinite(serverNow)) {
            clockOffset = serverNow - Date.now();
        }

        localState = nextState;
        localDeadline = localState.timer.running && Number.isFinite(Number(localState.timer.remaining))
            ? (Date.now() + clockOffset) + Math.max(0, Number(localState.timer.remaining)) * 1000
            : null;

        if (localState.timer.running && Number(localState.timer.remaining) > 0) {
            completionRequested = false;
        }

        renderState();
        updateTimer();

        applyReveal(
            nextRevealed,
            animateReveal !== false && nextRevealed !== previousRevealed
        );
    }

    async function loadState(animateReveal = false) {
        try {
            const response = await fetch('/api/sec-countdown', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            setConnection(true);
            applyState(payload.state, payload.serverNow, animateReveal);
        } catch (error) {
            setConnection(false);
            console.error('SEC countdown load failed:', error);
        }
    }

    function setConnection(online) {
        document.body.classList.toggle('is-offline', !online);
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
            loadState(false);
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

    function startStatusPolling() {
        if (statusPollTimer) clearInterval(statusPollTimer);
        statusPollTimer = window.setInterval(() => {
            if (localState && localState.timer.running && currentRemaining() <= 0) {
                updateTimer();
            }
        }, 500);
    }

    buildRoleGrid();
    connectSocket();
    loadState(false);
    window.setInterval(updateTimer, 100);
    startStatusPolling();

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadState(false);
    });
})();
