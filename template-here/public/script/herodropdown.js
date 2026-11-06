// herodropdown.js - Controller Logic
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

// Urutan dropdown (Draft Pick Rules)
const dropdownOrder = [
    { dropdown: 'dropdowns-11', phase: 0, display: ['ban-left-1'] },
    { dropdown: 'dropdowns-16', phase: 1, display: ['ban-right-1'] },
    { dropdown: 'dropdowns-12', phase: 2, display: ['ban-left-2'] },
    { dropdown: 'dropdowns-17', phase: 3, display: ['ban-right-2'] },
    { dropdown: 'dropdowns-13', phase: 4, display: ['ban-left-3'] },
    { dropdown: 'dropdowns-18', phase: 5, display: ['ban-right-3'] },
    { dropdown: 'dropdowns-1',  phase: 6, display: ['pick-left-1'] },
    { dropdown: ['dropdowns-6', 'dropdowns-7'], phase: 7, display: ['pick-right-1', 'pick-right-2'] },
    { dropdown: ['dropdowns-2', 'dropdowns-3'], phase: 8, display: ['pick-left-2', 'pick-left-3'] },
    { dropdown: 'dropdowns-8',  phase: 9, display: ['pick-right-3'] },
    { dropdown: 'dropdowns-19', phase: 10, display: ['ban-right-4'] },
    { dropdown: 'dropdowns-14', phase: 11, display: ['ban-left-4'] },
    { dropdown: 'dropdowns-20', phase: 12, display: ['ban-right-5'] },
    { dropdown: 'dropdowns-15', phase: 13, display: ['ban-left-5'] },
    { dropdown: 'dropdowns-9',  phase: 14, display: ['pick-right-4'] },
    { dropdown: ['dropdowns-4', 'dropdowns-5'], phase: 15, display: ['pick-left-4', 'pick-left-5'] },
    { dropdown: 'dropdowns-10', phase: 16, display: ['pick-right-5'] },
    { dropdown: 'dropdowns-10', phase: 16, display: ['pick-right-5'] } // Phase dummy akhir
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
            else if (msg.type === 'update' && msg.data && msg.data.draftdata && currentDraftData) {
                // The server owns the countdown; mirror its ticks and phase changes.
                const incoming = msg.data.draftdata;
                if (incoming.timer !== undefined) currentDraftData.timer = incoming.timer;
                if (incoming.timer_running !== undefined) currentDraftData.timer_running = incoming.timer_running;
                if (incoming.timer_end_at !== undefined) currentDraftData.timer_end_at = incoming.timer_end_at;
                if (incoming.current_phase !== undefined) {
                    const nextPhase = parseInt(incoming.current_phase) || 0;
                    if (nextPhase !== currentPhaseIndex) {
                        currentPhaseIndex = nextPhase;
                        currentDraftData.current_phase = nextPhase;
                        updateDropdownState();
                    }
                }
                TimerManager.updateUI();
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

let hasPendingDraftSave = false;

async function saveDraftData() {
    if (isSaving) {
        hasPendingDraftSave = true;
        return;
    }
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
        if (hasPendingDraftSave) {
            hasPendingDraftSave = false;
            saveDraftData();
        }
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
    
    // Sinkronisasi Timer Lokal
    TimerManager.syncState();

    // Update Input Text dari data hero di server
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

    // Tampilkan semua hero jika kosong, atau filter sesuai ketikan
    const matches = searchText.length > 0
        ? allHeroes.filter(h => h.name.toLowerCase().includes(searchText))
        : allHeroes;

    if (matches.length === 0) {
        dropdown.style.display = "none";
        return;
    }

    dropdown.style.display = "block";

    // Opsi bersihkan hero jika slot saat ini sudah memiliki nilai
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
        // Gunakan onmousedown dengan preventDefault agar input tidak kehilangan fokus sebelum klik tercatat
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

    // 1. Update State Lokal (Draft - Image)
    setHeroToData(index, heroImg); 
    
    // 2. Update UI Controller Langsung
    if (input) input.value = heroName;
    
    // 3. Simpan dan broadcast Draft Data langsung agar overlay display/postdraft tidak delay
    await saveDraftData();

    // 4. Update Match Data (Names) di background
    updateMatchDataHero(index, heroName);

    // 5. Logic Phase Auto-Advance jika hero dipilih pada phase aktif
    if (!correctionMode && isCurrentPhaseDropdown(index) && hero) {
        checkPhaseCompletion(); 
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
        await saveDraftData();
        handleControlAction("nextPhase"); 
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

        // Swap di State Lokal
        setHeroToData(selected1, hero2);
        setHeroToData(selected2, hero1);

        // Swap UI Controller
        const input1 = document.getElementById(`search-${selected1}`);
        const input2 = document.getElementById(`search-${selected2}`);
        if (input1) input1.value = getHeroName(hero2);
        if (input2) input2.value = getHeroName(hero1);

        // Swap Data Nama di Server
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

// The countdown is owned by server.js. This manager only mirrors server state, so
// opening two control panels can never make the timer run twice as fast.
const TimerManager = {
    start: function() {
        this.updateUI();
    },

    stop: function() {
        this.updateUI();
    },

    reset: function(defaultTime = "60") {
        if (currentDraftData) currentDraftData.timer = String(defaultTime);
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
    }
};

// ==========================================
// 10. CONTROLS (START, STOP, RESET, NEXT)
// ==========================================

async function handleControlAction(action) {
    if (!currentDraftData) return;

    const actionMap = {
        start: 'start',
        stop: 'pause',
        nextPhase: 'next',
        reset: 'reset'
    };
    const serverAction = actionMap[action];
    if (!serverAction) return;

    if (action === 'reset') {
        correctionMode = false;
        resetSelection();
    }

    try {
        const response = await fetch('/api/draft-control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: serverAction })
        });
        const data = await response.json();
        if (data && data.draftdata) {
            currentDraftData = { ...currentDraftData, ...data.draftdata };
            currentPhaseIndex = parseInt(data.draftdata.current_phase) || 0;
            applyServerDataToUI();
        }
    } catch (error) {
        console.error('Draft control error:', error);
    }
}

// Global exports untuk inline onclick/oninput
window.filterDropdown = filterDropdown;
window.hideDropdown = hideDropdown;
window.selectDropdown = selectDropdown;
window.selectHero = selectHero;
