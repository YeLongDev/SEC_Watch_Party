# CENTRAL CONTROL + PRESETS — SPECIFICATION & HANDOFF

> **Status:** 🟢 **BUILT — awaiting operator feedback / polish.** Backend, page, integrations and
> smoke tests are complete. The running server on port 3000 must be restarted to pick up the new code.
> **Created:** 2026-11-03 · **Last updated:** 2026-11-03
> **Read first:** `PROJECT_GUIDE.md` (project-wide handoff). This file covers only the Central Control feature.
> **Rule:** if code disagrees with this file, trust the code and correct this file.

---

## 1. What the user asked for

1. A **centralized control panel** connected to every existing control panel, organized by function.
2. **Presets**:
   - **Team:** team name + logo.
   - **Player:** picture, in-game name (IGN), role, and team.
3. In **`control.html`**, pick the teams involved and the players so name, logo, IGN and role are
   filled automatically instead of typed by hand.
4. Those players must also appear in **`postgamecontrol.html`**.
5. **`mvpcontrol.html`** must rely on the MVP chosen in postgame control, receiving photo, IGN,
   items, KDA, gold, etc.
6. A durable spec + paste-ready prompt for future sessions.

## 2. Decisions taken (answers to the original open questions)

| # | Decision |
|---|---|
| Q1 | Combine all three: presets + match setup + quick links + live actions + **embedded** control panels, each in its own clearly labelled tab. |
| Q2 | Auto-fill slots **by role** (`gold, exp, mid, jungle, roam`); each slot remains an editable dropdown in both Central Control and `control.html`. |
| Q3 | **Reset everything including the draft** on apply (configurable checkboxes; all checked by default). |
| Q4 | **Postgame is the authoritative MVP source**; `mvpcontrol.html` mirrors it live and allows manual override with a `MANUAL` badge and a `SYNC POSTGAME` button. |
| Q5 | Add `photo` + `role` to every `matchdata` player; all displays prefer `player.photo`. |
| Q6 | SEC countdown roster presets: **phase 2**, not implemented. |
| Q7 | A player belongs to **one team at a time**; players with no team are **free agents** and can be picked. |
| Q8 | Presets are **global**; an `event` field is reserved for later. |
| Q9 | Uploads: PNG/JPG/WEBP, **5 MB** max. |
| Q10 | English labels, existing dark-glass / purple control visual language. |
| Q11 | Immediate save on every create/update/delete (no separate save button). |
| Q12 | Deleting a team that still has players is **blocked** until those players are reassigned. |

---

## 3. What was built

### 3.1 New files
| File | Purpose |
|---|---|
| `public/centralcontrol.html` | 5-tab operator page: PRESETS, MATCH SETUP, LIVE ACTIONS, CONTROL PANELS, ALL PAGES. |
| `public/centralcontrol.css` | Styling matching `control.css` (dark glass, purple accent, Big Noodle headings). |
| `public/script/centralcontrol.js` | All panel logic: preset CRUD, uploads, match apply, live actions, iframe/links, WebSocket. |
| `public/script/controlpresets.js` | Quick "LOAD TEAM PRESETS" block inside `control.html`. |
| `public/database/presets.json` | Seed `{ "version": 1, "teams": [], "players": [] }` (created by the server if missing). |
| `scripts/import-players-intro.js` | Importer: reads `../Players Intro/teams_data.js`, copies transparent photos to `Assets/presets/playersintro/`, and rewrites `presets.json` with the 9 intro teams + 50 players. |
| `public/Assets/presets/` | Uploaded team logos + player photos (paths stored in JSON, never base64). |

### 3.2 Modified files
| File | Change |
|---|---|
| `server.js` | Presets state + 4 endpoints + apply logic (details in §4). |
| `public/hub.html` | `centralcontrol.html` added to `controlFiles` + friendly title. |
| `public/control.html` | New "TEAM PRESETS (CENTRAL CONTROL)" block above the main panel. |
| `public/script/displaynicknamelogo.js` | `setMugshot(containerId, playerName, playerPhoto)`; prefers `player.photo`. |
| `public/postgamecontrol.html` | Shows the preset photo avatar; MVP payload now includes `teamName` and prefers `p.photo`. |
| `public/mvpcontrol.html` | AUTO/MANUAL source badge, `SYNC POSTGAME` button, live mirroring of `mvp_update`, prefers `player.photo`. |
| `server.js` | Serves the sibling `Players Intro` folder at `/playersintro/`; presets now accept `realName` + `order` + role `sub`. |
| `public/centralcontrol.html` | Player form has a Full Name (secondary) input and a Sub/Reserve role; new **PLAYERS INTRO** tab. |
| `public/script/centralcontrol.js` | Renders full names, keeps imported roster order, and previews the intro teams. |
| `public/centralcontrol.css` | Styles for the PLAYERS INTRO tab cards. |
| `../Players Intro/index.html` | When served from template-here it fetches `/api/presets` and uses those teams/players; `teams_data.js` remains the offline fallback. |

### 3.3 Presets data model (`public/database/presets.json`)
```json
{
  "version": 1,
  "teams": [
    {
      "id": "team_...",
      "name": "DCS",
      "logo": "Assets/presets/team-logo_team_..._123.png",
      "roster": ["player_...", "player_..."],
      "createdAt": 1750000000000,
      "updatedAt": 1750000000000
    }
  ],
  "players": [
    {
      "id": "player_...",
      "ign": "Zing",
      "realName": "Full name (secondary, optional)",
      "photo": "Assets/presets/player-photo_player_..._123.png",
      "role": "gold|exp|mid|junggle|roam|sub",
      "teamId": "team_... or ''",
      "order": 0,
      "createdAt": 1750000000000,
      "updatedAt": 1750000000000
    }
  ]
}
```
- `roster` is **derived server-side** from `players.teamId`, sorted by role then IGN, so it can never
  drift from the player list.
- Unknown `teamId` is normalized to `''` (free agent).
- `jungle` is normalized to the legacy spelling **`junggle`** so existing lane icons keep working.
- IDs are generated server-side when missing and de-duplicated.
- `sub` is a 6th/reserve role used by imported Players Intro teams; match slots still use only the
  five lanes (`gold→roam`), so a 6th player is stored but not auto-slotted.
- `order` preserves the original intro roster order; when absent the roster falls back to role then IGN.

### 3.5 Players Intro integration
- The studio is served by template-here at **`/playersintro/`** (static route to the sibling
  `Players Intro` folder). This gives it same-origin access to `/api/presets`.
- `Players Intro/index.html` builds its **PRESET TEAMS** dropdowns from the API: team name, player IGN
  (primary), full name (secondary), and photo paths. Local `teams_data.js` supplies colours, subtitles
  and layout defaults by team name, and remains the fallback when the server is offline or the page is
  opened directly with `file://`.
- `scripts/import-players-intro.js` is the one-time/rerunnable import. It wrote:
  - 9 teams: DCS 1/2, DE 1/2, DHM 1/2, DIT 1/2, DTE 1.
  - 50 players total (5–6 per team); roles by index: gold, exp, mid, jungle, roam, sub.
  - Photos to `public/Assets/presets/playersintro/<team>/01.png…`.
- No team logos were imported; upload them manually in the PRESETS tab.

### 3.4 Extended matchdata player
```json
{
  "name": "Zing", "lane": "gold", "role": "gold",
  "photo": "Assets/presets/player-photo_...png",
  "hero": "", "level": 0, "KDA": "0/0/0", "gold": 0,
  "spell": "idle", "banhero": "",
  "itemlist": ["idle","idle","idle","idle","idle","idle"]
}
```
Portrait resolution order everywhere (`displaynicknamelogo.js`, postgame, MVP):
1. `player.photo`
2. `Assets/player/<encodeURIComponent(IGN)>.png`
3. `Assets/player/noplayer.png` / `playertemp.png`

---

## 4. Server API added (`server.js`)

| Method | Path | Body | Effect |
|---|---|---|---|
| GET | `/api/presets` | — | `{ version, teams, players }` from cache |
| POST | `/api/presets` | full presets object | normalize, cache, `presets_update` broadcast, queued write |
| POST | `/api/presets/upload` | multipart `file`, `kind`, `id` | saves to `Assets/presets/`, returns `{ path }` |
| POST | `/api/presets/apply` | `{ blueTeamId, redTeamId, bluePlayerIds[5], redPlayerIds[5], resetStats, resetScore, resetDraft, resetMvp }` | atomic matchdata merge + optional resets |

Behavior of `/api/presets/apply`:
- Resolves both teams; unknown ID → HTTP 400.
- Player slots respect the **sent array order** (the UI sends slot order, which is role order by
  default but can be overridden by the dropdowns).
- `resetStats` (default true): clears player level/KDA/gold/spell/items/hero/banhero and team
  `totalgold/turret/lord/turtle`; also resets `game_duration` to `00:00`.
- `resetScore` (default true): team `score = "0"`, `winmatches = "none"`.
- `resetDraft` (default true): `matchdraft` is replaced with `defaultDraftData` and broadcast.
- `resetMvp` (default true): `mvpdata` becomes `{ mvp: null }` and broadcast.
- Broadcasts `matchdata_update` + legacy `update`; all writes go through `fileQueue`.

WebSocket broadcast added:
- `presets_update` → `{ data: <full presets object> }`

---

## 5. Central Control page — tab by tab

### PRESETS
- **TEAMS**: create/edit/delete team preset; name + logo upload (preview, 5 MB limit);
  roster count; delete blocked while players reference it.
- **PLAYERS**: create/edit/delete player preset; IGN (primary), full name (secondary), role, team
  (or free agent), photo upload.
- Every action saves immediately through `/api/presets`.
- Lists show logo/photo, IGN, role tag, full name, and team.

### PLAYERS INTRO
- Shows every team preset with its roster thumbnails (IGN + full name on hover).
- **OPEN PLAYERS INTRO** opens `/playersintro/` in a new tab.
- **REFRESH PRESETS** re-reads `/api/presets` after edits.
- The studio uses these presets as its team/player source; logos remain optional.

### MATCH SETUP
- Blue/red team selectors.
- Automatic roster preview: 5 slot dropdowns per side, pre-selected by role, each still editable.
  Dropdown groups: "Team players" then "Free agents".
- Reset checkboxes: player stats & objectives, score & winner, draft, MVP — all checked.
- **APPLY TO MATCH** → confirmation → `/api/presets/apply`.
- "CURRENT MATCH" panel mirrors `/api/matchdata` live.

### LIVE ACTIONS
- SEC countdown: start / pause / reset / reveal / hide, live readout.
- Match records: archive draft, archive match record, delete all records (double confirm).
- MVP: hide display, shortcuts to postgame/MVP control, live MVP readout.
- Kill notifications: all 12 `videoPlayer*` events (`/api/notification`).

### CONTROL PANELS
- Embedded iframe with a dropdown of all 9 control pages, refresh, and open-in-new-tab.

### ALL PAGES
- Every control/display/utility page with `LOCAL` and `NET IP` buttons.

---

## 6. Integration behavior

### `control.html`
New block at the top: blue team preset + red team preset + **LOAD TEAM PRESETS**.
It calls `/api/presets/apply` with `resetStats/resetScore/resetDraft/resetMvp = false`, i.e. identity
only (names, logos, IGNs, roles, photos), then refreshes the existing inputs via `loadFromServer()`.
Use Central Control → MATCH SETUP when a full reset is wanted.

### `postgamecontrol.html`
- Player rows show a circular preset photo (falls back to the IGN file, then hides).
- Ticking MVP now sends `teamName` and uses `player.photo`.

### `mvpcontrol.html`
- Starts in **AUTO**: any `mvp_update` from postgame is hydrated automatically.
- Pressing **UPDATE DISPLAY** switches to **MANUAL** (badge turns pink); further postgame updates
  are ignored until **SYNC POSTGAME** is pressed.
- "Load player from match data" prefers `player.photo`.

### Displays
All draft/postdraft/scoreboard/SEC pages that load `displaynicknamelogo.js` automatically use
`player.photo`; no per-page changes were needed.

### `Players Intro` (`/playersintro/`)
- On load it fetches `/api/presets` and rebuilds the preset dropdowns. Team names, player IGNs,
  full names and photos come from Central Control.
- Branding colours, subtitles and layout offsets stay local (matched by team name) so the intro
  still looks the same.
- If the fetch fails (server stopped, or the file opened directly), it silently uses `teams_data.js`.

---

## 7. Testing performed

### 7.1 Project-wide validation (2026-11-03)
| Check | Result |
|---|---|
| All 41 HTML pages over HTTP | **41/41 HTTP 200** |
| All local `src`/`href` references | **63/63 HTTP 200** (0 broken) |
| All GET endpoints used by clients | **14/14 HTTP 200** |
| Inline `<script>` blocks syntax-checked | no errors |
| Static JS (`node --check`) | no errors |
| Missing legacy assets | `crossclient.js`, `crosshost.js`, `Assets/Other/no-image.png` were 404; now added (stubs/copy) |

### 7.2 Central Control smoke test
First pass ran against a temporary server copy on port **3100**; a second pass ran live on **3000**
with the database backed up and restored afterwards:

| Test | Result |
|---|---|
| `GET /api/presets` on fresh install | `{version:1, teams:[], players:[]}` |
| `POST /api/presets` with `jungle` role | normalized to `junggle`; roster derived correctly |
| `POST /api/presets/apply` with 2 teams × 5 players | HTTP 200, slots auto-ordered gold→exp→mid→jungle→roam |
| Logo upload + apply | file served HTTP 200; path copied into `matchdata` |
| Draft + MVP reset flags | draft returned to default, MVP became `null` |
| `POST /api/presets/upload` | file saved to `Assets/presets/`, path returned |
| SEC countdown actions (start/pause/reveal/hide/reset) | all HTTP 200, state transitions correct |
| Page assets | `centralcontrol.html`, `.css`, `centralcontrol.js`, `controlpresets.js` all HTTP 200 |

Test data was removed and the original database files restored; the server was then restarted so
in-memory state matched the restored files (`presets` empty, original matchdata/MVP intact).

**Interactive status:** the operator successfully created a real team (name + uploaded logo) through the
Central Control UI, confirming the POST + upload path works from the browser. Still to verify: the
full MATCH SETUP apply from the UI, OBS rendering of preset photos, and a complete match-day flow.

---

## 8. Known limitations / follow-ups

1. **Restart after every server-code change:** `server.js` keeps `presets`, `matchdata`, etc. in an
   in-memory cache. A process started before the feature (or before a data restore) will either
   404 the new route or keep serving old data. Symptom the operator hit: adding a team returned
   **404** because port 3000 was still the pre-feature process. Fix: stop the old `node server.js`
   and start it again. Never run two instances (EADDRINUSE).
2. Uploaded filenames use the generic prefix `asset_preset_<timestamp>.<ext>` because multer's
   filename callback runs before multipart text fields are parsed. Paths are still correct and unique.
3. `control.html`'s quick loader applies identity only. If slots are reordered, old per-slot stats
   stay in place — use the full MATCH SETUP apply (stats reset) before a new game.
4. No preset import/export yet.
5. No SEC countdown integration yet (phase 2).
6. Preset deletion is permanent (no undo); teams with players are protected.
7. `presets.json` is not in any backup rotation; add it to the GitHub sync manifest if desired.
8. The `control.html` preset block is unstyled beyond existing classes; visual polish can follow.
9. Screenshot filenames in `Assets/screenshots/` are case-mismatched with page names (works on
   Windows, breaks on case-sensitive hosts). Hub falls back to an inline SVG when missing.
10. Imported Players Intro data has no team logos (upload manually) and several full names are blank
    because the source `teams_data.js` only had role labels (DE 2, DHM 1/2, DIT 1).
11. `Players Intro` still ships its 22 MB `teams_data.js` as the offline fallback; it is not removed.
12. Players Intro styling/layout is local to the studio, not stored in presets.json. Only team name,
    player IGN/full name/photo/role/order are synced.

---

## 9. COPY-PASTE PROMPT FOR THE NEXT SESSION

---

> **Project:** `D:\School\SEC\WATCHPARTY\template-here` — local Node.js/Express 5 + `ws` MLBB
> broadcast-overlay toolkit. Vanilla HTML/CSS/JS in `public/`, no build step, port 3000, no auth.
> Windows host, OBS browser sources at 1920×1080.
>
> **Read these files completely, in this order:**
> 1. `PROJECT_GUIDE.md` — architecture, API, data schemas, page inventory, SEC suite, conventions, bugs.
> 2. `CENTRAL_CONTROL_SPEC.md` — the Central Control + Presets feature, its decisions, what was built,
>    exact endpoints, integration points, tests, and known limitations.
>
> **Context:** Central Control is already implemented (status 🟢 BUILT). Do not rebuild it from scratch.
> Start by reading the code listed in `CENTRAL_CONTROL_SPEC.md` §3 and running the server.
>
> **Task:** `<DESCRIBE THE NEXT TASK — polish, bug fix, new tab, SEC integration, etc.>`
>
> **Hard rules:**
> - Read the two docs first; verify every claim against the actual files. If docs and code disagree,
>   trust the code and update the docs.
> - All reads/writes through `/api/*`; never write JSON from the browser.
> - Presets store **asset paths, not base64**; uploads go to `public/Assets/presets/`.
> - Keep role values exactly `gold|exp|mid|junggle|roam` (legacy spelling).
> - New server state must follow the existing pattern: seed file → `cache` → `fileQueue.enqueue`
>   write → WebSocket broadcast (see `presets` and `secCountdown` in `server.js`).
> - Do not edit `_backup_before_sec/` or `_backup_watermark_originals/`; never print
>   `github_config.json`.
> - Do not break the draft phase logic in `herodropdown.js` / `displayhero.js`.
> - No frameworks, no build step, no npm additions. Match the existing visual language.
>
> **Before finishing:** update `CENTRAL_CONTROL_SPEC.md` (status, tests, limitations) and
> `PROJECT_GUIDE.md` §0, then list every file changed and how to test it end-to-end
> (Central Control → control → postgame → MVP display).
>
> **My additional instructions:** `<anything else>`

---

## 10. Change log

| Date | Change |
|---|---|
| 2026-11-03 | Initial draft: requirements, code touchpoints, proposed architecture, open questions. |
| 2026-11-03 | Implemented full feature; recorded decisions, endpoints, integrations and smoke-test results. |
| 2026-11-04 | Imported the 9 Players Intro teams / 50 players into presets; added full name + sub role + roster order; served the studio at `/playersintro/` and made it read `/api/presets`; added the PLAYERS INTRO tab. |
| 2026-11-06 | Fixed Central Control preset image upload (raised limit to 50 MB, universal image support: PNG/JPG/WEBP/JFIF/GIF/AVIF/BMP/SVG/TIFF/HEIC, MIME fallback, accept="image/*", multer error middleware, prevented silent overwrite on upload errors). Added inline player roster dropdowns (P1-P5 for Blue and Red) in `control.html` with auto-fill for nickname, lane/role, and photo sync to `matchdata`. |
