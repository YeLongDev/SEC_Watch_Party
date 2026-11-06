// public/script/display-editor-apply.js
// Applies live layout/image overrides saved by displayeditor.html.
// Include this AFTER the normal display scripts so its observers win.
(function () {
    'use strict';

    const pageKey = (window.location.pathname.split('/').pop() || '').split('?')[0];
    const applied = new Map(); // selector -> { el, props:[], imageEl, imageLock }
    const imageLocks = new WeakMap();
    const containerLocks = new WeakMap();

    function asCssSize(value) {
        const text = String(value == null ? '' : value).trim();
        if (!text) return '';
        return /^-?\d+(\.\d+)?$/.test(text) ? `${text}px` : text;
    }

    function clearElementOverrides(entry) {
        if (!entry) return;
        if (entry.el && entry.props) {
            entry.props.forEach(prop => entry.el.style.removeProperty(prop));
        }
        if (entry.imageEl && entry.imageProps) {
            entry.imageProps.forEach(prop => entry.imageEl.style.removeProperty(prop));
        }
        if (entry.imageLock) unlockImage(entry.imageLock);
    }

    function unlockImage(lock) {
        if (!lock) return;
        if (lock.isContainer) {
            if (lock.observer) lock.observer.disconnect();
            if (lock.inner) unlockImage(lock.inner);
            if (lock.target) containerLocks.delete(lock.target);
            return;
        }
        if (lock.observer) lock.observer.disconnect();
        const img = lock.el;
        if (img && lock.originalSrc !== undefined) {
            // Restore the original image only if our override is still showing.
            if (img.src === lock.resolvedSrc || img.getAttribute('data-de-custom') === '1') {
                img.src = lock.originalSrc || '';
            }
            img.removeAttribute('data-de-custom');
        }
        imageLocks.delete(lock.el);
    }

    function resolveImageElement(target, slot) {
        if (!target) return null;
        if (slot.imageSelector) {
            try { return document.querySelector(slot.imageSelector); } catch (error) { /* ignore bad selector */ }
        }
        if (target.tagName === 'IMG') return target;
        return target.querySelector('img');
    }

    function lockImage(target, slot, src, selector) {
        const imageSelector = slot.imageSelector || '';

        // Player photos are re-created (`container.innerHTML = ''`) whenever match data
        // updates, so keep watching the container and re-lock the newest <img>.
        if (imageSelector) {
            const prior = containerLocks.get(target);
            if (prior && prior.src === src) return prior;
            if (prior) unlockImage(prior);

            const getImage = () => {
                try {
                    const el = document.querySelector(imageSelector);
                    return el && el.tagName === 'IMG' ? el : null;
                } catch (error) { return null; }
            };

            const lock = { isContainer: true, target, src, inner: null, observer: null };
            const refresh = () => {
                const img = getImage();
                if (!img) return;
                if (lock.inner && lock.inner.el && lock.inner.el !== img) {
                    if (lock.inner.observer) lock.inner.observer.disconnect();
                    imageLocks.delete(lock.inner.el);
                }
                lock.inner = applyImageLock(img, src);
            };

            refresh();
            lock.observer = new MutationObserver(refresh);
            lock.observer.observe(target, { childList: true, subtree: true });
            containerLocks.set(target, lock);
            return lock;
        }

        const getImage = () => (target.tagName === 'IMG' ? target : target.querySelector('img'));
        const img = getImage();
        if (!img) {
            const observer = new MutationObserver(() => {
                const next = getImage();
                if (next) {
                    observer.disconnect();
                    const nextLock = applyImageLock(next, src);
                    const entry = applied.get(selector);
                    if (entry) entry.imageLock = nextLock;
                }
            });
            observer.observe(target, { childList: true, subtree: true });
            return { el: null, observer, src };
        }

        return applyImageLock(img, src);
    }

    function applyImageLock(img, src) {
        const existing = imageLocks.get(img);
        if (existing && existing.src === src) return existing;

        const originalSrc = existing ? existing.originalSrc : (img.getAttribute('src') || '');
        const lock = { el: img, src, originalSrc, resolvedSrc: '', observer: null };
        imageLocks.set(img, lock);

        const enforce = () => {
            const wanted = lock.src;
            if (!wanted) return;
            const resolved = new URL(wanted, document.baseURI).href;
            lock.resolvedSrc = resolved;
            if (img.src !== resolved) {
                img.setAttribute('data-de-custom', '1');
                img.src = wanted;
            }
        };

        enforce();
        lock.observer = new MutationObserver(() => {
            const raw = img.getAttribute('src');
            if (img.src !== lock.resolvedSrc) {
                // Another script changed the picture. Remember its value so clearing the
                // override later can restore the newest picture instead of an old one.
                if (raw !== null && raw !== lock.src) lock.originalSrc = raw;
                enforce();
            } else if (img.getAttribute('data-de-custom') !== '1') {
                img.setAttribute('data-de-custom', '1');
            }
        });
        lock.observer.observe(img, { attributes: true, attributeFilter: ['src'] });
        return lock;
    }

    function applySlot(selector, slot) {
        let target = null;
        try { target = document.querySelector(selector); } catch (error) { return; }
        if (!target) return;

        const prior = applied.get(selector);
        if (prior && prior.el !== target) {
            clearElementOverrides(prior);
            applied.delete(selector);
        }

        const entry = applied.get(selector) || { el: target, props: [], imageProps: [] };
        entry.props.forEach(prop => target.style.removeProperty(prop));
        entry.props = [];
        if (entry.imageEl && entry.imageProps) {
            entry.imageProps.forEach(prop => entry.imageEl.style.removeProperty(prop));
        }
        entry.imageProps = [];

        const setProp = (prop, value) => {
            if (value === '' || value == null) return;
            target.style.setProperty(prop, value, 'important');
            entry.props.push(prop);
        };

        if (slot.x !== undefined || slot.y !== undefined) {
            setProp('translate', `${Number(slot.x) || 0}px ${Number(slot.y) || 0}px`);
        }
        if (slot.scale !== undefined) setProp('scale', String(Number(slot.scale) || 1));
        if (slot.rotate !== undefined) setProp('rotate', `${Number(slot.rotate) || 0}deg`);
        if (slot.opacity !== undefined) setProp('opacity', String(Math.min(1, Math.max(0, Number(slot.opacity)))));
        if (slot.width !== undefined && String(slot.width).trim() !== '') setProp('width', asCssSize(slot.width));
        if (slot.height !== undefined && String(slot.height).trim() !== '') setProp('height', asCssSize(slot.height));
        if (slot.zIndex !== undefined) setProp('z-index', String(Math.round(Number(slot.zIndex) || 0)));
        if (slot.visible === false) setProp('display', 'none');

        const forceBackground = slot.backgroundMode === true;
        const imageEl = forceBackground ? null : resolveImageElement(target, slot);
        if (imageEl) {
            entry.imageEl = imageEl;
            const setImageProp = (prop, value) => {
                if (!value) return;
                imageEl.style.setProperty(prop, value, 'important');
                entry.imageProps.push(prop);
            };
            setImageProp('object-fit', slot.fit);
            setImageProp('object-position', slot.objectPosition);
        }

        if (slot.imageMode === 'custom' && slot.image) {
            if (!forceBackground && (imageEl || slot.imageSelector)) {
                entry.imageLock = lockImage(target, slot, slot.image, selector);
            } else {
                // Some slots are simple divs with a CSS background image (postgame stat icons,
                // the MVP wallpaper, etc.).
                setProp('background-image', `url("${String(slot.image).replace(/"/g, '%22')}")`);
                setProp('background-size', slot.fit || (forceBackground ? 'cover' : 'contain'));
                setProp('background-position', slot.objectPosition || 'center');
                setProp('background-repeat', 'no-repeat');
            }
        } else if (entry.imageLock) {
            unlockImage(entry.imageLock);
            entry.imageLock = null;
        }

        applied.set(selector, entry);
    }

    function applyConfig(config) {
        if (!config || !config.pages) return;
        window.__lastDisplayEditorConfig = config;
        const page = config.pages[pageKey];
        const slots = (page && page.slots) ? page.slots : {};

        // Remove overrides for slots that were deleted from the config.
        Array.from(applied.keys()).forEach(selector => {
            if (!Object.prototype.hasOwnProperty.call(slots, selector)) {
                clearElementOverrides(applied.get(selector));
                applied.delete(selector);
            }
        });

        Object.keys(slots).forEach(selector => applySlot(selector, slots[selector] || {}));
    }

    window.__displayEditorApply = applyConfig;
    window.__displayEditorReapply = function () {
        if (window.__lastDisplayEditorConfig) applyConfig(window.__lastDisplayEditorConfig);
    };
    window.__displayEditorPageKey = pageKey;

    async function loadAndApply() {
        try {
            const response = await fetch('/api/display-editor?t=' + Date.now(), { cache: 'no-store' });
            if (!response.ok) return;
            applyConfig(await response.json());
        } catch (error) {
            console.warn('Display editor config could not load:', error);
        }
    }

    function connectSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        let socket;
        try { socket = new WebSocket(`${protocol}://${window.location.host}`); } catch (error) { return; }
        socket.onmessage = event => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'displayeditor_update' && msg.data) applyConfig(msg.data);
            } catch (error) { /* ignore */ }
        };
        socket.onclose = () => setTimeout(connectSocket, 4000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { loadAndApply(); connectSocket(); });
    } else {
        loadAndApply();
        connectSocket();
    }
})();
