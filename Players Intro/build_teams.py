"""
Scans the 'teams' folder, extracts player transparent portraits & names,
and generates 'teams_data.js' so index.html can select any team preset
directly in the browser without re-editing!
"""
import os
import re
import io
import json
import base64
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEAMS_DIR = os.path.join(BASE_DIR, "teams")
OUTPUT_JS = os.path.join(BASE_DIR, "teams_data.js")

TEAM_PRESETS = {
    "DCS 1": {"colPrimary": "#1e1b4b", "colSecondary": "#4338ca", "colAccent": "#818cf8", "colBg": "#080616", "sub": "DEPARTMENT OF COMPUTER STUDIES"},
    "DCS 2": {"colPrimary": "#312e81", "colSecondary": "#6366f1", "colAccent": "#a5b4fc", "colBg": "#0a091d", "sub": "DEPARTMENT OF COMPUTER STUDIES"},
    "DE 1":  {"colPrimary": "#064e3b", "colSecondary": "#059669", "colAccent": "#34d399", "colBg": "#03120e", "sub": "DEPARTMENT OF ENGINEERING"},
    "DE 2":  {"colPrimary": "#065f46", "colSecondary": "#10b981", "colAccent": "#6ee7b7", "colBg": "#041712", "sub": "DEPARTMENT OF ENGINEERING"},
    "DHM 1": {"colPrimary": "#422006", "colSecondary": "#d97706", "colAccent": "#facc15", "colBg": "#0f0904", "sub": "DEPT. OF HOSPITALITY MANAGEMENT"},
    "DHM 2": {"colPrimary": "#78350f", "colSecondary": "#b45309", "colAccent": "#fde047", "colBg": "#140c04", "sub": "DEPT. OF HOSPITALITY MANAGEMENT"},
    "DIT 1": {"colPrimary": "#0c2d48", "colSecondary": "#0284c7", "colAccent": "#38bdf8", "colBg": "#040d17", "sub": "DEPT. OF INDUSTRIAL TECHNOLOGY"},
    "DIT 2": {"colPrimary": "#164e63", "colSecondary": "#0891b2", "colAccent": "#67e8f9", "colBg": "#051318", "sub": "DEPT. OF INDUSTRIAL TECHNOLOGY"},
    "DTE 1": {"colPrimary": "#5c0a14", "colSecondary": "#dc2626", "colAccent": "#f87171", "colBg": "#120406", "sub": "DEPT. OF TEACHER EDUCATION"},
}

DEFAULT_GROUP_SLOTS = [
    {"gx": -80,  "gy": 35,  "gScale": 1.02, "z": 6},
    {"gx": 85,   "gy": 35,  "gScale": 1.02, "z": 5},
    {"gx": -245, "gy": 15,  "gScale": 0.93, "z": 4},
    {"gx": 250,  "gy": 15,  "gScale": 0.93, "z": 3},
    {"gx": -395, "gy": -8,  "gScale": 0.85, "z": 2},
    {"gx": 400,  "gy": -8,  "gScale": 0.85, "z": 1}
]

ROLES = ["TEAM CAPTAIN", "CO-CAPTAIN", "STAR PLAYER", "STRATEGIST", "ANCHOR", "FLEX PLAYER"]


def image_to_optimized_png_data_url(filepath, max_dim=1200):
    """Loads an image, optionally downsizes if gigantic, and encodes as PNG base64 data URL."""
    try:
        im = Image.open(filepath)
        if im.mode != "RGBA":
            im = im.convert("RGBA")
        w, h = im.size
        if max(w, h) > max_dim:
            scale = max_dim / max(w, h)
            nw = int(w * scale)
            nh = int(h * scale)
            im = im.resize((nw, nh), Image.Resampling.LANCZOS)

        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"
    except Exception as e:
        print(f"Error reading image {filepath}: {e}")
        return None


def parse_player_filename(fname):
    """
    Parses filenames such as:
      'Bulda, Dhan Aeron T. (Finx Lunarnyx) - Catapang Lawrence.jpg' -> Name: 'Dhan Aeron Bulda', IGN: 'Finx Lunarnyx'
      'ARVIN PAEZ BLANCAFLOR (Vin.).jpeg' -> Name: 'Arvin Paez Blancaflor', IGN: 'Vin.'
      'Dustin Earl Detera (EARL).jpg' -> Name: 'Dustin Earl Detera', IGN: 'EARL'
    """
    base = os.path.splitext(fname)[0]
    base = re.sub(r"\s*-\s*[^-]+$", "", base).strip()

    m = re.search(r"\(([^)]+)\)", base)
    if m:
        ign = m.group(1).strip()
        name_part = (base[:m.start()] + base[m.end():]).strip()
    else:
        ign = ""
        name_part = base

    # Clean up name: if "Last, First Middle" format
    if "," in name_part:
        parts = [p.strip() for p in name_part.split(",") if p.strip()]
        if len(parts) >= 2:
            clean_name = f"{parts[1]} {parts[0]}"
        else:
            clean_name = parts[0]
    else:
        clean_name = name_part

    # Clean up excess spaces or symbols
    clean_name = re.sub(r"\s+", " ", clean_name).strip()
    if clean_name.isupper():
        clean_name = clean_name.title()

    if not ign:
        ign = clean_name

    return clean_name, ign


def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r"(\d+)", s)]


def find_team_logo(team_path, trans_path):
    """
    Looks for a transparent team logo file named 'logo.png', 'logo.jpeg', 'logo.jpg', or 'logo.webp'.
    Searches both the 'transparent' subfolder and the root team folder.
    Also falls back to any file with 'logo' in its name.
    """
    candidates = ["logo.png", "logo.jpeg", "logo.jpg", "logo.webp"]
    
    # 1. Exact match in transparent/ subfolder
    if os.path.exists(trans_path):
        for f in os.listdir(trans_path):
            if f.lower() in candidates:
                return os.path.join(trans_path, f)

    # 2. Exact match in team root folder
    if os.path.exists(team_path):
        for f in os.listdir(team_path):
            if f.lower() in candidates:
                return os.path.join(team_path, f)

    # 3. Fallback: contains 'logo' in transparent/ subfolder
    if os.path.exists(trans_path):
        for f in os.listdir(trans_path):
            if "logo" in f.lower() and f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                return os.path.join(trans_path, f)

    # 4. Fallback: contains 'logo' in team root folder
    if os.path.exists(team_path):
        for f in os.listdir(team_path):
            if "logo" in f.lower() and f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                return os.path.join(team_path, f)

    return None


def build_all_teams():
    if not os.path.exists(TEAMS_DIR):
        print(f"Directory {TEAMS_DIR} does not exist!")
        return

    teams_data = {}
    team_folders = sorted([f for f in os.listdir(TEAMS_DIR) if os.path.isdir(os.path.join(TEAMS_DIR, f))])

    print(f"Found {len(team_folders)} team folders: {team_folders}")

    for team_name in team_folders:
        team_path = os.path.join(TEAMS_DIR, team_name)
        trans_path = os.path.join(team_path, "transparent")

        # Check for team logo (logo.png or logo.jpeg)
        logo_file = find_team_logo(team_path, trans_path)
        logo_data_url = None
        if logo_file:
            print(f"  -> [{team_name}] Found transparent logo: {os.path.basename(logo_file)}")
            logo_data_url = image_to_optimized_png_data_url(logo_file, max_dim=800)
        else:
            print(f"  -> [{team_name}] No logo file found (will allow manual logo upload on web)")

        # Get transparent photos (exclude any logo file)
        trans_files = []
        if os.path.exists(trans_path):
            trans_files = sorted(
                [f for f in os.listdir(trans_path) if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) and "logo" not in f.lower()],
                key=natural_sort_key
            )

        # Get original source files to extract player real names and IGNs (exclude any logo file)
        orig_files = sorted(
            [f for f in os.listdir(team_path) if os.path.isfile(os.path.join(team_path, f)) and not f.startswith(".") and "logo" not in f.lower()],
            key=natural_sort_key
        )

        preset_info = TEAM_PRESETS.get(team_name, {
            "colPrimary": "#24103a",
            "colSecondary": "#5b21b6",
            "colAccent": "#9d7bea",
            "colBg": "#090410",
            "sub": "CAVITE STATE UNIVERSITY"
        })

        players_list = []
        count = max(len(trans_files), len(orig_files))

        print(f"Processing team '{team_name}': {len(trans_files)} transparent cutouts, {len(orig_files)} names...")

        for i in range(count):
            slot = DEFAULT_GROUP_SLOTS[i % len(DEFAULT_GROUP_SLOTS)]
            role = ROLES[i % len(ROLES)]

            p_name = f"Player {i + 1}"
            p_ign = f"PLAYER {i + 1}"

            if i < len(orig_files):
                parsed_name, parsed_ign = parse_player_filename(orig_files[i])
                if parsed_name:
                    p_name = parsed_name
                if parsed_ign:
                    p_ign = parsed_ign

            photo_data_url = ""
            if i < len(trans_files):
                t_file = os.path.join(trans_path, trans_files[i])
                photo_data_url = image_to_optimized_png_data_url(t_file)
            elif i < len(orig_files):
                # Fallback to original photo if transparent version is missing
                o_file = os.path.join(team_path, orig_files[i])
                photo_data_url = image_to_optimized_png_data_url(o_file)

            players_list.append({
                "name": p_ign,
                "title": p_name if p_name != p_ign else role,
                "photo": photo_data_url,
                "scale": 1.0,
                "offsetX": 0,
                "offsetY": 0,
                "textScale": 1.0,
                "textX": 0,
                "textY": 0,
                "groupX": slot["gx"],
                "groupY": slot["gy"],
                "groupScale": slot["gScale"],
                "groupZ": slot["z"],
                "groupNameScale": 1.0,
                "groupNameX": 0,
                "groupNameY": 0,
                "showGroupName": True,
                "vsX": 0,
                "vsY": 0,
                "vsScale": 1.0,
                "duration": 3.0,
                "removeBg": False
            })

        teams_data[team_name] = {
            "key": re.sub(r"[^a-zA-Z0-9]", "_", team_name),
            "teamName": team_name,
            "introTitle": f"{team_name} PLAYERS INTRO",
            "introSub": preset_info["sub"],
            "groupSub": "OFFICIAL SQUAD LINEUP",
            "vsSub": team_name,
            "logo": logo_data_url,
            "colPrimary": preset_info["colPrimary"],
            "colSecondary": preset_info["colSecondary"],
            "colAccent": preset_info["colAccent"],
            "colBg": preset_info["colBg"],
            "players": players_list
        }

    js_content = "// Auto-generated pre-loaded categories & transparent player rosters\n"
    js_content += "window.SIKAT_TEAMS_PRESETS = " + json.dumps(teams_data, indent=2) + ";\n"

    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"Successfully wrote {OUTPUT_JS} ({os.path.getsize(OUTPUT_JS) // 1024} KB) with {len(teams_data)} teams!")


if __name__ == "__main__":
    build_all_teams()

