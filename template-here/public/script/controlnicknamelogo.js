// controlnicknamelogo.js (Versi API Node.js - Preserving Other Data + Lane Support)

// Variabel global untuk menyimpan state logo di memori browser
let currentBlueLogo = "";
let currentRedLogo = "";

// --- FUNGSI UTAMA: LOAD & SAVE DATA ---

// Mengambil data dari Server dan mengisi Input Form
async function loadFromServer() {
    try {
        const response = await fetch('/api/matchdata');
        const data = await response.json();

        // Cek struktur data agar tidak error
        if (!data.teamdata) return;

        const blue = data.teamdata.blueteam;
        const red = data.teamdata.redteam;

        // --- LOAD BLUE TEAM (Nama, Skor, Logo) ---
        document.getElementById('name-input-1').value = blue.teamname || "";
        document.getElementById('name-input-2').value = blue.score || "";
        currentBlueLogo = blue.logo || ""; 

        // Player Name & Lane Biru (Index 3-7)
        for(let i=0; i<5; i++) {
            const player = (blue.playerlist && blue.playerlist[i]) ? blue.playerlist[i] : {};
            const inputEl = document.getElementById(`name-input-${3+i}`);
            if (inputEl) {
                inputEl.value = player.name || "";
                inputEl.dataset.photo = player.photo || "";
            }
            const playerLane = player.lane || player.role || "none";
            const laneSelect = document.getElementById(`lane-select-${3+i}`);
            if (laneSelect) laneSelect.value = playerLane;
        }

        // --- LOAD RED TEAM (Nama, Skor, Logo) ---
        document.getElementById('name-input-8').value = red.teamname || "";
        document.getElementById('name-input-9').value = red.score || "";
        currentRedLogo = red.logo || ""; 

        // Player Name & Lane Merah (Index 10-14)
        for(let i=0; i<5; i++) {
            const player = (red.playerlist && red.playerlist[i]) ? red.playerlist[i] : {};
            const inputEl = document.getElementById(`name-input-${10+i}`);
            if (inputEl) {
                inputEl.value = player.name || "";
                inputEl.dataset.photo = player.photo || "";
            }
            const playerLane = player.lane || player.role || "none";
            const laneSelect = document.getElementById(`lane-select-${10+i}`);
            if (laneSelect) laneSelect.value = playerLane;
        }

        window.dispatchEvent(new CustomEvent('matchdata_loaded', { detail: data }));

    } catch (error) {
        console.error("Gagal memuat data:", error);
    }
}

// FUNGSI SAVE YANG AMAN
async function saveToServer() {
    try {
        // 1. AMBIL DATA TERBARU DARI SERVER DULU
        const getResponse = await fetch('/api/matchdata');
        let fullData = await getResponse.json();

        if (!fullData.teamdata) fullData.teamdata = {};
        if (!fullData.teamdata.blueteam) fullData.teamdata.blueteam = {};
        if (!fullData.teamdata.redteam) fullData.teamdata.redteam = {};
        if (!Array.isArray(fullData.teamdata.blueteam.playerlist)) fullData.teamdata.blueteam.playerlist = [];
        if (!Array.isArray(fullData.teamdata.redteam.playerlist)) fullData.teamdata.redteam.playerlist = [];

        // 2. MODIFIKASI FIELD DARI UI
        
        // --- Update Blue Team ---
        fullData.teamdata.blueteam.teamname = document.getElementById('name-input-1').value;
        fullData.teamdata.blueteam.score = document.getElementById('name-input-2').value;
        if (currentBlueLogo) {
            fullData.teamdata.blueteam.logo = currentBlueLogo;
        } else if (fullData.teamdata.blueteam.logo) {
            currentBlueLogo = fullData.teamdata.blueteam.logo;
        }

        const bluePresetSelect = document.getElementById('preset-blue-team');
        if (bluePresetSelect && bluePresetSelect.value) {
            fullData.teamdata.blueteam.presetId = bluePresetSelect.value;
        }

        // Update Player Names & Lanes Biru
        for(let i=0; i<5; i++) {
            if (!fullData.teamdata.blueteam.playerlist[i]) fullData.teamdata.blueteam.playerlist[i] = {}; 
            const inputEl = document.getElementById(`name-input-${3+i}`);
            fullData.teamdata.blueteam.playerlist[i].name = inputEl ? inputEl.value : "";
            const laneEl = document.getElementById(`lane-select-${3+i}`);
            const laneVal = laneEl ? laneEl.value : "none";
            fullData.teamdata.blueteam.playerlist[i].lane = laneVal;
            fullData.teamdata.blueteam.playerlist[i].role = laneVal;
            if (inputEl && inputEl.dataset && inputEl.dataset.photo !== undefined) {
                fullData.teamdata.blueteam.playerlist[i].photo = inputEl.dataset.photo;
            }
        }

        // --- Update Red Team ---
        fullData.teamdata.redteam.teamname = document.getElementById('name-input-8').value;
        fullData.teamdata.redteam.score = document.getElementById('name-input-9').value;
        if (currentRedLogo) {
            fullData.teamdata.redteam.logo = currentRedLogo;
        } else if (fullData.teamdata.redteam.logo) {
            currentRedLogo = fullData.teamdata.redteam.logo;
        }

        const redPresetSelect = document.getElementById('preset-red-team');
        if (redPresetSelect && redPresetSelect.value) {
            fullData.teamdata.redteam.presetId = redPresetSelect.value;
        }

        // Update Player Names & Lanes Merah
        for(let i=0; i<5; i++) {
            if (!fullData.teamdata.redteam.playerlist[i]) fullData.teamdata.redteam.playerlist[i] = {}; 
            const inputEl = document.getElementById(`name-input-${10+i}`);
            fullData.teamdata.redteam.playerlist[i].name = inputEl ? inputEl.value : "";
            const laneEl = document.getElementById(`lane-select-${10+i}`);
            const laneVal = laneEl ? laneEl.value : "none";
            fullData.teamdata.redteam.playerlist[i].lane = laneVal;
            fullData.teamdata.redteam.playerlist[i].role = laneVal;
            if (inputEl && inputEl.dataset && inputEl.dataset.photo !== undefined) {
                fullData.teamdata.redteam.playerlist[i].photo = inputEl.dataset.photo;
            }
        }

        // 3. KIRIM DATA LENGKAP KEMBALI KE SERVER
        await fetch('/api/matchdata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullData)
        });

    } catch (error) {
        console.error("Gagal menyimpan data (Save Error):", error);
    }
}

// --- EVENT HANDLERS ---

// Auto Save saat mengetik atau mengganti dropdown
function setupAutoSave() {
    // Listener untuk Input Nama (1-14)
    for (let i = 1; i <= 14; i++) {
        const input = document.getElementById(`name-input-${i}`);
        if (input) {
            input.addEventListener('input', saveToServer);
        }
    }

    // Listener untuk Dropdown Lane (3-7 & 10-14)
    const laneIndices = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
    laneIndices.forEach(i => {
        const select = document.getElementById(`lane-select-${i}`);
        if (select) {
            select.addEventListener('change', saveToServer); // Gunakan 'change' untuk dropdown
        }
    });
}

// Handle Upload Logo
function setupLogoUpload() {
    document.getElementById('file1').addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentBlueLogo = e.target.result; 
                saveToServer(); 
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('file2').addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentRedLogo = e.target.result;
                saveToServer();
            };
            reader.readAsDataURL(file);
        }
    });
}

// --- LOGIKA TOMBOL (Reset, Switch, Swap) ---

async function resetNames() {
    // 1. Reset Nama
    for (let i = 1; i <= 14; i++) {
        const input = document.getElementById(`name-input-${i}`);
        if(input) input.value = "";
    }

    // 2. Reset Lane ke 'none'
    const laneIndices = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
    laneIndices.forEach(i => {
        const select = document.getElementById(`lane-select-${i}`);
        if(select) select.value = "none";
    });

    await saveToServer(); 
}

async function resetImages() {
    currentBlueLogo = "";
    currentRedLogo = "";
    document.getElementById('file1').value = ""; 
    document.getElementById('file2').value = ""; 
    await saveToServer();
}

async function switchNames() {
    // 1. Ambil nilai UI saat ini (lokal) - Nama & Score
    let blueTeamName = document.getElementById('name-input-1').value;
    let blueScore = document.getElementById('name-input-2').value;
    
    // Ambil Player, Lane, Photo, Dropdown Biru
    let bluePlayers = [];
    let blueLanes = [];
    let bluePhotos = [];
    let blueSelects = [];
    for(let i=3; i<=7; i++) {
        const inp = document.getElementById(`name-input-${i}`);
        const lane = document.getElementById(`lane-select-${i}`);
        const sel = document.getElementById(`player-select-${i}`);
        bluePlayers.push(inp ? inp.value : "");
        blueLanes.push(lane ? lane.value : "none");
        bluePhotos.push(inp && inp.dataset ? (inp.dataset.photo || "") : "");
        blueSelects.push(sel ? sel.value : "");
    }

    // Ambil Player, Lane, Photo, Dropdown Merah
    let redTeamName = document.getElementById('name-input-8').value;
    let redScore = document.getElementById('name-input-9').value;
    let redPlayers = [];
    let redLanes = [];
    let redPhotos = [];
    let redSelects = [];
    for(let i=10; i<=14; i++) {
        const inp = document.getElementById(`name-input-${i}`);
        const lane = document.getElementById(`lane-select-${i}`);
        const sel = document.getElementById(`player-select-${i}`);
        redPlayers.push(inp ? inp.value : "");
        redLanes.push(lane ? lane.value : "none");
        redPhotos.push(inp && inp.dataset ? (inp.dataset.photo || "") : "");
        redSelects.push(sel ? sel.value : "");
    }

    // Tukar Preset Team Dropdowns jika ada
    const bluePresetEl = document.getElementById('preset-blue-team');
    const redPresetEl = document.getElementById('preset-red-team');
    if (bluePresetEl && redPresetEl) {
        const tempPreset = bluePresetEl.value;
        bluePresetEl.value = redPresetEl.value;
        redPresetEl.value = tempPreset;
    }

    // 2. Tukar Nilai di UI
    // Set Sisi Biru dengan data Merah
    document.getElementById('name-input-1').value = redTeamName;
    document.getElementById('name-input-2').value = redScore;
    for(let i=0; i<5; i++) {
        const inp = document.getElementById(`name-input-${3+i}`);
        const lane = document.getElementById(`lane-select-${3+i}`);
        const sel = document.getElementById(`player-select-${3+i}`);
        if (inp) {
            inp.value = redPlayers[i];
            inp.dataset.photo = redPhotos[i];
        }
        if (lane) lane.value = redLanes[i];
        if (sel) sel.value = redSelects[i];
    }

    // Set Sisi Merah dengan data Biru
    document.getElementById('name-input-8').value = blueTeamName;
    document.getElementById('name-input-9').value = blueScore;
    for(let i=0; i<5; i++) {
        const inp = document.getElementById(`name-input-${10+i}`);
        const lane = document.getElementById(`lane-select-${10+i}`);
        const sel = document.getElementById(`player-select-${10+i}`);
        if (inp) {
            inp.value = bluePlayers[i];
            inp.dataset.photo = bluePhotos[i];
        }
        if (lane) lane.value = blueLanes[i];
        if (sel) sel.value = blueSelects[i];
    }

    // 3. Simpan
    await saveToServer();
}

async function switchImages() {
    let temp = currentBlueLogo;
    currentBlueLogo = currentRedLogo;
    currentRedLogo = temp;
    await saveToServer();
}

// SWAP INDIVIDUAL (Logic Swap Player + Lane)
let firstSwapSelection = null;

function handleSwapClick(index, button) {
    if (firstSwapSelection === null) {
        // Klik Pertama (Pilih sumber)
        firstSwapSelection = { index: index, button: button };
        button.textContent = "Cancel";
        button.style.backgroundColor = '#ffc107';
    } else {
        // Klik Kedua (Pilih target)
        if (firstSwapSelection.index === index) {
            // Jika klik tombol yang sama -> Cancel
            resetSwapUI();
            return;
        }

        // Ambil Elemen Input & Select
        const input1 = document.getElementById(`name-input-${firstSwapSelection.index}`);
        const lane1 = document.getElementById(`lane-select-${firstSwapSelection.index}`);
        
        const input2 = document.getElementById(`name-input-${index}`);
        const lane2 = document.getElementById(`lane-select-${index}`);

        // Swap Nama
        const tempVal = input1.value;
        input1.value = input2.value;
        input2.value = tempVal;

        // Swap Photo dataset
        const tempPhoto = input1.dataset.photo || '';
        input1.dataset.photo = input2.dataset.photo || '';
        input2.dataset.photo = tempPhoto;

        // Swap Lane (Pastikan elemen ada sebelum swap)
        if (lane1 && lane2) {
            const tempLane = lane1.value;
            lane1.value = lane2.value;
            lane2.value = tempLane;
        }

        // Swap Player Dropdown
        const playerSelect1 = document.getElementById(`player-select-${firstSwapSelection.index}`);
        const playerSelect2 = document.getElementById(`player-select-${index}`);
        if (playerSelect1 && playerSelect2) {
            const tempSel = playerSelect1.value;
            playerSelect1.value = playerSelect2.value;
            playerSelect2.value = tempSel;
        }

        saveToServer(); 
        resetSwapUI();
    }
}

function resetSwapUI() {
    if (firstSwapSelection) {
        firstSwapSelection.button.textContent = "Swap";
        firstSwapSelection.button.style.backgroundColor = '';
        firstSwapSelection = null;
    }
    const allButtons = document.querySelectorAll('button[id^="swap-btn-"]');
    allButtons.forEach(btn => {
        btn.textContent = "Swap";
        btn.style.backgroundColor = '';
    });
}

// --- INITIALIZATION ---

function initializeApp() {
    loadFromServer(); 
    setupAutoSave(); 
    setupLogoUpload(); 
}

window.onload = initializeApp;