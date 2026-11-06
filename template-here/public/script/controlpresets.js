// controlpresets.js — team & player presets integration inside control.html
// Connects Central Control presets to control.html:
// - Blue / Red team preset selection
// - Dynamic player selection dropdowns per slot (P1-P5 for Blue & Red)
// - Auto-fills nickname, lane/role, and photo from team roster
// - Full apply via /api/presets/apply

(function () {
    const blueTeamSelect = document.getElementById('preset-blue-team');
    const redTeamSelect = document.getElementById('preset-red-team');
    const loadButton = document.getElementById('preset-load-btn');
    const statusEl = document.getElementById('preset-status');

    if (!blueTeamSelect || !redTeamSelect || !loadButton) return;

    const BLUE_SLOTS = [3, 4, 5, 6, 7];
    const RED_SLOTS  = [10, 11, 12, 13, 14];
    const ROLE_ORDER = ['gold', 'exp', 'mid', 'junggle', 'roam'];

    let presets = { teams: [], players: [] };
    let currentMatchData = null;

    function setStatus(message, color) {
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.style.color = color || '#9CA3AF';
    }

    function roleLabel(role) {
        const map = { gold: 'Gold', exp: 'Exp', mid: 'Mid', junggle: 'Jungle', roam: 'Roam', sub: 'Sub' };
        return map[role] || (role ? role.toUpperCase() : 'None');
    }

    function teamById(id) {
        return presets.teams.find(t => t.id === id) || null;
    }

    function playerById(id) {
        return presets.players.find(p => p.id === id) || null;
    }

    function playersOfTeam(teamId) {
        return (presets.players || [])
            .filter(p => p.teamId === teamId)
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

    function freeAgents() {
        return (presets.players || [])
            .filter(p => !p.teamId)
            .sort((a, b) => (a.ign || '').localeCompare(b.ign || ''));
    }

    function fillTeamSelect(select, placeholder) {
        const current = select.value;
        const options = (presets.teams || [])
            .map(t => `<option value="${t.id}">${t.name || 'Untitled team'}</option>`)
            .join('');
        select.innerHTML = `<option value="">${placeholder}</option>${options}`;
        if (current && presets.teams.some(t => t.id === current)) {
            select.value = current;
        }
    }

    function populatePlayerDropdown(selectEl, teamId, preferredRole, currentIgn) {
        if (!selectEl) return;
        const team = teamById(teamId);
        const roster = team ? playersOfTeam(team.id) : [];
        const fa = freeAgents();

        let html = '<option value="">— Custom Nickname —</option>';

        if (roster.length > 0) {
            html += `<optgroup label="${team.name || 'Team'} Roster">`;
            roster.forEach(p => {
                html += `<option value="${p.id}" data-ign="${p.ign}" data-role="${p.role}" data-photo="${p.photo || ''}">${p.ign} (${roleLabel(p.role)})</option>`;
            });
            html += '</optgroup>';
        }

        if (fa.length > 0) {
            html += '<optgroup label="Free Agents">';
            fa.forEach(p => {
                html += `<option value="${p.id}" data-ign="${p.ign}" data-role="${p.role}" data-photo="${p.photo || ''}">${p.ign} (${roleLabel(p.role)})</option>`;
            });
            html += '</optgroup>';
        }

        selectEl.innerHTML = html;

        // Try to match currentIgn or preferredRole
        if (currentIgn) {
            const found = roster.find(p => p.ign.toLowerCase() === currentIgn.toLowerCase())
                || fa.find(p => p.ign.toLowerCase() === currentIgn.toLowerCase());
            if (found) {
                selectEl.value = found.id;
                return;
            }
        }
        selectEl.value = '';
    }

    function updateSideDropdowns(side, teamId, autoFillStartingRoster = false) {
        const slots = side === 'blue' ? BLUE_SLOTS : RED_SLOTS;
        const team = teamById(teamId);
        const roster = team ? playersOfTeam(team.id) : [];
        const usedPlayerIds = new Set();

        slots.forEach((slotIndex, i) => {
            const selectEl = document.getElementById(`player-select-${slotIndex}`);
            const inputEl  = document.getElementById(`name-input-${slotIndex}`);
            const laneEl   = document.getElementById(`lane-select-${slotIndex}`);
            const role     = ROLE_ORDER[i] || 'none';
            const currentIgn = inputEl ? inputEl.value.trim() : '';

            populatePlayerDropdown(selectEl, teamId, role, currentIgn);

            if (autoFillStartingRoster && team) {
                // Find best matching player for this role who hasn't been assigned yet
                let picked = roster.find(p => p.role === role && !usedPlayerIds.has(p.id));
                if (!picked) {
                    picked = roster.find(p => !usedPlayerIds.has(p.id));
                }
                if (picked) {
                    usedPlayerIds.add(picked.id);
                    if (selectEl) selectEl.value = picked.id;
                    if (inputEl) {
                        inputEl.value = picked.ign;
                        inputEl.dataset.photo = picked.photo || '';
                    }
                    if (laneEl && picked.role && picked.role !== 'sub') {
                        laneEl.value = picked.role;
                    }
                }
            }
        });

        // Also update team logo preview if loading starting roster
        if (autoFillStartingRoster && team) {
            const teamNameInput = document.getElementById(side === 'blue' ? 'name-input-1' : 'name-input-8');
            if (teamNameInput) teamNameInput.value = team.name || '';
            if (team.logo) {
                if (side === 'blue') {
                    if (typeof currentBlueLogo !== 'undefined') currentBlueLogo = team.logo;
                } else {
                    if (typeof currentRedLogo !== 'undefined') currentRedLogo = team.logo;
                }
            }
            if (typeof saveToServer === 'function') {
                saveToServer();
            }
        }
    }

    function setupSlotListeners() {
        const allSlots = [...BLUE_SLOTS, ...RED_SLOTS];
        allSlots.forEach(slotIndex => {
            const selectEl = document.getElementById(`player-select-${slotIndex}`);
            const inputEl  = document.getElementById(`name-input-${slotIndex}`);
            const laneEl   = document.getElementById(`lane-select-${slotIndex}`);

            if (selectEl) {
                selectEl.addEventListener('change', () => {
                    const playerId = selectEl.value;
                    if (playerId) {
                        const player = playerById(playerId);
                        if (player) {
                            if (inputEl) {
                                inputEl.value = player.ign || '';
                                inputEl.dataset.photo = player.photo || '';
                            }
                            if (laneEl && player.role && player.role !== 'sub') {
                                laneEl.value = player.role;
                            }
                        }
                    } else {
                        // User selected "— Custom Nickname —"
                        if (inputEl) {
                            inputEl.dataset.photo = '';
                        }
                    }
                    if (typeof saveToServer === 'function') {
                        saveToServer();
                    }
                });
            }

            if (inputEl) {
                inputEl.addEventListener('input', () => {
                    // If user manually types a name, sync with player select if IGN matches, otherwise custom
                    if (selectEl) {
                        const typed = inputEl.value.trim().toLowerCase();
                        const opt = Array.from(selectEl.options).find(o => o.dataset.ign && o.dataset.ign.toLowerCase() === typed);
                        if (opt) {
                            selectEl.value = opt.value;
                            inputEl.dataset.photo = opt.dataset.photo || '';
                        } else {
                            selectEl.value = '';
                            inputEl.dataset.photo = '';
                        }
                    }
                });
            }
        });
    }

    async function loadPresets() {
        try {
            const [presetData, matchData] = await Promise.all([
                fetch('/api/presets').then(r => r.json()),
                fetch('/api/matchdata').then(r => r.json())
            ]);
            presets = presetData || { teams: [], players: [] };
            currentMatchData = matchData || {};

            fillTeamSelect(blueTeamSelect, 'Select blue team preset…');
            fillTeamSelect(redTeamSelect, 'Select red team preset…');

            const blueName = (matchData?.teamdata?.blueteam?.teamname || '').trim().toLowerCase();
            const redName  = (matchData?.teamdata?.redteam?.teamname || '').trim().toLowerCase();

            const blueId = matchData?.teamdata?.blueteam?.presetId
                || (blueName ? presets.teams.find(t => (t.name || '').trim().toLowerCase() === blueName)?.id : '')
                || '';
            const redId  = matchData?.teamdata?.redteam?.presetId
                || (redName ? presets.teams.find(t => (t.name || '').trim().toLowerCase() === redName)?.id : '')
                || '';

            if (blueId && presets.teams.some(t => t.id === blueId)) {
                blueTeamSelect.value = blueId;
            }
            if (redId && presets.teams.some(t => t.id === redId)) {
                redTeamSelect.value = redId;
            }

            updateSideDropdowns('blue', blueTeamSelect.value, false);
            updateSideDropdowns('red', redTeamSelect.value, false);

            if (!presets.teams.length) {
                setStatus('No presets yet. Create teams in Central Control.', '#f59e0b');
            }
        } catch (error) {
            console.error('Preset load failed:', error);
            setStatus('Could not load presets.', '#ff4d6d');
        }
    }

    async function applyPresets() {
        const blueTeamId = blueTeamSelect.value;
        const redTeamId = redTeamSelect.value;

        if (!blueTeamId || !redTeamId) {
            setStatus('Choose both a blue and a red team preset.', '#ff4d6d');
            return;
        }
        if (blueTeamId === redTeamId) {
            setStatus('Blue and red must be different teams.', '#ff4d6d');
            return;
        }

        const blueTeam = teamById(blueTeamId);
        const redTeam  = teamById(redTeamId);
        const blueRoster = blueTeam ? (blueTeam.roster || []) : [];
        const redRoster  = redTeam ? (redTeam.roster || []) : [];

        const bluePlayerIds = BLUE_SLOTS.map((s, idx) => {
            const val = document.getElementById(`player-select-${s}`)?.value;
            return (val && String(val).trim()) ? val : (blueRoster[idx] || '');
        });
        const redPlayerIds  = RED_SLOTS.map((s, idx) => {
            const val = document.getElementById(`player-select-${s}`)?.value;
            return (val && String(val).trim()) ? val : (redRoster[idx] || '');
        });

        loadButton.disabled = true;
        setStatus('Loading team presets…', '#9CA3AF');

        try {
            const response = await fetch('/api/presets/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    blueTeamId,
                    redTeamId,
                    bluePlayerIds,
                    redPlayerIds,
                    resetStats: false,
                    resetScore: false,
                    resetDraft: false,
                    resetMvp: false
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || 'Apply failed');

            if (typeof loadFromServer === 'function') await loadFromServer();
            updateSideDropdowns('blue', blueTeamId, false);
            updateSideDropdowns('red', redTeamId, false);
            setStatus('Team & player presets loaded into this panel.', '#00FF8C');
        } catch (error) {
            console.error('Preset apply failed:', error);
            setStatus(`Failed: ${error.message}`, '#ff4d6d');
        } finally {
            loadButton.disabled = false;
        }
    }

    blueTeamSelect.addEventListener('change', () => {
        updateSideDropdowns('blue', blueTeamSelect.value, true);
    });

    redTeamSelect.addEventListener('change', () => {
        updateSideDropdowns('red', redTeamSelect.value, true);
    });

    loadButton.addEventListener('click', applyPresets);

    window.addEventListener('matchdata_loaded', (e) => {
        currentMatchData = e.detail;
        if (presets.teams.length > 0) {
            updateSideDropdowns('blue', blueTeamSelect.value, false);
            updateSideDropdowns('red', redTeamSelect.value, false);
        }
    });

    setupSlotListeners();
    loadPresets();
})();
