# PROJECT GUIDE — False MLBB Overlay Tool + SEC Series Overlays

> **Purpose of this file:** This is a handoff document. A new AI session (or developer) should be able to
> read this once and immediately understand the whole project, then safely create or remodel overlays.
> **Last analyzed:** 2026-11-03. If code disagrees with this file, trust the code and update this file.

---

## 0. SESSION STATE (update this section each session)

This section is the live "where we left off" note. Keep it short (5–15 lines). Everything below
§1 describes the project itself and changes rarely; this section changes every session.

| Field | Value |
|---|---|
| **Objective** | Fix live synchronization and rendering delays on `display.html` (draftpick) and `postdraft.html`. |
| **Status** | **Completed:** 1) Fixed race condition in `herodropdown.js` & `herodropdownban6.js` where `checkPhaseCompletion()` skipped `saveDraftData()` when all phase dropdowns were filled. 2) Added draft save request queueing (`hasPendingDraftSave`) to prevent dropped saves when `isSaving` is busy. 3) Added fallback matchdata merge and 500ms dirty-check polling in `displayhero.js` & `displayheroban6.js` so draftpick and postdraft overlays update live even if WebSocket drops or draftdata was wiped. 4) Cut artificial 2-second CSS animation delay in `display.css` and `display2.css` down to 0.35s for instant snappy renders. 5) Resilient dual-path fetching in `laneimg.js` (`/api/matchdata` + `database/matchdatateam.json`). 6) Verified all 42 HTML overlay and controller files. |
| **Awaiting** | Operator to start server (`FALSEMLBBOVERLAYTOOL.BAT`) and test live draft picking and postdraft overlays. |
| **Blocked** | Nothing. |
| **Next move** | Start `FALSEMLBBOVERLAYTOOL.BAT` and verify draft picks update simultaneously on `display.html`, `postdraft.html`, and `postgame.html`. |

**Rules carried from the original request:**
- The guide must stay durable and readable by a fresh session without token overflow.
- It must always contain a ready-to-paste prompt (§15) for a new session.
- Vanilla HTML/CSS/JS + Node/Express/`ws`, no build step. SEC overlays are fixed 1920×1080;
  the original family is theme-engine driven.
- Do not modify working code without understanding it. Backups exist in `_backup_before_sec/`
  and `_backup_watermark_originals/` — reference only, never edit or serve them.
- Flag (do not print) the exposed GitHub PAT in `github_config.json` (§13.1).

---

## 1. TL;DR — What this project is

A **local Node.js broadcast-overlay toolkit for Mobile Legends: Bang Bang (MLBB) tournaments**, controlled
from browser pages and rendered as transparent 1920×1080 browser sources in OBS.

- **Backend:** `server.js` — Express 5 + `ws` (WebSocket) + `multer` uploads.
- **Frontend:** static HTML/CSS/vanilla-JS in `public/`, no build step, no framework.
- **Communication:** REST (`/api/*`) for writes and initial loads; WebSocket for realtime fan-out.
- **Persistence:** JSON files in `public/database/` (plus `public/Assets/costum/Theme/theme.json`),
  mirrored in an in-memory cache and written through a serialized async file queue.
- **Two visual families:**
  1. **Original / Custom** (cyan-red esports theme, theme-engine driven).
  2. **SEC Series** (purple/lilac tournament package; newer, added on top).
- **Launcher:** Windows `.bat` files that detect LAN IP, write `public/serverip.txt`, open `hub.html`,
  then start `node server.js` on **port 3000**.
- **Hub:** `public/hub.html` is the command center that lists every control/display page as cards and
  copies localhost/LAN URLs.

There is **no authentication**. Everything is intended for a trusted LAN / local machine.

---

## 2. How to run

```bat
FALSEMLBBOVERLAYTOOL.BAT
```

or manually:

```bat
node server.js
```

- Local: `http://localhost:3000`
- LAN: `http://<server-ip>:3000`
- Hub: `http://localhost:3000/hub.html`
- Port is hard-coded to `3000` in `server.js` (line ~875).
- `app.use(express.static('public'))` is **relative to the current working directory**, so always run
  `node server.js` from the project root.
- `FALSEMLBBOVELAYFIX.bat` is an older/alternate launcher.

Dependencies (`package.json`): `express ^5.1.0`, `multer ^2.0.2`, `ws ^8.18.3`. No dev tooling.

---

## 3. Root directory map

```
template-here/
├─ server.js                     # entire backend (~893 lines)
├─ package.json / package-lock.json
├─ github_config.json            # GitHub sync credentials (⚠ token is committed!)
├─ FALSEMLBBOVERLAYTOOL.BAT      # main launcher
├─ FALSEMLBBOVELAYFIX.bat        # alternate launcher
├─ Berhasil / Ditemukan          # empty leftover artifacts (0 bytes)
├─ _backup_before_sec/           # server.js + hub.html BEFORE the SEC suite was added
├─ _backup_watermark_originals/  # original mvpdisplay / postdraft files
├─ node_modules/
└─ public/
   ├─ *.html / *.css             # all pages (see §8)
   ├─ Assets/
   │  ├─ HeroPick/               # 138 hero splash/pick images (Name.png)
   │  ├─ Itemandspell/           # 118 item + spell icons (Name.png)
   │  ├─ player/                 # 7 player render photos (Name.png)
   │  ├─ lane/                   # gold, exp, mid, junggle, roam, None
   │  ├─ map/                    # 4 map images
   │  ├─ nationalflag/           # 20 flags
   │  ├─ notification/           # 12 kill-event .webm videos
   │  ├─ VoiceLines/             # 133 hero voice lines
   │  ├─ Other/                  # GIF draft arrows, logos, misc
   │  ├─ Font/                   # Renegade Pursuit.otf, big_noodle_titling.ttf
   │  ├─ costum/Theme/           # theme assets + theme.json (SOURCE OF TRUTH for theme)
   │  ├─ SEC/                    # sec-logo.png, sec-waves.svg, sec-waves-bg.jpg, countdown/
   │  ├─ mvp/                    # uploaded MVP player photos
   │  └─ screenshots/            # hub card previews (<filename>.png)
   ├─ database/                  # JSON state files (see §5)
   ├─ script/                    # all client JS
   ├─ External/                  # Scoresight OCR setting JSONs
   └─ serverip.txt               # last selected LAN IP (read by hub/OCR)
```

---

## 4. Backend architecture (`server.js`)

### 4.1 Boot sequence
1. Create `app`, `http.Server`, attach `ws` server.
2. `express.json/urlencoded` with 50 MB limit; static `public`.
3. `AsyncQueue` — every file write is enqueued so writes never interleave.
4. Ensure all folders exist; seed every JSON file with defaults if missing.
5. `loadCache()` reads JSON files into `cache` (in-memory source of truth for reads).
6. `initFlagDB()` seeds `flags.json` from `nationalflag/`.
7. Start listening on 3000; log local + LAN URL; write `serverip.txt`.

### 4.2 Cache
`cache` holds:
```
matchdata, matchdraft, theme, mapdraw, mvp, schedule, notification, secCountdown, presets
```
Reads (`GET`) serve from cache. Writes (`POST`) update cache, broadcast over WS, then enqueue a disk write.

⚠ **The cache is the truth, not the file.** Editing a JSON file on disk while the server runs has no
effect until the process is restarted. Likewise, a server process started before a code change will
not expose new routes (this caused a real **404 on `/api/presets`**). After changing `server.js` or
restoring database files, stop `node server.js` and start it again. Never run two instances
(`EADDRINUSE` on port 3000).

### 4.3 Helpers
- `getLocalIp()` — prefers Wi-Fi/Ethernet IPv4, ignores virtual adapters.
- `broadcast(data)` — send JSON to every OPEN WS client.
- `listAssetNames(dir)` — image basenames (sorted) for dropdowns.
- `clampSecNumber`, `normalizeSecCountdown`, `secTimerRemaining`, `presentSecCountdown`,
  `mergeSecCountdownConfig` — SEC timer logic (see §9).

### 4.4 WebSocket server
- Heartbeat ping every 30 s; terminates dead clients.
- Clients may send `{ type: 'update', data: {...} }`; the server relays it to **all other** clients.
  This is used by the draft controller to stream 1-second timer ticks without writing JSON.
- Server-originated message types:

| Type | Payload | Emitted by |
|---|---|---|
| `matchdata_update` | `{ data: <full matchdata> }` | POST `/api/matchdata` |
| `update` | `{ data: { matchdata } }` and relayed draft ticks | POST matchdata / clients |
| `draftdata_update` | `{ data: <draftdata> }` | POST `/api/matchdraft`, archive |
| `theme_update` | `{ data: <theme> }` | theme POST/reset/upload |
| `schedule_update` | `{ data: <schedule> }` | schedule POST |
| `mapdraw_update` | `{ data: <drawdata> }` | mapdraw POST |
| `mvp_update` | `{ data: <mvp or null> }` | mvp POST |
| `presets_update` | `{ data: <full presets object> }` | presets POST |
| `sec_countdown_update` | `{ data: <presented state>, serverNow }` | SEC POST |
| `notification_trigger` | `{ videoId, timestamp }` | notification POST |
| `analyzer_update` | `{}` | archive-draft |
| `analyzer_control` | `{ action }` | analyzer-control |
| `sync_progress` | `{ current, total, filename }` | GitHub sync |

> ⚠ Multiple pages open separate WS connections; that is normal. Some older scripts
> (`displaynicknamelogo.js`) use `new WebSocket('ws://' + window.location.host)` — no `wss` handling.

---

## 5. Data model / state files

All under `public/database/` unless noted.

### `matchdatateam.json` — current match (⚠ can be huge; sample ~4.5 MB due to base64 logos)
```json
{
  "game_duration": "40:20",
  "game_number": "1",
  "winmatches": "none | blue | red",
  "teamdata": {
    "blueteam": {
      "teamname": "DCS", "score": "2",
      "logo": "data:image/png;base64,... or URL",
      "totalgold": 0, "turret": 0, "lord": 0, "turtle": 0,
      "playerlist": [
        { "name": "Player", "hero": "Hero Name", "level": 0,
          "KDA": "0/0/0", "gold": 0, "spell": "idle",
          "banhero": "Hero Name", "lane": "gold|exp|mid|junggle|roam|none",
          "role": "gold|exp|mid|junggle|roam|none", "photo": "Assets/presets/... or empty",
          "itemlist": ["idle","idle","idle","idle","idle","idle"] }
      ]
    },
    "redteam": { "...same shape..." }
  }
}
```
- `player.hero` and `player.banhero` store **display names**, not paths.
- Displays derive `Assets/HeroPick/<hero>.png` and `Assets/player/<name>.png`.
- `logo` is often a base64 data URL (makes JSON enormous).

### `matchdraft.json` — live draft
```json
{ "draftdata": {
  "timer": "60", "timer_running": false, "current_phase": 0,
  "blueside": { "ban": [{"hero":"/Assets/HeroPick/x.png"}, ...5], "pick": [...5] },
  "redside": { "ban": [...5], "pick": [...5] }
}}
```
- Note: state actually contains both `timer_running` and (in some samples) stale `timerRunning`.
  `displayhero.js` reads **`timer_running`**.
- Hero values are **paths** (`/Assets/HeroPick/<Name>.png`), unlike matchdata names.

### `previousmatchdraft.json` — archived draft (same shape as matchdraft).
### `seccountdown.json` — see §9.3.
### `mvpdata.json`
```json
{ "mvp": {
  "checkboxId": "mvp-blueteam-0", "side": "blue", "nickname": "Zing",
  "teamName": "DCS",
  "heroImg": "Assets/HeroPick/Hayabusa.png",
  "playerPhoto": "Assets/player/RoBlox.png",
  "stats": { "LVL":"13","KDA":"22/5/2","GOLD":"43434","SPELL":"Inspire",
             "ITEM 1":"Swift Boots", "...": "...", "ITEM 6":"idle" }
}}
```
`{ "mvp": null }` hides the MVP display.

> **MVP live bridge (server-side):** whenever match data is saved, `syncMvpFromMatchData()` in
> `server.js` resolves the selected MVP via `checkboxId` (`mvp-<teamkey>-<index>`) or nickname,
> copies the player's live hero/nickname/photo/level/KDA/gold/spell/items into `mvp`, broadcasts
> `mvp_update`, and persists it. It also runs on `GET /api/mvp` to heal stale saves. This is what
> makes `mvpdisplay.html` and `sec-mvpdisplay.html` follow control/postgame/central panels, not
> just `mvpcontrol.html`.
### `presets.json` — Central Control presets (teams + players)
```json
{ "version": 1,
  "teams":  [{ "id": "team_...", "name": "DCS", "logo": "Assets/presets/...",
              "roster": ["player_..."], "createdAt": 0, "updatedAt": 0 }],
  "players":[{ "id": "player_...", "ign": "Zing", "photo": "Assets/presets/...",
              "role": "gold|exp|mid|junggle|roam", "teamId": "team_... or ''",
              "createdAt": 0, "updatedAt": 0 }] }
```
- `roster` is derived server-side from `players.teamId`, sorted by role then IGN.
- `teamId: ""` means free agent. `jungle` is normalized to legacy `junggle`.
- Uploaded images live in `public/Assets/presets/`; JSON stores **paths only**.
- Read/written via `/api/presets`; see `CENTRAL_CONTROL_SPEC.md`.
### `schedule.json` — numeric keys + config
```json
{ "config": {"layout":"horizontal|vertical"},
  "1": { "show": true, "time": "1 : 45", "logo1": "data:image...", "team1": "...",
         "score1": "...", "logo2": "...", "team2": "...", "score2": "..." } }
```
(⚠ sample ~9 MB because logos are base64.)
### `mapdraw.json` — `{ "drawdata": { "status":"idle|drawing", "mode":"random|fixed", "fixedChoice":null, "result":"<map>", "timestamp":0 } }`
### `notification.json` — `{ "currentVideo": "videoPlayer7", "timestamp": 123... }`
### `theme.json`
- **Source of truth:** `public/Assets/costum/Theme/theme.json` (server `themePath`).
- `public/database/theme.json` is a stale duplicate. Do not edit it expecting effect.
### `flags.json`, `items.json`, `herolist.json`, `playerlane.json`, `postgame.json`, `postgame.xlsm`
- `herolist.json`: `[{ "name": "...", "img": "/Assets/HeroPick/....png", "voice": "Assets/VoiceLines/....mp3" }]`
- `items.json`: plain array of item names used by MVP/postgame pickers.
- `savedmatch/matchdata1..7.json`: rotating match archive (`save-match-record` shifts 6→7 … 1→2).
- `~$postgame.xlsm`: Excel lock-file artifact (ignorable).

---

## 6. Full API reference

| Method | Path | Body / Params | Effect |
|---|---|---|---|
| GET | `/api/matchdata` | — | current match data |
| POST | `/api/matchdata` | full object | cache + `matchdata_update` + `update` + write |
| GET/POST | `/api/matchdraft` | `{draftdata}` | draft state + `draftdata_update` + write |
| GET/POST | `/api/theme` | theme object | theme + `theme_update` + write |
| POST | `/api/theme-reset` | — | reset default theme |
| POST | `/api/upload-asset` | multipart `file`, `targetField` | target: `heroPickBg`, `lowerBg`, `lowerMidBg`, `font` |
| GET | `/api/flags` | — | list flag images + refresh `flags.json` |
| POST | `/api/upload-flag` | multipart `file` | save flag, return list |
| GET | `/api/items` | — | items array |
| GET/POST | `/api/schedule` | schedule object | schedule + `schedule_update` |
| GET/POST | `/api/mapdraw` | `{drawdata}` | map draw + `mapdraw_update` |
| GET/POST | `/api/mvp` | `{mvp}` | MVP + `mvp_update` |
| GET | `/api/mvp-assets` | — | `{ heroes, itemAssets, players }` basenames |
| POST | `/api/mvp-photo` | multipart `photo` | saves to `Assets/mvp/`, returns `path: Assets/mvp/<file>` |
| GET | `/api/sec-countdown` | — | `{ state, serverNow }` (computed) |
| POST | `/api/sec-countdown` | `{action, ...}` | see §9 actions |
| POST | `/api/sec-countdown/upload` | multipart `file`, `slot` | saves to `Assets/SEC/countdown/` |
| GET | `/api/presets` | — | team + player presets |
| POST | `/api/presets` | full presets object | normalize + cache + `presets_update` + write |
| POST | `/api/presets/upload` | multipart `file`, `kind`, `id` | saves to `Assets/presets/`, returns `{ path }` |
| POST | `/api/presets/apply` | `{ blueTeamId, redTeamId, bluePlayerIds, redPlayerIds, resetStats, resetScore, resetDraft, resetMvp }` | atomic matchdata merge + optional resets |
| GET/POST | `/api/notification` | `{videoId}` | notification + `notification_trigger` |
| POST | `/api/save-match-record` | — | rotate archive, save current matchdata |
| POST | `/api/archive-draft` | — | current draft → previous draft + analyzer update |
| GET | `/api/previousdraft` | — | previous draft JSON |
| POST | `/api/analyzer-control` | `{action}` | broadcast analyzer command |
| POST | `/api/delete-all-records` | — | empty `savedmatch/` |
| GET | `/api/ips` | — | all IPv4 interfaces |
| POST | `/api/set-ip` | `{ip}` | write `public/serverip.txt` |
| POST | `/api/sync-github` | — | pull assets listed in remote `update.json` |

### GitHub sync
Reads `github_config.json` → `{owner, repo, branch, token}`.
Fetches `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/update.json` (manifest `{version, files:[paths|folders]}`),
then the recursive Git tree via API, downloads matched files and mirrors repo paths locally under project root,
broadcasting `sync_progress`. **Requires a valid token** (current one is exposed — rotate it).
Hub exposes this as **SUPPORT & UPDATE → SYNC WITH GITHUB**.

---

## 7. Main (non-SEC) feature map

### Draft pipeline
1. **`control.html` / `controlban6.html`** + `script/controlnicknamelogo.js`, `herodropdown.js`
   (or `herodropdownban6.js`), `previousdraft.js`, `matchrecorder.js`.
2. Names/scores/logos/lanes → `/api/matchdata`.
   Hero picks/bans → `/api/matchdraft` **and** mirrored hero names into `/api/matchdata`.
3. Draft sequence is a fixed 17-step order (`dropdownOrder` in `herodropdown.js`):
   ban/pick alternation with double-pick phases; `current_phase` drives highlighting and enabled inputs.
4. Timer runs client-side in the controller and streams ticks via WS `{type:'update'}`.
   Displays animate the shrinking bar locally.
5. **Displays:** `display.html`, `display2.html`, `displayban6.html`, `display2ban6.html`,
   `displaycostum.html`, `displaycostumban6.html`.
   - `display.html` and variants load `display.css` (and `script/displaynicknamelogo.js`,
     `displayhero.js`, `laneimg.js`).
   - `displaycostum*` additionally load `script/theme-loader.js` + `displaycostum.css` (theme engine).
   - `displayhero.js` plays hero voice lines from `herolist.json` on pick (volume muted in final phase).
   - `laneimg.js` **polls `database/matchdatateam.json` every 500 ms** (bypasses API/cache) and renders
     `Assets/lane/<lane>.png`.
   - `displaynicknamelogo.js` reads `/api/matchdata` and listens for `matchdata_update`; player portraits
     are auto-derived from player name.
6. **Post-draft:** `postdraft.html`, `postdraft2.html`, `postdraftcostum.html`
   reuse `displayhero.js` + `displaynicknamelogo.js` + `laneimg.js` with different CSS.
7. **Scoreboard:** `scoreboard.html` (basic), `scoreboardcostum.html`, `scoreboardocr.html`,
   `scoreboardcostumocr.html`.
   - All use `displaynicknamelogo.js`.
   - `scoreboard.html` and `sec-scoreboard.html` load a **missing `public/crossclient.js`** (404 but
     harmless today; likely a leftover of a removed cross-client sync).
   - OCR variants use `script/scoreboaedocr.js`: fetch `http://localhost:14337/MLBB.json` (Scoresight)
     or `http://<serverip>:14337/MLBB.json` every second, validate OCR jumps, and run their own timer.
8. **Previous draft analyzer:** `previousdraft.html` + `previousdraft.js` reads `/api/previousdraft`.

### MVP
- **`mvpcontrol.html`** — library of heroes/items/players from `/api/mvp-assets`, manual picker,
  match-data autofill, photo upload, and a **live preview iframe of `mvpdisplay.html?preview=1`**
  communicating via `postMessage({type:'mvp_preview'})`.
  - **Postgame is the authoritative MVP source.** It mirrors `mvp_update` in AUTO mode; pressing
    UPDATE DISPLAY switches to MANUAL, and `SYNC POSTGAME` returns to AUTO.
  - Player photos: prefers `player.photo` (preset) over `Assets/player/<IGN>.png`.
- **`mvpdisplay.html`** — standalone 1920×1080 "Prime Reveal" MVP layout, inline CSS/JS; reads `/api/mvp`,
  listens to `mvp_update`; `?preview=1` shows placeholder and listens for postMessage. It also loads
  `script/mvp-live-sync.js` and listens to `matchdata_update`, so control/postgame edits refresh the
  displayed hero/KDA/gold/level/spell/items even if the server process is older than this change.
- **`sec-mvpdisplay.html`** — same live-sync behavior via `script/mvp-live-sync.js`.
- **`mvpdisplay_legacy.html`** — older Cyber HUD variant.
- Postgame table has MVP checkboxes that also push an MVP payload (`postgamecontrol.html`).

### Postgame / builds
- `postgamecontrol.html` — editable stats (level, KDA, gold, items, spell, objectives, winner),
  MVP selection. Reads `/api/matchdata`, `/api/items`, `/api/mvp`.
- `postgame.html` — stats display; `script/postgame.js` fetches `database/matchdatateam.json` (not API).
- `builds.html` — item-build view; `script/build.js` fetches `database/matchdatateam.json`.
- `globalban.html` — ban/history display (static-ish).

### Map draw
- `drawcontrol.html` → `/api/mapdraw`; `drawdisplay*.html`, `drawfinal.html` render it.

### Schedule
- `schedulecontrol.html` → `/api/schedule` (multi-tab, logos as base64, show toggles, layout config).
- `scheduledisplay.html` + `script/acdisplay.js` render schedules.

### Notifications / kill events
- `notifcontrol.html` → `/api/notification` with `videoPlayer7..12` (First Blood, Double, Triple,
  Maniac, Savage, Wipeout) plus other IDs for turtle/lord events in `notifdisplay.html`.
- Videos are `public/Assets/notification/*.webm`; display listens for `notification_trigger`.

### Theme engine
- Only **custom** pages load `script/theme-loader.js`: `displaycostum.html`, `displaycostumban6.html`,
  `postdraftcostum.html`, `scoreboardcostum.html`, `scoreboardcostumocr.html`.
- It fetches `/api/theme`, sets CSS variables on `:root`, supports:
  colors, gradients per panel, opacity, background images, scoreboard colors/flag, glow/shadow toggles,
  ban/pick/hero animations, custom uploaded font (`@font-face`), lane icon invert/hide.
- Editor: `costumoverlaycontrol.html` (uploads assets/flags/fonts, live theme POST, reset).
- Theme JSON keys: `fontFile`, `useCustomFont`, `fontSizeMultiplier`, `images`, `colors`, `gradients`,
  `scoreboard`, `opacity`, `toggles`, `animations`.
- The **SEC pages do NOT load the theme engine**; their look is fixed by `sec.css` + per-page CSS.
  Only the SEC logo slot and some uploaded content are dynamic.

---

## 8. Page inventory (public/)

### Hub
| File | Title | Role |
|---|---|---|
| `hub.html` | MLBB Overlay Command Center | launcher; IP selector; cards; GitHub sync |

Hub registration arrays (edit these when adding pages):
```js
controlFiles  = ['centralcontrol.html','control.html','controlban6.html','drawcontrol.html','notifcontrol.html',
                 'postgamecontrol.html','mvpcontrol.html','schedulecontrol.html','costumoverlaycontrol.html'];
displayFiles  = ['display.html','display2.html','displaycostum.html','displayban6.html',
                 'display2ban6.html','displaycostumban6.html','postdraft.html','postdraft2.html',
                 'postdraftcostum.html','scoreboard.html','scoreboardcostum.html','scoreboardocr.html',
                 'scoreboardcostumocr.html','previousdraft.html','notifdisplay.html','builds.html',
                 'globalban.html'];
utilityFiles  = ['postgame.html','mvpdisplay.html','scheduledisplay.html','drawdisplay.html',
                 'drawdisplay2.html','drawdisplay3.html','drawfinal.html'];
secControlFiles = ['sec-countdowncontrol.html'];
secDisplayFiles = ['sec-countdown.html','sec-display.html','sec-scoreboard.html',
                   'sec-postdraft.html','sec-mvpdisplay.html'];
```
- Cards use `Assets/screenshots/<filename>.png`; if missing, SEC files get a generated purple SVG
  fallback, others get a generic "NO PREVIEW" SVG.
- Buttons: control pages → `OPEN PANEL` + `COPY IP`; display pages → `LOCALHOST` + `NET IP`.
- IP selector → `/api/set-ip` → rewrites `serverip.txt`; WS reconnects.
- **Bug/cleanup:** there is a legacy `#sec` tab pane with `secControlGridUnified`/`secDisplayGridUnified`
  that is never navigable. It's harmless but duplicate.

### Controls
`centralcontrol.html` (presets + match setup + live actions + embedded panels), `control.html`,
`controlban6.html`, `drawcontrol.html`, `notifcontrol.html`, `postgamecontrol.html`,
`mvpcontrol.html`, `schedulecontrol.html`, `costumoverlaycontrol.html`, `sec-countdowncontrol.html`.

### Displays
`display*.html`, `postdraft*.html`, `scoreboard*.html`, `previousdraft.html`, `notifdisplay.html`,
`builds.html`, `globalban.html`, plus utilities `postgame.html`, `mvpdisplay*.html`,
`scheduledisplay.html`, `drawdisplay*.html`, `drawfinal.html`.

### SEC
`sec-countdown.html`, `sec-countdowncontrol.html`, `sec-display.html`, `sec-scoreboard.html`,
`sec-postdraft.html`, `sec-mvpdisplay.html`, shared `sec.css`.

---

## 9. SEC Series deep dive

### 9.1 Design system
- Fixed stage: **1920×1080**, `overflow:hidden`, transparent-friendly.
- Shared tokens in `sec.css`:
  ```
  --sec-bg-deep:#170a1e; --sec-bg:#25122f; --sec-bg-soft:#321941;
  --sec-panel:rgba(26,12,34,.78); --sec-line:rgba(201,165,219,.45);
  --sec-white:#fbf7ff; --sec-muted:#cbb7d8; --sec-soft:#9a82aa;
  --sec-accent:#d8b4fe; --sec-accent-2:#f0abfc;
  --sec-blue:#9cc9ff; --sec-red:#ff9fbe;
  --sec-border:rgba(222,196,242,.24); --sec-border-strong:rgba(222,196,242,.44);
  ```
- Fonts: `'SEC Display'` = `Assets/Font/Renegade Pursuit.otf`,
  `'SEC Display Condensed'` = `Assets/Font/big_noodle_titling.ttf`.
- Background: `linear-gradient(...) + Assets/SEC/sec-waves.svg`; vignette via `body.sec-page::before`.
- Brand slot: `Assets/SEC/sec-logo.png` (replaceable; currently a white/invisible-on-white logo).
- Team accents: blue `#9cc9ff`, red `#ff9fbe` (`--team-color` per card).

### 9.2 Page-by-page
| Page | Purpose | Controller / data source | Scripts |
|---|---|---|---|
| `sec-countdown.html` | pregame countdown + team rail + 5 role columns with photo pairs; reveal animation | **own** `sec-countdowncontrol.html`; `/api/sec-countdown` | `script/sec-countdown.js` |
| `sec-countdowncontrol.html` | operator UI: brand/team/roster uploads, timer, preview iframe | `/api/sec-countdown` | `script/sec-countdowncontrol.js` |
| `sec-display.html` | SEC draft skin over `display.html` layout | main `control.html`; `/api/matchdata` + `/api/matchdraft` | `displaynicknamelogo.js`, `displayhero.js`, `laneimg.js` |
| `sec-scoreboard.html` | SEC scoreboard skin over `scoreboard.html` layout | main controls; `/api/matchdata` | `displaynicknamelogo.js` (+ missing `crossclient.js`) |
| `sec-postdraft.html` | SEC post-draft skin over `postdraft2.html` layout | main controls; matchdata + draft | `displayhero.js`, `displaynicknamelogo.js`, `laneimg.js` |
| `sec-mvpdisplay.html` | self-contained SEC MVP reveal | `/api/mvp`; `?preview=1` placeholder + postMessage | inline `<script>` only |

> ⚠ There is **no dedicated SEC draft/scoreboard/post-draft controller**. The hub explicitly tells
> operators to use the main tournament controllers. Adding one would be a natural extension.

### 9.3 SEC countdown state (`seccountdown.json`)
```json
{
  "brand": { "logo": "Assets/SEC/sec-logo.png" },
  "teams": [
    { "name": "TEAM 1", "score": "0", "logo": "",
      "players": [
        {"name":"","role":"gold","photo":""},
        {"name":"","role":"exp","photo":""},
        {"name":"","role":"mid","photo":""},
        {"name":"","role":"jungle","photo":""},
        {"name":"","role":"roam","photo":""}
      ]
    }, { "...TEAM 2..." }
  ],
  "timer": { "duration":300, "remaining":300, "running":false,
             "startedAt":null, "revealed":false, "autoReveal":true },
  "updatedAt": null
}
```
- Roles are fixed order: `gold, exp, mid, jungle, roam`.
- `normalizeSecCountdown` clamps: duration 0–86400 s, remaining 0–duration, name ≤80, score ≤20,
  player name ≤60, exactly 2 teams × 5 roles.
- Timer is **server-authoritative**: when `running`, remaining is recomputed from `startedAt` and
  `duration` on every GET/action (`presentSecCountdown`). When it hits 0 it auto-stops and (if
  `autoReveal`) sets `revealed = true`.
- POST actions:
  - `save` / `update` — merge config (teams, brand.logo, duration, autoReveal); does not start timer.
  - `start` — preserves elapsed remaining; resets to full if at 0; sets `startedAt` to now−elapsed.
  - `pause` — snapshots remaining, clears startedAt.
  - `reset` — remaining = duration, stopped, unrevealed.
  - `reveal` / `hide-reveal` (alias `hide`) — toggles role-pair reveal.
  - `complete` — stopped at 0, auto-reveal if enabled.
  - `set-duration` — sets duration/remaining, stops, unreveals.
- Client (`sec-countdown.js`) keeps a local deadline + server clock offset, ticks every 100 ms,
  applies FLIP animation on reveal, and POSTs `complete` if it reaches 0 locally.
- Controller (`sec-countdowncontrol.js`) debounce-autosaves 900 ms after edits, serializes saves,
  reconnects WS after 1.8 s, preview iframe scaled `width/1920`, login-free.
- Upload slots for `/api/sec-countdown/upload`: `brand-logo`, `team0-logo`, `team1-logo`,
  `team{0|1}-{gold|exp|mid|jungle|roam}`. Stored in `public/Assets/SEC/countdown/<slot>_<ts>.<ext>`.
  The controller then writes the returned `path` into state via `save`.

### 9.4 Known SEC inconsistencies
1. `sec-scoreboard.html` expects `crossclient.js` (missing) — 404 only.
2. `sec-display.html`, `sec-scoreboard.html`, `sec-postdraft.html` do **not** include
   `script/theme-loader.js`, so theme customizations never affect SEC pages (probably intentional).
3. `sec-mvpdisplay.html` is not wired into `mvpcontrol.html`'s preview (that iframe uses
   `mvpdisplay.html?preview=1`). It can be previewed manually with `sec-mvpdisplay.html?preview=1`.
4. `sec-mvpdisplay.html` references `Assets/SEC/sec-waves-bg.jpg` (exists) and
   `Assets/HeroPick/idle.png` / `Assets/player/playertemp.png` (exist).
5. The SEC logo is a plain white asset; on light backgrounds it may look blank. Replace it with a
   colored/transparent logo as needed.
6. SEC pages are fixed to 1920×1080; they do not scale responsively. OBS browser source should be
   set to 1920×1080. Use `?preview=1` only for outline helpers.

---

## 10. Asset conventions (important when creating new content)

| Kind | Path | Naming |
|---|---|---|
| Hero pick image | `Assets/HeroPick/<Hero Name>.png` (spaces allowed) | display name from `herolist.json` |
| Hero voice | `Assets/VoiceLines/<...>.mp3` | linked in `herolist.json` |
| Item / spell icon | `Assets/Itemandspell/<Name>.png` | item names in `items.json`; spells also here |
| Player render | `Assets/player/<Name>.png` | auto-resolved from player nickname |
| Lane icon | `Assets/lane/<lane>.png` | `gold|exp|mid|junggle|roam|none` |
| Team logo | data URL stored in JSON, or `Assets/...` | uploaded from control pages |
| Map | `Assets/map/<Map Name>.png` | fixed 4 maps |
| SEC uploads | `Assets/SEC/countdown/<slot>_<timestamp>.<ext>` | only png/jpg/jpeg/webp |
| MVP photos | `Assets/mvp/<base>_<timestamp>.<ext>` | png/jpg/jpeg/webp, ≤20 MB |
| Theme uploads | `Assets/costum/Theme/<originalname>` | images or `.ttf/.otf` |
| Hub previews | `Assets/screenshots/<page filename>.png` | exact filename incl. `.html` |

- File upload validation: most image uploads allow `.png/.jpg/.jpeg/.webp`; theme font upload allows
  `.ttf/.otf`. No size limit on generic uploads, 20 MB on MVP/SEC timer photos.
- Player/hero lookups are case-sensitive on Linux; this project runs on Windows so many legacy files
  rely on case-insensitivity (`Assets/other` vs `Assets/Other`, `junggle` misspelling is intentional).

---

## 11. CSS / layout conventions

- Original displays: `display.css` / `display2.css` / `displaycostum.css` define a 1920×1080 grid:
  `.upper` (team names, logos, scores) → `.uppermiddle` (picks + center tournament logo) →
  `.middle` (player name row + draft timer) → `.lower` (bans + phase arrow).
  All theme-driven via CSS variables (`--upper-bg`, `--blue-primary`, `--lane-filter`, ...).
- Scoreboard pages reuse `.scoreboard > .upper/.lower` with `.name-box` IDs shared with
  `displaynicknamelogo.js` (`name-box-1..14`, `displayImage1/2`).
- SEC pages layer a skin stylesheet **after** the base CSS: `display.css` → `sec.css` → `sec-*.css`.
  Follow this order for any new SEC skin; never edit the base CSS to add SEC styling.
- Controls use glassmorphism/neon aesthetic (purple accent in hub and SEC; cyan/red in original panels).
- Use `.sec-page` and `.sec-brand-slot` / `.sec-brand-panel` for branding consistency.

---

## 12. Recipes — how to extend safely

### Add a new display page
1. Create `public/<name>.html` + `<name>.css` (and optional `script/<name>.js`).
2. If it must be 1920×1080, copy the fixed-size pattern from an existing display (`width:1920px;height:1080px;overflow:hidden`).
3. Reuse data: fetch `/api/...`, subscribe to WS, update DOM.
4. Add the filename to the correct array in `hub.html` (`displayFiles` or `utilityFiles`) and add a
   screenshot at `Assets/screenshots/<name>.html.png` (optional; fallback exists).
5. If new state is needed, add JSON seed + cache + GET/POST + broadcast in `server.js`.
6. Keep writes queued (`fileQueue.enqueue`).

### Add a new SEC skin
1. Copy `sec-display.html` structure; link `base.css` → `sec.css` → `sec-<name>.css`.
2. Reuse `displaynicknamelogo.js` / `displayhero.js` / `laneimg.js` when possible.
3. Use `sec.css` tokens and the brand slot; do not introduce a new palette.
4. Register under `secDisplayFiles` in `hub.html`.
5. If it needs its own state, follow the SEC countdown pattern: normalized schema + dedicated API +
   WS `sec_<name>_update`, and a dedicated control page.

### Add a new control page
1. Mirror the control visual language of the family (glass panels + accent).
2. Autosave on input with debounce; show connection + dirty status; preview iframe scaled to 1920.
3. Register in `controlFiles` in `hub.html`.
4. Never write directly to files from the browser; always go through `/api/*`.

### Change the draft phase order
- Single source of truth: `dropdownOrder` in `script/herodropdown.js` (and `herodropdownban6.js` if
  the ban6 variant must match). Also update `phases` / `phasesActiveBoxes` in `script/displayhero.js`
  and `displayheroban6.js`, and the HTML box IDs if slot counts change.

---

## 13. Known issues, risks, and gotchas

1. **Security:** `github_config.json` contains a live-looking GitHub PAT. Revoke/rotate it and move it
   to an environment variable or gitignored config. Also `express.json` accepts 50 MB and there is no
   auth on any endpoint; never expose this server to the public internet.
2. **Huge JSON files:** base64 logos in `matchdatateam.json` (~4.5 MB) and `schedule.json` (~9 MB) make
   each save slow. Prefer storing logos as files and referencing paths.
3. **Dual hero representations:** `matchdata.player.hero` = display name; `matchdraft...hero` = image
   path. Convert accordingly (`herolist.json` maps name ↔ img).
4. **`crossclient.js` missing** for `scoreboard.html` and `sec-scoreboard.html`.
5. **`database/theme.json` is stale**; real theme is `Assets/costum/Theme/theme.json`.
6. **`laneimg.js`, `postgame.js`, `build.js` bypass the API** and read static `database/*.json`
   directly; they can lag behind cache writes or miss broadcasts.
7. **`server.js` working-directory dependency** for static files and `__dirname` for DB paths — run from root.
8. **Case sensitivity** on non-Windows deployment: `Assets/other/nologo.png` (lowercase) is referenced
   by `displaynicknamelogo.js` while the folder is `Assets/Other`. Fix before Linux hosting.
9. **Draft timer ticks** use WS relay only; if a display connects mid-run it fetches the last saved
   timer (which may be stale by up to the tick cadence). Acceptable today.
10. **SEC auto-reveal** can be triggered both by server presentation and display/controller; guarded by
    `completionRequested` / `revealed` flags but verify if editing timer logic.
11. **Hub legacy `#sec` tab** is dead code; remove or wire it.
12. **Screenshots**: some hub screenshot filenames have different capitalization from the HTML filenames
    (`Display2.html.png`, `Notifcontrol.html.png`, etc.). Works on Windows; breaks case-sensitive hosts.
13. **Empty artifacts:** `Berhasil`, `Ditemukan` are 0-byte leftovers.
14. **`~$postgame.xlsm`** is an Excel lock file; ignore.
15. **Backups** in `_backup_before_sec/` and `_backup_watermark_originals/` are reference-only; don't load them.

---

## 14. Quick mental model

```
Operator Control Page ──POST /api/<domain>──▶ server.js cache
        ▲                                      │
        │                                      ├─ enqueue JSON write (public/database)
        │                                      └─ broadcast WS message
        │                                              │
        └──── WS / fetch initial ──────────────────────┴──▶ Display Pages (OBS 1920×1080)
```

- **Draft:** `control.html` → `matchdraft.json` + `matchdata` → `display*.html` / `sec-display.html`.
- **Names/logos/scores:** `control.html` + `postgamecontrol.html` → `matchdata` → all name-based displays.
- **Post-draft/scoreboard:** same matchdata; postdraft also uses matchdraft.
- **MVP:** `mvpcontrol.html` / `postgamecontrol.html` → `mvpdata.json` → `mvpdisplay.html` / `sec-mvpdisplay.html`.
- **SEC pregame:** `sec-countdowncontrol.html` → `seccountdown.json` → `sec-countdown.html`.
- **Ticker/ads:** `schedulecontrol.html` → `schedule.json` → `scheduledisplay.html`.
- **Kill notifications:** `notifcontrol.html` → `notification.json` → `notifdisplay.html`.

---

## 15. COPY-PASTE PROMPT FOR A NEW SESSION

Use the prompt below in a fresh session so the next agent loads context fast and avoids token overflow.

---

> **You are working on the "False MLBB Overlay Tool + SEC Series" project at
> `D:\School\SEC\WATCHPARTY\template-here`.**
>
> **First, read `PROJECT_GUIDE.md` in the project root completely.** It is the authoritative handoff
> doc: architecture, API, data schemas, page inventory, SEC suite details, design tokens, conventions,
> extension recipes, and known bugs. Then verify anything you are about to change against the actual
> files — if code and guide disagree, trust the code and update the guide.
>
> **Project summary:** A local Node.js/Express 5 + `ws` broadcast-overlay toolkit for MLBB tournaments.
> Static vanilla HTML/CSS/JS in `public/`, no build step. JSON persistence in `public/database/`, with
> an in-memory cache and serialized async writes in `server.js`. Port 3000. Operator control pages
> POST to `/api/*`; displays load via GET and receive realtime WebSocket broadcasts. Two design
> families: the original cyan/red theme-engine overlays, and the newer purple/lilac **SEC Series**
> (`sec-*.html`, `sec.css`, 1920×1080). The hub is `public/hub.html`.
>
> **Before writing code:**
> 1. Read `PROJECT_GUIDE.md` — start with §0 (current session state) — then inspect the specific
>    files relevant to the task (guide §8–§12). Update §0 when you finish.
> 2. Identify the correct family (original vs SEC) and reuse its conventions — never mix palettes.
> 3. Check how data flows for that feature: which `/api` endpoint, which JSON file, which WS message,
>    which controller page and which display page(s).
> 4. If adding a page, update `hub.html`'s file arrays and (optionally) add a screenshot at
>    `Assets/screenshots/<filename>.png`.
> 5. If adding state, add the seed file + cache + GET/POST + broadcast + queued write in `server.js`.
> 6. Preserve existing behavior and files; the repo has working backups in `_backup_before_sec/` and
>    `_backup_watermark_originals/` — do not edit those.
> 7. Do not touch or print secrets in `github_config.json`; it contains a token that should be rotated.
>
> **My task:** `<DESCRIBE EXACTLY WHAT TO CREATE OR REMODEL HERE>`
>
> **Constraints:** 1920×1080 OBS browser-source output, transparent-friendly where applicable, vanilla
> JS only, no new frameworks, no build step, Windows host, port 3000. Keep changes consistent with
> surrounding code. When done, list every file changed/created and how to test it in the hub/OBS.

---

## 16. Suggested first checks for the next agent

```powershell
# see all pages and API usage
Select-String -Path public\*.html,public\script\*.js -Pattern '/api/' | Select-Object -First 80

# confirm server boots
node server.js

# hub
start http://localhost:3000/hub.html

# SEC pages
start http://localhost:3000/sec-countdown.html
start http://localhost:3000/sec-countdowncontrol.html
start http://localhost:3000/sec-display.html
start http://localhost:3000/sec-scoreboard.html
start http://localhost:3000/sec-postdraft.html
start http://localhost:3000/sec-mvpdisplay.html?preview=1
```
