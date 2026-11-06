// herodropdownban6.js - Controller Logic (6 bans total / 3 per side)
// FULL REVISED VERSION - Fix WebSocket Sync, Stability, Isolated Timer & Unlocked Hero/Ban Selection

// Variabel Global
let selected1 = null;
let selected2 = null;
let allHeroes = [];
let currentPhaseIndex = 0;
let correctionMode = false;
let currentDraftData = null; // State lokal dari data server
let ws = null; // WebSocket Connection
let reconnectInterval = null;
let isSaving = false; // Flag untuk mencegah spam save

// Urutan dropdown (Draft Pick Rules - 6 Bans)
const dropdownOrder = [
    { dropdown: 'dropdowns-11', phase: 0, display: ['ban-left-1'] },
    { dropdown: 'dropdowns-16', phase: 1, display: ['ban-right-1'] },
    { dropdown: 'dropdowns-12', phase: 2, display: ['ban-left-2'] },
    { dropdown: 'dropdowns-17', phase: 3, display: ['ban-right-2'] },
    { dropdown: 'dropdowns-1', phase: 4, display: ['pick-left-1'] },
    { dropdown: ['dropdowns-6', 'dropdowns-7'], phase: 5, display: ['pick-right-1', 'pick-right-2'] },
    { dropdown: ['dropdowns-2', 'dropdowns-3'], phase: 6, display: ['pick-left-2', 'pick-left-3'] },
    { dropdown: 'dropdowns-8', phase: 7, display: ['pick-right-3'] },
    { dropdown: 'dropdowns-13', phase: 8, display: ['ban-left-3'] },
    { dropdown: 'dropdowns-18', phase: 9, display: ['ban-right-3'] },
    { dropdown: 'dropdowns-9', phase: 10, display: ['pick-right-4'] },
    { dropdown: ['dropdowns-4', 'dropdowns-5'], phase: 11, display: ['pick-left-4', 'pick-left-5'] },
    { dropdown: 'dropdowns-10', phase: 12, display: ['pick-right-5'] },
    { dropdown: 'dropdowns-10', phase: 12, display: ['pick-right-5'] } // Phase dummy akhir
];

// ==========================================
// 1. WEBSOCKET MANAGER (AUTO RECONNECT)
// ==========================================

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${window.location.host}`);

    ws.onopen = () => {
        console.log('Controller Connected to Server');
        fetchDraftData();
        
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'draftdata_update' && msg.data) {
                currentDraftData = msg.data;
                applyServerDataToUI();
            }
        } catch (e) {
            console.error("WS Parse Error", e);
        }
    };

    ws.onclose = () => {
        console.log('Koneksi terputus. Mencoba reconnect...');
        if (!reconnectInterval) {
            reconnectInterval = setInterval(connectWebSocket, 3000);
        }
    };

    ws.onerror = (err) => {
        console.error('Socket error:', err);
        ws.close();
    };
}

// ==========================================
// 2. DATA HANDLING (FETCH & SAVE)
// ==========================================

async function fetchDraftData() {
    try {
        const response = await fetch('/api/matchdraft');
        const data = await response.json();
        currentDraftData = data.draftdata;
        applyServerDataToUI();
    } catch (error) {
        console.error("Gagal mengambil data draft:", error);
    }
}

async function saveDraftData() {
    if (isSaving) return;
    isSaving = true;

    try {
        await fetch('/api/matchdraft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draftdata: currentDraftData })
        });
    } catch (error) {
        console.error("Gagal menyimpan data draft:", error);
    } finally {
        isSaving = false;
    }
}

// ==========================================
// 3. MATCH DATA SYNC (NAMES & BANS)
// ==========================================

function getMatchDataLocation(dropdownIndex) {
    if (dropdownIndex >= 1 && dropdownIndex <= 5) return { team: 'blueteam', idx: dropdownIndex - 1, field: 'hero' };
    if (dropdownIndex >= 6 && dropdownIndex <= 10) return { team: 'redteam', idx: dropdownIndex - 6, field: 'hero' };
    if (dropdownIndex >= 11 && dropdownIndex <= 15) return { team: 'blueteam', idx: dropdownIndex - 11, field: 'banhero' };
    if (dropdownIndex >= 16 && dropdownIndex <= 20) return { team: 'redteam', idx: dropdownIndex - 16, field: 'banhero' };
    return null;
}

async function updateMatchDataHero(dropdownIndex, heroValue) {
    try {
        const loc = getMatchDataLocation(dropdownIndex);
        if (!loc) return;

        const response = await fetch('/api/matchdata');
        const data = await response.json();

        if (data.teamdata && data.teamdata[loc.team] && data.teamdata[loc.team].playerlist && data.teamdata[loc.team].playerlist[loc.idx]) {
            data.teamdata[loc.team].playerlist[loc.idx][loc.field] = heroValue || "";
        }

        await fetch('/api/matchdata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error("Error updating matchdata hero:", error);
    }
}

async function swapMatchDataHeroes(index1, index2) {
    try {
        const loc1 = getMatchDataLocation(index1);
        const loc2 = getMatchDataLocation(index2);
        
        if (!loc1 || !loc2) return;

        const response = await fetch('/api/matchdata');
        const data = await response.json();

        let val1 = "", val2 = "";
        
        if (data.teamdata[loc1.team].playerlist[loc1.idx]) val1 = data.teamdata[loc1.team].playerlist[loc1.idx][loc1.field];
        if (data.teamdata[loc2.team].playerlist[loc2.idx]) val2 = data.teamdata[loc2.team].playerlist[loc2.idx][loc2.field];

        if (data.teamdata[loc1.team].playerlist[loc1.idx]) data.teamdata[loc1.team].playerlist[loc1.idx][loc1.field] = val2;
        if (data.teamdata[loc2.team].playerlist[loc2.idx]) data.teamdata[loc2.team].playerlist[loc2.idx][loc2.field] = val1;

        await fetch('/api/matchdata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error("Error swapping matchdata heroes:", error);
    }
}

async function resetMatchDataHeroes() {
    try {
        const response = await fetch('/api/matchdata');
        const data = await response.json();

        if (data.teamdata.blueteam && data.teamdata.blueteam.playerlist) {
            data.teamdata.blueteam.playerlist.forEach(player => {
                player.hero = "";
                player.banhero = "";
            });
        }

        if (data.teamdata.redteam && data.teamdata.redteam.playerlist) {
            data.teamdata.redteam.playerlist.forEach(player => {
                player.hero = "";
                player.banhero = "";
            });
        }

        await fetch('/api/matchdata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        console.log("Match Data Heroes & Bans Reset Successfully");
    } catch (error) {
        console.error("Error resetting matchdata heroes:", error);
    }
}

// ==========================================
// 4. HELPER MAPPING (DRAFT JSON)
// ==========================================

function getJsonLocation(index) {
    if (index >= 1 && index <= 5) return { side: 'blueside', type: 'pick', idx: index - 1 };
    if (index >= 6 && index <= 10) return { side: 'redside', type: 'pick', idx: index - 6 };
    if (index >= 11 && index <= 15) return { side: 'blueside', type: 'ban', idx: index - 11 };
    if (index >= 16 && index <= 20) return { side: 'redside', type: 'ban', idx: index - 16 };
    return null;
}

function getHeroFromData(index) {
    if (!currentDraftData) return "";
    const loc = getJsonLocation(index);
    if (!loc) return "";
    const side = currentDraftData[loc.side];
    if (!side) return "";
    const list = side[loc.type];
    if (!Array.isArray(list) || !list[loc.idx]) return "";
    return list[loc.idx].hero || "";
}

function setHeroToData(index, heroImg) {
    if (!currentDraftData) return;
    const loc = getJsonLocation(index);
    if (!loc) return;
    if (!currentDraftData[loc.side]) currentDraftData[loc.side] = {};
    if (!Array.isArray(currentDraftData[loc.side][loc.type])) {
        currentDraftData[loc.side][loc.type] = [{}, {}, {}, {}, {}];
    }
    while (currentDraftData[loc.side][loc.type].length <= loc.idx) {
        currentDraftData[loc.side][loc.type].push({});
    }
    currentDraftData[loc.side][loc.type][loc.idx].hero = heroImg || "";
}

// ==========================================
// 5. INITIALIZATION
// ==========================================

async function loadHeroes() {
    try {
        const response = await fetch('/database/herolist.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error loading herolist.json:', error);
        return [];
    }
}

async function initializePage() {
    allHeroes = await loadHeroes();
    connectWebSocket(); 

    // Setup Listeners untuk setiap dropdown hero/ban
    for (let i = 1; i <= 20; i++) {
        const input = document.getElementById(`search-${i}`);
        const dropdown = document.getElementById(`dropdown-items-${i}`);
        if (input && dropdown) {
            dropdown.addEventListener('mousedown', (e) => e.preventDefault());
            input.addEventListener('input', () => filterDropdown(i));
            input.addEventListener('focus', () => filterDropdown(i));
            input.addEventListener('click', () => filterDropdown(i));
            input.addEventListener('blur', () => hideDropdown(i));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = input.value.trim().toLowerCase();
                    if (!val) {
                        selectHero(i, null);
                    } else {
                        const matched = allHeroes.find(h => h.name.toLowerCase() === val)
                            || allHeroes.find(h => h.name.toLowerCase().startsWith(val));
                        if (matched) selectHero(i, matched);
                    }
                    hideDropdown(i);
                }
            });
        }
    }
    
    const correctionBtn = document.getElementById('correction');
    if (correctionBtn) correctionBtn.addEventListener('click', toggleCorrectionMode);
    
    // Control Buttons
    const startBtn = document.getElementById('start');
    if (startBtn) startBtn.addEventListener('click', () => handleControlAction("start"));
    const stopBtn = document.getElementById('stop');
    if (stopBtn) stopBtn.addEventListener('click', () => handleControlAction("stop"));
    const nextBtn = document.getElementById('nextPhase');
    if (nextBtn) nextBtn.addEventListener('click', () => handleControlAction("nextPhase"));
    const resetBtn = document.getElementById('reset');
    if (resetBtn) resetBtn.addEventListener('click', () => handleControlAction("reset"));

    // Tutup dropdown jika klik di luar dropdown container
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-container')) {
            for (let i = 1; i <= 20; i++) {
                const dd = document.getElementById(`dropdown-items-${i}`);
                if (dd) dd.style.display = 'none';
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', initializePage);

// ==========================================
// 6. UI LOGIC & STATE
// ==========================================

function applyServerDataToUI() {
    if (!currentDraftData) return;

    currentPhaseIndex = parseInt(currentDraftData.current_phase) || 0;
    
    TimerManager.syncState();

    for (let i = 1; i <= 20; i++) {
        const heroImg = getHeroFromData(i);
        const input = document.getElementById(`search-${i}`);
        if (input) {
            if (document.activeElement !== input) {
                input.value = getHeroName(heroImg);
            }
        }
    }
    updateDropdownState();
}

function updateDropdownState() {
    // SEMUA input hero pick dan ban tetap AKTIF agar operator bisa memilih hero kapan saja
    for (let i = 1; i <= 20; i++) {
        const input = document.getElementById(`search-${i}`);
        if (input) {
            input.disabled = false;
            input.classList.remove('active-phase');
        }
    }

    // Sorot input phase aktif jika dalam mode normal (bukan correction mode)
    if (!correctionMode && currentPhaseIndex < dropdownOrder.length) {
        const currentPhase = dropdownOrder[currentPhaseIndex];
        const dropdowns = Array.isArray(currentPhase.dropdown) ? currentPhase.dropdown : [currentPhase.dropdown];
        dropdowns.forEach(dropdownId => {
            const idx = dropdownId.split('-')[1];
            const input = document.getElementById(`search-${idx}`);
            if (input) input.classList.add('active-phase');
        });
    }
    
    const correctionButton = document.getElementById('correction');
    if (correctionButton) {
        correctionButton.textContent = correctionMode ? 'Exit Correction' : 'Correction';
    }
}

function toggleCorrectionMode() {
    correctionMode = !correctionMode;
    updateDropdownState();
}

// ==========================================
// 7. DROPDOWN & SELECTION LOGIC
// ==========================================

function filterDropdown(index) {
    const input = document.getElementById(`search-${index}`);
    const dropdown = document.getElementById(`dropdown-items-${index}`);
    if (!input || !dropdown) return;
    if (!allHeroes || allHeroes.length === 0) return;

    // Tinggikan stacking context container yang sedang aktif
    document.querySelectorAll('.dropdown-container').forEach(c => c.style.zIndex = '1');
    const container = document.getElementById(`dropdowns-${index}`);
    if (container) container.style.zIndex = '100';

    const searchText = (input.value || '').trim().toLowerCase();
    dropdown.innerHTML = "";

    const matches = searchText.length > 0
        ? allHeroes.filter(h => h.name.toLowerCase().includes(searchText))
        : allHeroes;

    if (matches.length === 0) {
        dropdown.style.display = "none";
        return;
    }

    dropdown.style.display = "block";

    const currentHero = getHeroFromData(index);
    if (currentHero || input.value) {
        const clearOpt = document.createElement("div");
        clearOpt.textContent = "✖ [Clear / Remove Hero]";
        clearOpt.style.color = "#ff4d6d";
        clearOpt.style.fontWeight = "bold";
        clearOpt.onmousedown = (e) => {
            e.preventDefault();
            selectHero(index, null);
        };
        dropdown.appendChild(clearOpt);
    }

    matches.forEach(hero => {
        const option = document.createElement("div");
        option.textContent = hero.name;
        option.onmousedown = (e) => {
            e.preventDefault();
            selectHero(index, hero);
        };
        dropdown.appendChild(option);
    });
}

async function selectHero(index, hero) {
    const input = document.getElementById(`search-${index}`);
    const dropdown = document.getElementById(`dropdown-items-${index}`);
    
    if (dropdown) dropdown.style.display = "none";

    const heroImg = hero ? hero.img : "";
    const heroName = hero ? hero.name : "";

    setHeroToData(index, heroImg); 
    
    if (input) input.value = heroName;
    
    await updateMatchDataHero(index, heroName);

    if (!correctionMode && isCurrentPhaseDropdown(index) && hero) {
        checkPhaseCompletion(); 
    } else {
        await saveDraftData();
    }
}

function isCurrentPhaseDropdown(index) {
    if (currentPhaseIndex >= dropdownOrder.length) return false;
    const currentPhase = dropdownOrder[currentPhaseIndex];
    const dropdowns = Array.isArray(currentPhase.dropdown) ? currentPhase.dropdown : [currentPhase.dropdown];
    return dropdowns.includes(`dropdowns-${index}`);
}

async function checkPhaseCompletion() {
    if (currentPhaseIndex >= dropdownOrder.length) {
        await saveDraftData();
        return;
    }

    const currentPhase = dropdownOrder[currentPhaseIndex];
    const dropdowns = Array.isArray(currentPhase.dropdown) ? currentPhase.dropdown : [currentPhase.dropdown];
    
    const allFilled = dropdowns.every(dropdownId => {
        const idx = parseInt(dropdownId.split('-')[1]);
        return getHeroFromData(idx) !== "";
    });

    if (allFilled) {
        handleControlAction("nextPhase"); 
    } else {
        await saveDraftData(); 
    }
}

function hideDropdown(index) {
    setTimeout(() => {
        const dropdown = document.getElementById(`dropdown-items-${index}`);
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }, 200);
}

// ==========================================
// 8. SWAP LOGIC
// ==========================================

async function swapHeroes() {
    if (selected1 !== null && selected2 !== null) {
        let hero1 = getHeroFromData(selected1);
        let hero2 = getHeroFromData(selected2);

        setHeroToData(selected1, hero2);
        setHeroToData(selected2, hero1);

        const input1 = document.getElementById(`search-${selected1}`);
        const input2 = document.getElementById(`search-${selected2}`);
        if (input1) input1.value = getHeroName(hero2);
        if (input2) input2.value = getHeroName(hero1);

        await swapMatchDataHeroes(selected1, selected2);

        resetSelection();
        await saveDraftData();
    }
}

function getHeroName(imgSrc) {
    if (!imgSrc || !allHeroes || !allHeroes.length) return "";
    const clean = (s) => String(s || '').replace(/^\/+/, '').toLowerCase();
    const hero = allHeroes.find(h => {
        if (!h) return false;
        if (h.name && h.name.toLowerCase() === String(imgSrc).toLowerCase()) return true;
        if (h.img && clean(h.img) === clean(imgSrc)) return true;
        const baseH = (h.img || '').split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
        const baseSrc = String(imgSrc).split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
        return baseH && baseSrc && baseH === baseSrc;
    });
    return hero ? hero.name : "";
}

function selectDropdown(index) {
    let button = document.querySelector(`#dropdowns-${index} .swap-button`);
    if (selected1 === null) {
        selected1 = index;
        if(button) button.classList.add("selected", "swap-active");
    } else if (selected2 === null && selected1 !== index) {
        selected2 = index;
        if(button) button.classList.add("selected", "swap-active");
        swapHeroes();
    } else {
        resetSelection();
    }
}

function resetSelection() {
    if (selected1 !== null) {
        let btn = document.querySelector(`#dropdowns-${selected1} .swap-button`);
        if(btn) btn.classList.remove("selected", "swap-active");
    }
    if (selected2 !== null) {
        let btn = document.querySelector(`#dropdowns-${selected2} .swap-button`);
        if(btn) btn.classList.remove("selected", "swap-active");
    }
    selected1 = null;
    selected2 = null;
}

// ==========================================
// 9. ISOLATED TIMER MANAGER
// ==========================================

const TimerManager = {
    interval: null,
    
    start: function() {
        if (this.interval) return;
        
        this.interval = setInterval(() => {
            if (currentDraftData && currentDraftData.timer_running) {
                let currentTime = parseInt(currentDraftData.timer);
                
                if (currentTime > 0) {
                    currentTime--;
                    currentDraftData.timer = currentTime.toString();
                    this.updateUI();
                    
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'update',
                            data: {
                                draftdata: { 
                                    timer: currentDraftData.timer, 
                                    timer_running: true 
                                }
                            }
                        }));
                    }
                } else {
                    this.stop();
                }
            }
        }, 1000);
    },

    stop: function() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (currentDraftData) currentDraftData.timer_running = false;
        this.updateUI();
    },

    reset: function(defaultTime = "60") {
        this.stop();
        if (currentDraftData) {
            currentDraftData.timer = defaultTime;
            currentDraftData.timer_running = false;
        }
        this.updateUI();
    },

    updateUI: function() {
        const timerText = document.getElementById('timer-display'); 
        if (timerText && currentDraftData) {
            timerText.textContent = currentDraftData.timer;
        }
    },

    syncState: function() {
        this.updateUI();
        if (currentDraftData && currentDraftData.timer_running) {
            this.start();
        } else {
            this.stop();
        }
    }
};

// ==========================================
// 10. CONTROLS (START, STOP, RESET, NEXT)
// ==========================================

async function handleControlAction(action) {
    if (!currentDraftData) return;

    if (action === "start") {
        currentDraftData.timer_running = true;
        TimerManager.start();
    } 
    else if (action === "stop") {
        currentDraftData.timer_running = false;
        TimerManager.stop();
    } 
    else if (action === "nextPhase") {
        if (currentPhaseIndex < dropdownOrder.length) {
            currentDraftData.current_phase = currentPhaseIndex + 1;
            TimerManager.reset("60"); 
            currentDraftData.timer_running = true;
            TimerManager.start();
        }
    } 
    else if (action === "reset") {
        currentDraftData.current_phase = 0;
        TimerManager.reset("60");
        correctionMode = false;
        
        const empty = [ { "hero": "" }, { "hero": "" }, { "hero": "" }, { "hero": "" }, { "hero": "" } ];
        currentDraftData.blueside.ban = JSON.parse(JSON.stringify(empty));
        currentDraftData.blueside.pick = JSON.parse(JSON.stringify(empty));
        currentDraftData.redside.ban = JSON.parse(JSON.stringify(empty));
        currentDraftData.redside.pick = JSON.parse(JSON.stringify(empty));
        
        await resetMatchDataHeroes();
        resetSelection();
    }
    
    await saveDraftData();
}

// Global exports untuk inline onclick/oninput
window.filterDropdown = filterDropdown;
window.hideDropdown = hideDropdown;
window.selectDropdown = selectDropdown;
window.selectHero = selectHero;
