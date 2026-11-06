// public/script/displayeditor.js
// Visual editor for postgame, draft and custom post-draft displays.
(function () {
    'use strict';

    const DEFAULT_DURATIONS = [30, 30, 30, 30, 30, 30, 60, 60, 60, 60, 30, 30, 30, 30, 60, 60, 60];
    const PHASE_LABELS = [
        'Blue Ban 1', 'Red Ban 1', 'Blue Ban 2', 'Red Ban 2', 'Blue Ban 3', 'Red Ban 3',
        'Blue Pick 1', 'Red Pick 1–2', 'Blue Pick 2–3', 'Red Pick 3',
        'Red Ban 4', 'Blue Ban 4', 'Red Ban 5', 'Blue Ban 5',
        'Red Pick 4', 'Blue Pick 4–5', 'Red Pick 5'
    ];

    function s(selector, label, group, extra) {
        return Object.assign({ selector, label, group }, extra || {});
    }

    function heroSlots(team, start, group) {
        const out = [];
        for (let i = 0; i < 5; i++) {
            out.push(s(`#image-display-${start + i}`, `${team} Pick ${i + 1} Hero`, group));
        }
        return out;
    }

    function banSlots(team, start, group) {
        const out = [];
        for (let i = 0; i < 5; i++) {
            out.push(s(`#image-display-${start + i}`, `${team} Ban ${i + 1}`, group));
        }
        return out;
    }

    function photoSlots(team, ids, group) {
        return ids.map((id, index) => s(
            `#name-image-box-${id}`,
            `${team} Player ${index + 1} Photo`,
            group,
            { imageSelector: `#name-image-box-${id} img` }
        ));
    }

    function laneSlots(team, side, group) {
        const out = [];
        for (let i = 1; i <= 5; i++) {
            out.push(s(`#player-lane-${i}-${side}`, `${team} Lane Icon ${i}`, group));
        }
        return out;
    }

    const PAGES = {
        'display.html': {
            label: 'Draft Display',
            slots: [
                s('#displayImage1', 'Blue Team Logo', 'Team Logos'),
                s('#displayImage2', 'Red Team Logo', 'Team Logos'),
                ...heroSlots('Blue', 1, 'Blue Picks'),
                ...photoSlots('Blue', [3, 4, 5, 6, 7], 'Blue Picks'),
                ...laneSlots('Blue', 'blue', 'Blue Picks'),
                ...heroSlots('Red', 6, 'Red Picks'),
                ...photoSlots('Red', [10, 11, 12, 13, 14], 'Red Picks'),
                ...laneSlots('Red', 'red', 'Red Picks'),
                ...banSlots('Blue', 11, 'Blue Bans'),
                ...banSlots('Red', 16, 'Red Bans'),
                s('.tournamentinfo img', 'Tournament Info Image', 'Extras')
            ]
        },
        'postdraftcostum.html': {
            label: 'Custom Post Draft',
            slots: [
                s('#displayImage1', 'Blue Team Logo', 'Team Logos'),
                s('#displayImage2', 'Red Team Logo', 'Team Logos'),
                ...heroSlots('Blue', 1, 'Blue Picks'),
                ...photoSlots('Blue', [3, 4, 5, 6, 7], 'Blue Picks'),
                ...laneSlots('Blue', 'blue', 'Blue Picks'),
                ...heroSlots('Red', 6, 'Red Picks'),
                ...photoSlots('Red', [10, 11, 12, 13, 14], 'Red Picks'),
                ...laneSlots('Red', 'red', 'Red Picks')
            ]
        },
        'postgame.html': {
            label: 'Postgame',
            slots: [
                s('#displayImage1', 'Blue Team Logo', 'Team Logos'),
                s('#displayImage2', 'Red Team Logo', 'Team Logos'),
                ...heroSlots('Blue', 1, 'Blue Players'),
                ...photoSlots('Blue', [3, 4, 5, 6, 7], 'Blue Players'),
                ...banSlots('Blue', 11, 'Blue Bans'),
                ...heroSlots('Red', 6, 'Red Players'),
                ...photoSlots('Red', [10, 11, 12, 13, 14], 'Red Players'),
                ...banSlots('Red', 16, 'Red Bans'),
                s('.tltlogo1', 'Gold / Total Gold Icon', 'Center Stats'),
                s('.tltlogo2', 'Turtle Icon', 'Center Stats'),
                s('.tltlogo3', 'Lord Icon', 'Center Stats'),
                s('.tltlogo4', 'Turret Icon', 'Center Stats')
            ]
        },
        'mvpdisplay.html': {
            label: 'MVP Display',
            slots: [
                s('#mvp-hero-img', 'MVP Hero Portrait', 'MVP Images'),
                s('#mvp-player-photo-img', 'MVP Player Photo', 'MVP Images'),
                s('#mvp-spell-container', 'MVP Spell Icon', 'MVP Images', {
                    imageSelector: '#mvp-spell-container img'
                }),
                ...Array.from({ length: 6 }, (_, index) => {
                    const item = index + 1;
                    const selector = `#mvp-items-container .item-box:nth-child(${item})`;
                    return s(selector, `MVP Item ${item} Icon`, 'MVP Images', {
                        imageSelector: `${selector} img`
                    });
                }),
                s('.mvp-stage', 'MVP Background Wallpaper', 'MVP Layout', { backgroundMode: true }),
                s('.hero-frame', 'Hero Frame', 'MVP Layout'),
                s('.name-block', 'Player Name Block', 'MVP Layout'),
                s('.stats', 'Stats Row', 'MVP Layout'),
                s('.loadout', 'Spell & Items Row', 'MVP Layout'),
                s('.photo-panel', 'Player Photo Panel', 'MVP Layout'),
                s('.watermark', 'MVP Watermark', 'MVP Layout')
            ]
        }
    };

    function previewUrl(page) {
        // MVP display hides itself when there is no MVP unless preview mode is enabled.
        const params = page === 'mvpdisplay.html' ? 'preview=1&de_preview=1' : 'de_preview=1';
        return `${page}?${params}&t=${Date.now()}`;
    }

    const els = {
        displayTabs: document.getElementById('displayTabs'),
        slotPanel: document.getElementById('slotPanel'),
        slotList: document.getElementById('slotList'),
        slotSearch: document.getElementById('slotSearch'),
        pageLabel: document.getElementById('pageLabel'),
        selectionLabel: document.getElementById('selectionLabel'),
        propertyPanel: document.getElementById('propertyPanel'),
        draftPanel: document.getElementById('draftPanel'),
        stage: document.getElementById('stage'),
        stageInner: document.getElementById('stageInner'),
        previewFrame: document.getElementById('previewFrame'),
        selectMode: document.getElementById('selectMode'),
        saveStatus: document.getElementById('saveStatus'),
        reloadPreview: document.getElementById('reloadPreview'),
        resetPage: document.getElementById('resetPage'),
        assetList: document.getElementById('assetList'),
        uploadFile: document.getElementById('uploadFile'),
        draftPhase: document.getElementById('draftPhase'),
        draftTime: document.getElementById('draftTime'),
        draftRunning: document.getElementById('draftRunning'),
        draftSetTime: document.getElementById('draftSetTime'),
        applyDraftTime: document.getElementById('applyDraftTime'),
        autoAdvance: document.getElementById('autoAdvance'),
        phaseDurationList: document.getElementById('phaseDurationList'),
        saveDraftConfig: document.getElementById('saveDraftConfig'),
        resetDraftTiming: document.getElementById('resetDraftTiming')
    };

    let config = { pages: {}, draft: { autoAdvance: true, phaseDurations: DEFAULT_DURATIONS.slice() } };
    let currentPage = 'display.html';
    let selectedSelector = '';
    let saveTimer = null;
    let currentDraft = null;
    let uploadTargetSelector = '';
    let stageScale = 1;

    function pageConfig() {
        if (!config.pages) config.pages = {};
        if (!config.pages[currentPage]) config.pages[currentPage] = { slots: {} };
        if (!config.pages[currentPage].slots) config.pages[currentPage].slots = {};
        return config.pages[currentPage];
    }

    function slotMeta(selector) {
        const page = PAGES[currentPage];
        return page ? page.slots.find(item => item.selector === selector) : null;
    }

    function slotConfig(selector) {
        const saved = pageConfig().slots[selector] || {};
        const meta = slotMeta(selector);
        // Background-only slots must remember that they are not <img> elements.
        if (meta && meta.backgroundMode) {
            return Object.assign({}, saved, { backgroundMode: true });
        }
        return saved;
    }

    function setSlotConfig(selector, next) {
        pageConfig().slots[selector] = next;
    }

    function hasOverride(selector) {
        const slot = slotConfig(selector);
        return Object.keys(slot).some(key => {
            const value = slot[key];
            if (key === 'imageMode') return value === 'custom';
            if (key === 'backgroundMode') return false;
            if (key === 'visible') return value === false;
            if (key === 'scale') return Number(value) !== 1;
            return value !== '' && value !== 0 && value !== undefined && value !== null;
        });
    }

    function setStatus(text, type) {
        els.saveStatus.textContent = text;
        els.saveStatus.className = 'de-status' + (type ? ` ${type}` : '');
    }

    function scheduleSave(delay = 450) {
        setStatus('SAVING…', 'saving');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, delay);
    }

    async function saveNow() {
        clearTimeout(saveTimer);
        try {
            const response = await fetch('/api/display-editor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data && data.config) config = data.config;
            setStatus('SAVED', 'saved');
            setTimeout(() => { if (els.saveStatus.textContent === 'SAVED') setStatus('READY'); }, 1600);
        } catch (error) {
            console.error('Save failed:', error);
            setStatus('SAVE ERROR', 'error');
        }
    }

    async function loadConfig() {
        try {
            const response = await fetch('/api/display-editor?t=' + Date.now(), { cache: 'no-store' });
            if (response.ok) config = await response.json();
        } catch (error) {
            console.warn('Could not load display editor config', error);
        }
        if (!config.pages) config.pages = {};
        if (!config.draft) config.draft = { autoAdvance: true, phaseDurations: DEFAULT_DURATIONS.slice() };
        if (!Array.isArray(config.draft.phaseDurations)) config.draft.phaseDurations = DEFAULT_DURATIONS.slice();
    }

    async function loadAssets() {
        try {
            const response = await fetch('/api/display-editor/assets');
            if (!response.ok) return;
            const data = await response.json();
            const files = Array.isArray(data.files) ? data.files : [];
            els.assetList.innerHTML = files.map(file => `<option value="${file.replace(/"/g, '&quot;')}"></option>`).join('');
        } catch (error) {
            console.warn('Could not load asset list', error);
        }
    }

    function fitStage() {
        if (currentPage === '__draft__') return;
        const rect = els.stage.getBoundingClientRect();
        const availableW = Math.max(200, rect.width - 36);
        const availableH = Math.max(140, rect.height - 36);
        stageScale = Math.min(availableW / 1920, availableH / 1080);
        els.stageInner.style.width = `${Math.round(1920 * stageScale)}px`;
        els.stageInner.style.height = `${Math.round(1080 * stageScale)}px`;
        els.previewFrame.style.transform = `scale(${stageScale})`;
    }

    function applyPreview() {
        try {
            const win = els.previewFrame.contentWindow;
            if (win && typeof win.__displayEditorApply === 'function') {
                win.__displayEditorApply(config);
            }
        } catch (error) { /* iframe not ready */ }
    }

    function previewDoc() {
        try { return els.previewFrame.contentDocument; } catch (error) { return null; }
    }

    function injectPreviewHelpers() {
        const doc = previewDoc();
        if (!doc || !doc.head) return;
        if (!doc.getElementById('de-preview-style')) {
            const style = doc.createElement('style');
            style.id = 'de-preview-style';
            style.textContent = `
                .de-selected { outline: 3px solid #a855f7 !important; outline-offset: 2px !important; }
                .de-hovered { outline: 2px dashed rgba(240, 171, 252, 0.9) !important; outline-offset: 1px !important; }
            `;
            doc.head.appendChild(style);
        }
        bindPreviewEvents(doc);
    }

    function findSlotForElement(el) {
        if (!el || !PAGES[currentPage]) return null;
        let best = null;
        let bestLength = -1;
        if (el.id) {
            const direct = PAGES[currentPage].slots.find(slot => slot.selector === `#${el.id}`);
            if (direct) return direct;
        }
        PAGES[currentPage].slots.forEach(slot => {
            let matched = null;
            try {
                if (el.matches && el.matches(slot.selector)) matched = el;
                else if (el.closest) matched = el.closest(slot.selector);
                // Hero/ban pictures can be empty (0×0); let their visible box select them too.
                if (!matched && slot.selector.indexOf('#image-display-') === 0 && el.querySelector) {
                    matched = el.querySelector(slot.selector);
                }
            } catch (error) { matched = null; }
            if (matched && slot.selector.length > bestLength) {
                best = slot;
                bestLength = slot.selector.length;
            }
        });
        return best;
    }

    function highlightSelection(selector) {
        const doc = previewDoc();
        if (!doc) return;
        doc.querySelectorAll('.de-selected').forEach(el => el.classList.remove('de-selected'));
        if (!selector) return;
        try {
            const el = doc.querySelector(selector);
            if (el) el.classList.add('de-selected');
        } catch (error) { /* ignore */ }
    }

    function bindPreviewEvents(doc) {
        if (!doc || doc.__deBound) return;
        doc.__deBound = true;

        let hovered = null;
        let drag = null;

        const slotFromEvent = event => {
            let el = event.target;
            if (el && el.nodeType === 3) el = el.parentElement;
            return { el, slot: findSlotForElement(el) };
        };

        doc.addEventListener('mousemove', event => {
            if (!els.selectMode.checked || drag) return;
            const { el, slot } = slotFromEvent(event);
            if (hovered && hovered !== el) hovered.classList.remove('de-hovered');
            hovered = slot ? el : null;
            if (hovered) hovered.classList.add('de-hovered');
            doc.body.style.cursor = slot ? 'move' : '';
        });

        doc.addEventListener('mouseleave', () => {
            if (hovered) hovered.classList.remove('de-hovered');
            hovered = null;
        });

        doc.addEventListener('pointerdown', event => {
            if (!els.selectMode.checked || event.button !== 0) return;
            const { el, slot } = slotFromEvent(event);
            if (!slot) return;
            event.preventDefault();
            event.stopPropagation();
            selectSlot(slot.selector, true);
            const cfg = slotConfig(slot.selector);
            drag = {
                selector: slot.selector,
                startX: event.clientX,
                startY: event.clientY,
                baseX: Number(cfg.x) || 0,
                baseY: Number(cfg.y) || 0,
                moved: false
            };
            if (hovered) hovered.classList.remove('de-hovered');
            doc.body.style.cursor = 'grabbing';
        });

        doc.addEventListener('pointermove', event => {
            if (!drag) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
            const slot = slotConfig(drag.selector);
            slot.x = Math.round(drag.baseX + dx);
            slot.y = Math.round(drag.baseY + dy);
            setSlotConfig(drag.selector, slot);
            applyPreview();
            syncGeometryInputs();
            scheduleSave(200);
        });

        const endDrag = () => {
            if (!drag) return;
            const wasMoved = drag.moved;
            drag = null;
            doc.body.style.cursor = '';
            if (wasMoved) scheduleSave(150);
        };
        doc.addEventListener('pointerup', endDrag);
        doc.addEventListener('pointercancel', endDrag);
        doc.addEventListener('click', event => {
            if (!els.selectMode.checked) return;
            const { slot } = slotFromEvent(event);
            if (slot) {
                event.preventDefault();
                event.stopPropagation();
                selectSlot(slot.selector, true);
            }
        }, true);
    }

    function selectSlot(selector, fromPreview) {
        selectedSelector = selector;
        highlightSelection(selector);
        renderProperties();
        renderSlotList();
        els.selectionLabel.textContent = selector ? selector : 'No slot selected';
    }

    function syncGeometryInputs() {
        if (!selectedSelector) return;
        const slot = slotConfig(selectedSelector);
        const values = {
            'prop-x': slot.x ?? 0,
            'prop-y': slot.y ?? 0,
            'prop-scale': slot.scale ?? 1,
            'prop-rotate': slot.rotate ?? 0,
            'prop-opacity': Math.round((slot.opacity ?? 1) * 100),
            'prop-z': slot.zIndex ?? 0
        };
        Object.keys(values).forEach(id => {
            const input = document.getElementById(id);
            if (input && document.activeElement !== input) input.value = values[id];
        });
    }

    function renderSlotList() {
        if (!PAGES[currentPage]) { els.slotList.innerHTML = ''; return; }
        const filter = (els.slotSearch.value || '').trim().toLowerCase();
        const groups = new Map();
        PAGES[currentPage].slots.forEach(slot => {
            if (filter && !slot.label.toLowerCase().includes(filter) && !slot.selector.toLowerCase().includes(filter)) return;
            if (!groups.has(slot.group)) groups.set(slot.group, []);
            groups.get(slot.group).push(slot);
        });
        let html = '';
        groups.forEach((slots, group) => {
            html += `<div class="de-slot-group">${group}</div>`;
            slots.forEach(slot => {
                const active = slot.selector === selectedSelector ? ' active' : '';
                const override = hasOverride(slot.selector) ? ' has-override' : '';
                html += `
                    <button type="button" class="de-slot-btn${active}${override}" data-selector="${slot.selector.replace(/"/g, '&quot;')}">
                        <span class="slot-dot"></span>
                        <span>${slot.label}</span>
                        <small>${override ? 'edited' : ''}</small>
                    </button>`;
            });
        });
        els.slotList.innerHTML = html || '<div class="de-slot-group">No matching slots</div>';
        els.slotList.querySelectorAll('[data-selector]').forEach(button => {
            button.addEventListener('click', () => selectSlot(button.dataset.selector, false));
        });
    }

    function imagePreviewMarkup(slot) {
        if (slot.imageMode === 'custom' && slot.image) {
            return `<img src="${slot.image.replace(/"/g, '&quot;')}" alt="Custom image">`;
        }
        return '<span>Using the picture from match data</span>';
    }

    function renderProperties() {
        els.propertyPanel.hidden = false;
        els.draftPanel.hidden = true;

        if (!selectedSelector || !PAGES[currentPage]) {
            els.propertyPanel.innerHTML = `
                <div class="de-empty-state">
                    <div class="de-empty-icon">◎</div>
                    <h2>Select a slot</h2>
                    <p>Click a picture in the preview, or pick a slot from the left list.</p>
                </div>`;
            return;
        }

        const meta = PAGES[currentPage].slots.find(item => item.selector === selectedSelector);
        const label = meta ? meta.label : selectedSelector;
        const slot = slotConfig(selectedSelector);
        const custom = slot.imageMode === 'custom';
        const fitOptions = ['', 'contain', 'cover', 'fill', 'none', 'scale-down'];
        const fitSelect = fitOptions.map(value => {
            const text = value || 'Default';
            return `<option value="${value}"${(slot.fit || '') === value ? ' selected' : ''}>${text}</option>`;
        }).join('');

        els.propertyPanel.innerHTML = `
            <div class="de-prop-head">
                <h2>${label}</h2>
                <code>${selectedSelector}</code>
            </div>
            <div class="de-prop-body">
                <div class="de-grid-3">
                    <label class="de-field"><span>X (px)</span><input id="prop-x" type="number" step="1" value="${Number(slot.x) || 0}"></label>
                    <label class="de-field"><span>Y (px)</span><input id="prop-y" type="number" step="1" value="${Number(slot.y) || 0}"></label>
                    <label class="de-field"><span>Scale</span><input id="prop-scale" type="number" step="0.01" min="0.02" max="20" value="${slot.scale ?? 1}"></label>
                </div>
                <div class="de-grid-3">
                    <label class="de-field"><span>Rotate °</span><input id="prop-rotate" type="number" step="1" value="${Number(slot.rotate) || 0}"></label>
                    <label class="de-field"><span>Opacity %</span><input id="prop-opacity" type="number" step="1" min="0" max="100" value="${Math.round((slot.opacity ?? 1) * 100)}"></label>
                    <label class="de-field"><span>Z-index</span><input id="prop-z" type="number" step="1" value="${Number(slot.zIndex) || 0}"></label>
                </div>
                <div class="de-grid-2">
                    <label class="de-field"><span>Width</span><input id="prop-width" type="text" placeholder="auto" value="${slot.width || ''}"></label>
                    <label class="de-field"><span>Height</span><input id="prop-height" type="text" placeholder="auto" value="${slot.height || ''}"></label>
                </div>
                <div class="de-grid-2">
                    <label class="de-field"><span>Object fit</span><select id="prop-fit">${fitSelect}</select></label>
                    <label class="de-field"><span>Object position</span><input id="prop-position" type="text" placeholder="center" value="${slot.objectPosition || ''}"></label>
                </div>
                <label class="de-check"><input id="prop-visible" type="checkbox"${slot.visible === false ? '' : ' checked'}> Visible</label>

                <div class="de-subhead">Picture</div>
                <div class="de-image-mode">
                    <button type="button" class="de-btn${custom ? '' : ' active'}" data-image-mode="auto">Auto (match data)</button>
                    <button type="button" class="de-btn${custom ? ' active' : ''}" data-image-mode="custom">Custom image</button>
                </div>
                <div id="imageCustomBox" ${custom ? '' : 'hidden'}>
                    <div class="de-image-preview">${imagePreviewMarkup(slot)}</div>
                    <div class="de-field-row" style="margin-top:8px">
                        <label class="de-field" style="flex:1"><span>Image path</span><input id="prop-image" type="text" list="assetList" placeholder="Assets/HeroPick/Hero.png" value="${(slot.image || '').replace(/"/g, '&quot;')}"></label>
                        <button id="uploadImageBtn" type="button" class="de-btn">Upload</button>
                    </div>
                </div>

                <div class="de-prop-actions">
                    <button id="resetSlotBtn" type="button" class="de-btn danger">Reset Slot</button>
                </div>
            </div>`;

        const bindNumber = (id, key, transform) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.addEventListener('input', () => {
                const value = transform ? transform(input.value) : Number(input.value);
                const slotNext = slotConfig(selectedSelector);
                slotNext[key] = value;
                setSlotConfig(selectedSelector, slotNext);
                applyPreview();
                scheduleSave();
            });
        };

        bindNumber('prop-x', 'x');
        bindNumber('prop-y', 'y');
        bindNumber('prop-scale', 'scale', value => {
            const n = Number(value);
            return Number.isFinite(n) && n > 0 ? n : 1;
        });
        bindNumber('prop-rotate', 'rotate');
        bindNumber('prop-opacity', 'opacity', value => Math.min(1, Math.max(0, (Number(value) || 0) / 100)));
        bindNumber('prop-z', 'zIndex');

        const bindText = (id, key) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.addEventListener('input', () => {
                const slotNext = slotConfig(selectedSelector);
                slotNext[key] = input.value;
                setSlotConfig(selectedSelector, slotNext);
                applyPreview();
                scheduleSave();
            });
        };
        bindText('prop-width', 'width');
        bindText('prop-height', 'height');
        bindText('prop-position', 'objectPosition');

        const fit = document.getElementById('prop-fit');
        fit.addEventListener('change', () => {
            const slotNext = slotConfig(selectedSelector);
            slotNext.fit = fit.value;
            setSlotConfig(selectedSelector, slotNext);
            applyPreview();
            scheduleSave();
        });

        const visible = document.getElementById('prop-visible');
        visible.addEventListener('change', () => {
            const slotNext = slotConfig(selectedSelector);
            slotNext.visible = visible.checked;
            setSlotConfig(selectedSelector, slotNext);
            applyPreview();
            scheduleSave();
            renderSlotList();
        });

        els.propertyPanel.querySelectorAll('[data-image-mode]').forEach(button => {
            button.addEventListener('click', () => {
                const slotNext = slotConfig(selectedSelector);
                slotNext.imageMode = button.dataset.imageMode;
                if (slotNext.imageMode !== 'custom') {
                    slotNext.image = '';
                }
                setSlotConfig(selectedSelector, slotNext);
                applyPreview();
                scheduleSave();
                renderProperties();
                renderSlotList();
            });
        });

        const imageInput = document.getElementById('prop-image');
        if (imageInput) {
            imageInput.addEventListener('input', () => {
                const slotNext = slotConfig(selectedSelector);
                slotNext.imageMode = 'custom';
                slotNext.image = imageInput.value.trim();
                setSlotConfig(selectedSelector, slotNext);
                applyPreview();
                scheduleSave();
                renderSlotList();
                const preview = els.propertyPanel.querySelector('.de-image-preview');
                if (preview) preview.innerHTML = imagePreviewMarkup(slotNext);
            });
        }

        const uploadButton = document.getElementById('uploadImageBtn');
        if (uploadButton) {
            uploadButton.addEventListener('click', () => {
                uploadTargetSelector = selectedSelector;
                els.uploadFile.value = '';
                els.uploadFile.click();
            });
        }

        const resetButton = document.getElementById('resetSlotBtn');
        resetButton.addEventListener('click', () => {
            delete pageConfig().slots[selectedSelector];
            applyPreview();
            scheduleSave();
            renderProperties();
            renderSlotList();
        });
    }

    function renderDraftPanel() {
        els.propertyPanel.hidden = true;
        els.draftPanel.hidden = false;
        els.slotPanel.hidden = true;

        if (!config.draft) config.draft = { autoAdvance: true, phaseDurations: DEFAULT_DURATIONS.slice() };
        if (!Array.isArray(config.draft.phaseDurations)) config.draft.phaseDurations = DEFAULT_DURATIONS.slice();
        els.autoAdvance.checked = config.draft.autoAdvance !== false;

        els.phaseDurationList.innerHTML = PHASE_LABELS.map((label, index) => `
            <div class="de-phase-row" data-phase-row="${index}">
                <b>${String(index + 1).padStart(2, '0')}</b>
                <span>${label}</span>
                <input type="number" min="1" max="3600" step="1" data-phase-input="${index}" value="${config.draft.phaseDurations[index] ?? DEFAULT_DURATIONS[index]}">
            </div>`).join('');

        els.phaseDurationList.querySelectorAll('[data-phase-input]').forEach(input => {
            input.addEventListener('change', () => {
                const index = Number(input.dataset.phaseInput);
                const value = Math.min(3600, Math.max(1, Math.round(Number(input.value) || 1)));
                input.value = value;
                config.draft.phaseDurations[index] = value;
                scheduleSave();
            });
        });

        els.autoAdvance.onchange = () => {
            config.draft.autoAdvance = els.autoAdvance.checked;
            scheduleSave();
        };

        updateDraftStatus(currentDraft);
    }

    function updateDraftStatus(draft) {
        if (draft) currentDraft = draft;
        if (!els.draftPanel || els.draftPanel.hidden) return;
        if (!currentDraft) {
            els.draftPhase.textContent = '—';
            els.draftTime.textContent = '—';
            els.draftRunning.textContent = '—';
            return;
        }
        const phase = Number(currentDraft.current_phase) || 0;
        els.draftPhase.textContent = PHASE_LABELS[phase] || `Phase ${phase + 1}`;
        els.draftTime.textContent = `${currentDraft.timer ?? '0'}s`;
        els.draftRunning.textContent = currentDraft.timer_running ? 'RUNNING' : 'PAUSED';
        els.phaseDurationList.querySelectorAll('[data-phase-row]').forEach(row => {
            row.classList.toggle('active', Number(row.dataset.phaseRow) === phase);
        });
    }

    async function refreshDraftState() {
        try {
            const response = await fetch('/api/draft-state?t=' + Date.now(), { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            if (data && data.draftdata) updateDraftStatus(data.draftdata);
        } catch (error) { /* ignore */ }
    }

    function selectPage(page) {
        currentPage = page;
        selectedSelector = '';
        highlightSelection('');
        document.querySelectorAll('.de-display-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.page === page);
        });

        if (page === '__draft__') {
            els.pageLabel.textContent = 'Draft Timing';
            els.selectionLabel.textContent = 'Draft countdown & phase settings';
            els.slotPanel.hidden = true;
            // Keep the draft display visible so the live countdown can be watched,
            // but block click-to-select while the timing panel is open.
            els.previewFrame.style.pointerEvents = 'none';
            if (els.previewFrame.dataset.page !== 'display.html') {
                els.previewFrame.dataset.page = 'display.html';
                els.previewFrame.src = previewUrl('display.html');
            } else {
                fitStage();
            }
            renderDraftPanel();
            refreshDraftState();
            return;
        }

        els.slotPanel.hidden = false;
        els.previewFrame.style.pointerEvents = '';
        els.pageLabel.textContent = PAGES[page] ? PAGES[page].label : page;
        els.selectionLabel.textContent = 'No slot selected';
        renderSlotList();
        renderProperties();

        if (els.previewFrame.dataset.page !== page) {
            els.previewFrame.dataset.page = page;
            els.previewFrame.src = previewUrl(page);
        } else {
            applyPreview();
        }
    }

    function setupPreviewLoad() {
        els.previewFrame.addEventListener('load', () => {
            fitStage();
            if (currentPage === '__draft__') return;
            injectPreviewHelpers();
            applyPreview();
            if (selectedSelector) highlightSelection(selectedSelector);
        });
    }

    function connectSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        let socket;
        try { socket = new WebSocket(`${protocol}://${window.location.host}`); } catch (error) { return; }
        socket.onmessage = event => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'draftdata_update' && msg.data) updateDraftStatus(msg.data);
                else if (msg.type === 'update' && msg.data && msg.data.draftdata) {
                    updateDraftStatus(Object.assign({}, currentDraft || {}, msg.data.draftdata));
                }
            } catch (error) { /* ignore */ }
        };
        socket.onclose = () => setTimeout(connectSocket, 4000);
    }

    function setupDraftControls() {
        document.querySelectorAll('[data-draft-action]').forEach(button => {
            button.addEventListener('click', async () => {
                const action = button.dataset.draftAction;
                button.disabled = true;
                try {
                    const response = await fetch('/api/draft-control', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action })
                    });
                    const data = await response.json();
                    if (data && data.draftdata) updateDraftStatus(data.draftdata);
                } catch (error) {
                    console.error('Draft action failed', error);
                } finally {
                    button.disabled = false;
                    refreshDraftState();
                }
            });
        });

        els.applyDraftTime.addEventListener('click', async () => {
            const seconds = Math.max(0, Math.min(3600, Math.round(Number(els.draftSetTime.value) || 0)));
            try {
                const response = await fetch('/api/draft-control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'setRemaining', seconds })
                });
                const data = await response.json();
                if (data && data.draftdata) updateDraftStatus(data.draftdata);
            } catch (error) {
                console.error('Set timer failed', error);
            }
        });

        els.saveDraftConfig.addEventListener('click', async () => {
            await saveNow();
            refreshDraftState();
        });

        els.resetDraftTiming.addEventListener('click', () => {
            config.draft.phaseDurations = DEFAULT_DURATIONS.slice();
            renderDraftPanel();
            scheduleSave();
        });

        els.uploadFile.addEventListener('change', async () => {
            const file = els.uploadFile.files && els.uploadFile.files[0];
            if (!file || !uploadTargetSelector) return;
            const form = new FormData();
            // Multer fills the filename from req.body.slot, so send it before the file.
            form.append('slot', uploadTargetSelector.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48));
            form.append('file', file);
            setStatus('UPLOADING…', 'saving');
            try {
                const response = await fetch('/api/display-editor/upload', { method: 'POST', body: form });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (data.path) {
                    const slot = slotConfig(uploadTargetSelector);
                    slot.imageMode = 'custom';
                    slot.image = data.path;
                    setSlotConfig(uploadTargetSelector, slot);
                    applyPreview();
                    scheduleSave(100);
                    if (selectedSelector === uploadTargetSelector) renderProperties();
                    renderSlotList();
                }
            } catch (error) {
                console.error('Upload failed', error);
                setStatus('UPLOAD ERROR', 'error');
            }
        });
    }

    function init() {
        setupPreviewLoad();
        setupDraftControls();
        connectSocket();

        els.displayTabs.addEventListener('click', event => {
            const tab = event.target.closest('.de-display-tab');
            if (!tab) return;
            selectPage(tab.dataset.page);
        });

        els.slotSearch.addEventListener('input', renderSlotList);

        els.reloadPreview.addEventListener('click', () => {
            if (currentPage === '__draft__') {
                els.previewFrame.dataset.page = 'display.html';
                els.previewFrame.src = previewUrl('display.html');
            } else {
                els.previewFrame.src = previewUrl(currentPage);
            }
        });

        els.resetPage.addEventListener('click', () => {
            if (currentPage === '__draft__') return;
            if (!confirm(`Clear all saved layout/image overrides for ${currentPage}?`)) return;
            config.pages[currentPage] = { slots: {} };
            selectedSelector = '';
            applyPreview();
            highlightSelection('');
            scheduleSave(50);
            renderSlotList();
            renderProperties();
        });

        window.addEventListener('resize', fitStage);

        loadConfig().then(() => {
            loadAssets();
            const requested = new URLSearchParams(window.location.search).get('page');
            const initialPage = (requested === '__draft__' || (requested && PAGES[requested]))
                ? requested
                : 'display.html';
            selectPage(initialPage);
            refreshDraftState();
            setInterval(refreshDraftState, 2000);
        });
    }

    init();
})();
