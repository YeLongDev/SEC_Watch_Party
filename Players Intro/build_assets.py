"""
Generates default player cutout portraits for both Team A (Purple #24103a)
and Team B (Red #7f1d1d) and bundles logo.png + intro_bgm.mp3 into
Players Intro/assets.js as data URLs.
"""
import os
import io
import base64
import numpy as np
from PIL import Image, ImageDraw

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(OUT_DIR, "logo.png")
BGM_PATH = os.path.join(OUT_DIR, "intro_bgm.mp3")
ASSETS_JS_PATH = os.path.join(OUT_DIR, "assets.js")


def file_to_data_url(path, mime):
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def pil_to_data_url(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def make_esports_avatar(jersey_hex, accent_hex, rim_rgb, pose_type=0):
    """Creates a clean esports pro player cutout portrait (700x900 RGBA)."""
    W, H = 700, 900
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    def rgb(h, a=255):
        return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)

    j_col = rgb(jersey_hex)
    a_col = rgb(accent_hex)
    dark_col = (20, 12, 28, 255)
    skin_col = (215, 175, 155, 255)
    skin_shadow = (175, 135, 118, 255)
    hair_col = (22, 16, 26, 255)
    white_col = (242, 240, 250, 255)

    cx = W // 2

    # Torso / Esports Jersey
    torso_poly = [
        (cx - 175, H),
        (cx - 205, 520),
        (cx - 165, 420),
        (cx - 70, 385),
        (cx + 70, 385),
        (cx + 165, 420),
        (cx + 205, 520),
        (cx + 175, H),
    ]
    dr.polygon(torso_poly, fill=j_col)

    # Shoulder panels
    dr.polygon([(cx - 165, 420), (cx - 95, 400), (cx - 135, 620), (cx - 205, 520)], fill=a_col)
    dr.polygon([(cx + 165, 420), (cx + 95, 400), (cx + 135, 620), (cx + 205, 520)], fill=a_col)

    # Chest V-chevron
    dr.polygon([
        (cx - 115, 470), (cx, 545), (cx + 115, 470),
        (cx + 115, 500), (cx, 575), (cx - 115, 500)
    ], fill=white_col)
    dr.polygon([
        (cx - 95, 520), (cx, 585), (cx + 95, 520),
        (cx + 95, 540), (cx, 605), (cx - 95, 540)
    ], fill=a_col)

    # Collar & Neck
    dr.polygon([(cx - 48, 330), (cx + 48, 330), (cx + 58, 410), (cx, 445), (cx - 58, 410)], fill=skin_shadow)
    dr.polygon([(cx - 68, 385), (cx, 450), (cx + 68, 385), (cx + 52, 415), (cx, 468), (cx - 52, 415)], fill=dark_col)

    if pose_type % 2 == 0:
        dr.rounded_rectangle([cx - 190, 585, cx + 190, 705], radius=48, fill=skin_col)
        dr.rounded_rectangle([cx - 175, 610, cx + 175, 720], radius=44, fill=j_col)
        dr.line([(cx - 140, 615), (cx + 130, 695)], fill=a_col, width=8)
    else:
        dr.polygon([(cx - 205, 520), (cx - 135, 520), (cx - 120, H), (cx - 185, H)], fill=dark_col)
        dr.polygon([(cx + 205, 520), (cx + 135, 520), (cx + 120, H), (cx + 185, H)], fill=dark_col)

    # Head
    dr.ellipse([cx - 92, 165, cx + 92, 375], fill=skin_col)
    dr.chord([cx - 92, 165, cx + 92, 375], start=30, end=150, fill=skin_shadow)

    # Headset
    dr.arc([cx - 112, 150, cx + 112, 365], start=185, end=355, fill=a_col, width=14)
    dr.rounded_rectangle([cx - 118, 235, cx - 86, 305], radius=12, fill=dark_col, outline=a_col, width=4)
    dr.rounded_rectangle([cx + 86, 235, cx + 118, 305], radius=12, fill=dark_col, outline=a_col, width=4)

    # Hair
    dr.chord([cx - 98, 140, cx + 98, 290], start=170, end=10, fill=hair_col)
    dr.polygon([(cx - 95, 210), (cx - 50, 145), (cx + 30, 140), (cx + 96, 205), (cx + 60, 235), (cx - 40, 230)], fill=hair_col)

    arr = np.asarray(im, dtype=np.float32)
    alpha = arr[..., 3] / 255.0
    edge = np.clip((np.abs(np.gradient(alpha, axis=1)) + np.abs(np.gradient(alpha, axis=0))) * 2.2, 0.0, 1.0)
    arr[..., 0] = np.clip(arr[..., 0] + edge * rim_rgb[0], 0, 255)
    arr[..., 1] = np.clip(arr[..., 1] + edge * rim_rgb[1], 0, 255)
    arr[..., 2] = np.clip(arr[..., 2] + edge * rim_rgb[2], 0, 255)

    return Image.fromarray(arr.astype(np.uint8), "RGBA")


# Default V-formation positions for a 6-player squad (normalized offsets from center)
GROUP_SLOTS = [
    {"gx": -70,  "gy": 25,  "gScale": 1.00, "z": 6},  # P1 Front-Left-Center (Captain)
    {"gx": 75,   "gy": 25,  "gScale": 1.00, "z": 5},  # P2 Front-Right-Center
    {"gx": -220, "gy": 10,  "gScale": 0.92, "z": 4},  # P3 Mid-Left
    {"gx": 225,  "gy": 10,  "gScale": 0.92, "z": 3},  # P4 Mid-Right
    {"gx": -355, "gy": -5,  "gScale": 0.85, "z": 2},  # P5 Wing-Left
    {"gx": 360,  "gy": -5,  "gScale": 0.85, "z": 1},  # P6 Wing-Right
]

ROLES = ["TEAM CAPTAIN", "CO-CAPTAIN", "STAR PLAYER", "STRATEGIST", "ANCHOR", "FLEX PLAYER"]

team_a_palettes = [
    ("#2E144D", "#9D7BEA", 0),
    ("#1F1037", "#00D2FF", 1),
    ("#3B1763", "#F2C94C", 0),
    ("#24103A", "#B794F4", 1),
    ("#311354", "#38BDF8", 0),
    ("#1B0C2E", "#A855F7", 1),
]

team_b_palettes = [
    ("#5C0A14", "#EF4444", 0),
    ("#450A0A", "#F59E0B", 1),
    ("#6B0F1A", "#F87171", 0),
    ("#4C0519", "#FB7185", 1),
    ("#580C12", "#FBBF24", 0),
    ("#3B070C", "#EF4444", 1),
]

print("Building Team A & Team B assets into Players Intro/assets.js ...")
logo_url = file_to_data_url(LOGO_PATH, "image/png")
vs_logo_url = file_to_data_url(os.path.join(OUT_DIR, "vs_logo.png"), "image/png")
bgm_url = file_to_data_url(BGM_PATH, "audio/mpeg")

os.makedirs(os.path.join(OUT_DIR, "sample_players"), exist_ok=True)

team_a_urls = []
for i, (jc, ac, pt) in enumerate(team_a_palettes):
    im = make_esports_avatar(jc, ac, (180, 140, 255), pt)
    team_a_urls.append(pil_to_data_url(im))
    im.save(os.path.join(OUT_DIR, "sample_players", f"team_a_player_{i + 1}.png"))

team_b_urls = []
for i, (jc, ac, pt) in enumerate(team_b_palettes):
    im = make_esports_avatar(jc, ac, (255, 110, 110), pt)
    team_b_urls.append(pil_to_data_url(im))
    im.save(os.path.join(OUT_DIR, "sample_players", f"team_b_player_{i + 1}.png"))

with open(ASSETS_JS_PATH, "w", encoding="utf-8") as f:
    f.write("// Auto-generated embedded assets for Team A, Team B & VS Studio\n")
    f.write("window.SIKAT_INTRO_ASSETS = {\n")
    f.write(f'  logoDataUrl: "{logo_url}",\n')
    f.write(f'  vsLogoDataUrl: "{vs_logo_url}",\n')
    f.write(f'  bgmDataUrl: "{bgm_url}",\n')

    for t_key, prefix, urls in [("teamAPlayers", "PLAYER A", team_a_urls), ("teamBPlayers", "PLAYER B", team_b_urls)]:
        f.write(f"  {t_key}: [\n")
        for i, u in enumerate(urls):
            gs = GROUP_SLOTS[i % len(GROUP_SLOTS)]
            f.write("    {\n")
            f.write(f'      name: "{prefix}{i + 1}",\n')
            f.write(f'      title: "{ROLES[i]}",\n')
            f.write(f'      photo: "{u}",\n')
            f.write("      scale: 1.0,\n")
            f.write("      offsetX: 0,\n")
            f.write("      offsetY: 0,\n")
            f.write(f'      groupX: {gs["gx"]},\n')
            f.write(f'      groupY: {gs["gy"]},\n')
            f.write(f'      groupScale: {gs["gScale"]},\n')
            f.write(f'      groupZ: {gs["z"]},\n')
            f.write("      vsX: 0,\n")
            f.write("      vsY: 0,\n")
            f.write("      vsScale: 1.0,\n")
            f.write("      removeBg: false,\n")
            f.write("      duration: 3.0\n")
            f.write("    },\n")
        f.write("  ],\n")
    f.write("};\n")

print(f"Updated {ASSETS_JS_PATH} ({os.path.getsize(ASSETS_JS_PATH) // 1024} KB)")
