# SIKAT E-Sports – Players Intro Studio & Video Renderer (v2)

## 📁 Files in `Players Intro/`
* **`index.html`** — **Interactive Players Intro Studio & Video Exporter (v2)**. Double-click to open in Chrome or Microsoft Edge!
* **`sikat_team_a_intro.mp4`** (and `sikat_players_intro.mp4`) — Pre-rendered **Team A Only** video (`#24103a` SIKAT purple branding, Team Logo Intro, Combined Group Team Photo, 6 Player Slides, Outro).
* **`sikat_team_b_intro.mp4`** — Pre-rendered **Team B Only** video (`#5c0a14` / `#dc2626` Crimson Red branding with full red adaptive background, Group Team Photo, 6 Player Slides, Outro).
* **`sikat_vs_intro.mp4`** — Pre-rendered **Team A vs Team B (1v1 VS Mode)** video (`Player 1 vs Player 1`, `Player 2 vs Player 2`, etc., with dark-silhouette-to-lit reveal, Pro Esports Winged Crest centerpiece, and no shutter wipe transition).
* **`sikat_all_combined_intro.mp4`** — All 3 videos (**Team A + Team B + VS Mode**) combined into a single broadcast video (`69.4s`).
* **`teams_data.js`** — Pre-bundled presets and transparent player cutouts extracted from the `teams/` folder.
* **`UPDATE_TEAMS.bat`** — Double-click updater script: automatically scans all subfolders in `teams/` (including any new photos in `transparent/`) and updates the website!
* **`assets.js`** — Bundled default assets (Team Logo, BGM audio, and Team A & Team B player cutouts) so `index.html` works offline without CORS errors.
* **`render_intro_video.py`** — Standalone Python + FFmpeg renderer script that generates all 4 MP4 videos.

---

## 🛠️ How to Edit Teams, Drag Photos/Names & Render Videos in `index.html`

1. **Open the Studio:** Double-click **`Players Intro/index.html`** in Chrome or Edge.
2. **Choose Preview & Render Mode (Top Mode Bar):**
   * **🟣 Team A Only** — Team A Logo → Combined Group Photo → Team A Players → Outro
   * **🔴 Team B Only** — Team B Logo → Combined Group Photo → Team B Players → Outro
   * **⚔️ VS Mode (1v1)** — Team A vs Team B Clash Intro → `Player 1 vs Player 1`, `Player 2 vs Player 2`, etc. (smooth dark-silhouette-to-lit reveal with no diagonal shutter wipe)
   * **🎬 All 3 Combined (One Video)** — Plays and renders **Team A + Team B + VS Mode** back-to-back as a single video file!
3. **Interactive Group Photo Editing (Move Players & Move/Delete Individual Player Names):**
   * Click **`📸 Edit Team A Group Photo`** or **`📸 Edit Team B Group Photo`** above the canvas.
   * **Move or Resize a Player:** Click and drag any player's **photo** on the canvas to reposition them (`Group X` / `Group Y`), or scroll your mouse wheel over them to resize.
   * **Move an Individual Player's Name Tag:** Click and drag any player's **nameplate pill** on the Group Photo canvas to move that player's name anywhere independently (`Name X` / `Name Y`)!
   * **Delete / Hide an Individual Player's Name Tag:**
     * Hover over any player's nameplate on the Group Photo canvas and click the red **`✕`** button (or press the **`Delete` / `Backspace`** key), OR
     * Uncheck **`🏷️ Group Name`** in that player's card in the left sidebar, OR
     * Use **`🏷️ Show All Group Names`** / **`🗑️ Hide All Group Names`** in the Team Branding box!
4. **Customize VS Centerpiece & Background (`⚔️ VS & Audio` Tab):**
   * Choose between **⚡ Pro Esports Winged Crest + Slash V/S**, **🔥 High-Voltage Lightning Clash + Chrome VS**, or **👑 Clean Studio (No Center Emblem)**.
5. **Preset Teams & Transparent Photos (`teams/` Folder):**
   * In the sidebar (or inside the **⚔️ VS & Audio** tab), look for the **📁 PRESET TEAMS** box.
   * Choose any team from the **🟣 LOAD FOR TEAM A** dropdown or **🔴 LOAD FOR TEAM B** dropdown (e.g. DCS 1, DCS 2, DE 1, DE 2, DHM 1, DHM 2, DIT 1, DIT 2, DTE 1).
   * The team name, colors, and all player cutouts from `transparent/` will load instantly!
   * **Adding New Photos, Logos, or Teams:**
     * Drop new player cutout photos into the team's `transparent/` folder (e.g. `1.png`, `2.png`, etc.).
     * Place the team logo as **`logo.png`** or **`logo.jpeg`** inside the team's folder (or inside its `transparent/` folder).
     * Double-click **`UPDATE_TEAMS.bat`** to re-scan.
     * Refresh `index.html` in your browser and your new photos and logos are immediately updated!
     * If a team doesn't have a logo file yet, you can also upload one manually anytime by clicking the circular **`UPLOAD LOGO`** slot in the sidebar under Team A or Team B!
6. **Render & Download Video:**
   * Select which mode you want to export (**Team A Only**, **Team B Only**, **VS Only**, or **All 3 Combined as One**).
   * Click **`🎬 RENDER & DOWNLOAD`**. The browser records the sequence at 60fps with synced audio and downloads the video automatically.
