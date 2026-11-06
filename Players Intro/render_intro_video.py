"""
SIKAT E-Sports - Players Intro Video Renderer v2 (Python + FFmpeg)
Renders:
  1. sikat_team_a_intro.mp4       (Team A Purple #24103a: Logo -> Group Photo -> Roster -> Outro)
  2. sikat_team_b_intro.mp4       (Team B Red #5c0a14: Logo -> Group Photo -> Roster -> Outro)
  3. sikat_vs_intro.mp4           (Team A vs Team B 1v1 Matchups with silhouette-to-lit reveal)
  4. sikat_all_combined_intro.mp4 (All 3 combined into one continuous broadcast video)
"""
import os
import math
import shutil
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(OUT_DIR, "logo.png")
BGM_PATH = os.path.join(OUT_DIR, "intro_bgm.mp3")
PLAYERS_DIR = os.path.join(OUT_DIR, "sample_players")

W, H, FPS = 1280, 720, 30

# Team Themes
TEAM_A_CFG = {
    "key": "teamA",
    "team_name": "SIKAT ESPORTS CLUB",
    "intro_title": "TEAM A PLAYERS INTRO",
    "intro_sub": "CAVITE STATE UNIVERSITY • CCAT CAMPUS",
    "primary": (36, 16, 58),     # #24103A
    "secondary": (91, 33, 182),  # #5B21B6
    "accent": (157, 123, 234),   # #9D7BEA
    "bg": (9, 4, 16),            # #090410
    "prefix": "team_a_player",
    "name_prefix": "PLAYER A",
}

TEAM_B_CFG = {
    "key": "teamB",
    "team_name": "TEAM B CHALLENGERS",
    "intro_title": "TEAM B PLAYERS INTRO",
    "intro_sub": "OFFICIAL ROSTER SHOWCASE",
    "primary": (92, 10, 20),     # #5C0A14
    "secondary": (220, 38, 38),  # #DC2626
    "accent": (248, 113, 113),   # #F87171
    "bg": (18, 4, 6),            # #120406
    "prefix": "team_b_player",
    "name_prefix": "PLAYER B",
}

ROLES = ["TEAM CAPTAIN", "CO-CAPTAIN", "STAR PLAYER", "STRATEGIST", "ANCHOR", "FLEX PLAYER"]
GROUP_SLOTS = [
    (-55,  22, 1.00, 6),
    (58,   22, 1.00, 5),
    (-165, 10, 0.92, 4),
    (168,  10, 0.92, 3),
    (-265, -5, 0.85, 2),
    (268,  -5, 0.85, 1),
]


def load_font(name, size):
    p = os.path.join(r"C:\Windows\Fonts", name)
    if os.path.exists(p):
        return ImageFont.truetype(p, size)
    return ImageFont.load_default()


FONT_NAME = load_font("arialbi.ttf", 48)
FONT_TITLE = load_font("arialbi.ttf", 26)
FONT_HEADER = load_font("arialbi.ttf", 21)
FONT_CHEVRON = load_font("arialbd.ttf", 22)
FONT_INTRO_MAIN = load_font("arialbi.ttf", 40)
FONT_INTRO_SUB = load_font("arialbd.ttf", 21)
FONT_INTRO_SMALL = load_font("arialbd.ttf", 14)
FONT_TAG = load_font("arialbi.ttf", 15)


def c01(t):
    return max(0.0, min(1.0, float(t)))


def ease_out_cubic(t):
    t = c01(t)
    return 1.0 - (1.0 - t) ** 3


def ease_in_cubic(t):
    t = c01(t)
    return t ** 3


def ease_out_back(t, s=1.35):
    t = c01(t) - 1.0
    return t * t * ((s + 1.0) * t + s) + 1.0


def logo_fit_box(src, box_w, box_h):
    """Crop transparent padding and fit the logo into a box without stretching."""
    bbox = src.getbbox()
    crop = src.crop(bbox) if bbox else src
    scale = min(box_w / crop.width, box_h / crop.height)
    w = max(1, int(round(crop.width * scale)))
    h = max(1, int(round(crop.height * scale)))
    fitted = crop.resize((w, h), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    out.alpha_composite(fitted, ((box_w - w) // 2, (box_h - h) // 2))
    return out


logo_src = Image.open(LOGO_PATH).convert("RGBA")
logo_intro_base = logo_fit_box(logo_src, 512, 512)
logo_small = logo_fit_box(logo_src, 26, 26)
logo_watermark = logo_fit_box(logo_src, int(H * 0.58), int(H * 0.58))
wm_arr = np.asarray(logo_watermark, dtype=np.float32).copy()
wm_arr[..., 3] *= 0.22
logo_watermark = Image.fromarray(wm_arr.astype(np.uint8), "RGBA")


def build_team_assets(cfg):
    # Adaptive carbon hex background
    bg = Image.new("RGBA", (W, H), (*cfg["bg"], 255))
    bdr = ImageDraw.Draw(bg)
    r_hex = 12
    for y in range(0, H + 30, 22):
        shift = 18 if (y // 22) % 2 == 1 else 0
        for x in range(-20, W + 40, 36):
            cx, cy = x + shift, y
            pts = [(cx + r_hex * math.cos(math.pi / 3 * i), cy + r_hex * math.sin(math.pi / 3 * i)) for i in range(6)]
            bdr.polygon(pts, outline=(*cfg["accent"], 30))

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dist = np.sqrt((xx - W * 0.5) ** 2 + (yy - H * 0.5) ** 2)
    glow = np.exp(-(dist / (W * 0.44)) ** 2)
    arr = np.asarray(bg, dtype=np.float32).copy()
    for c in range(3):
        arr[..., c] = np.clip(arr[..., c] + glow * (cfg["secondary"][c] * 0.34), 0, 255)
    cfg["bg_im"] = Image.fromarray(arr.astype(np.uint8), "RGBA")

    # Players
    players = []
    for i in range(6):
        p_im = Image.open(os.path.join(PLAYERS_DIR, f"{cfg['prefix']}_{i + 1}.png")).convert("RGBA")
        mh = int(H * 0.92)
        mw = int(p_im.width * (mh / p_im.height))
        main_im = p_im.resize((mw, mh), Image.Resampling.LANCZOS)

        # Group scaled version
        gx, gy, gsc, gz = GROUP_SLOTS[i]
        gh_grp = int(H * 0.74 * gsc)
        gw_grp = int(p_im.width * (gh_grp / p_im.height))
        grp_im = p_im.resize((gw_grp, gh_grp), Image.Resampling.LANCZOS)

        # VS scaled version + darkened silhouette
        vh = int(H * 0.80)
        vw = int(p_im.width * (vh / p_im.height))
        vs_im = p_im.resize((vw, vh), Image.Resampling.LANCZOS)
        va = np.asarray(vs_im, dtype=np.float32).copy()
        va[..., 0] = va[..., 0] * 0.15 + cfg["primary"][0] * 0.12
        va[..., 1] = va[..., 1] * 0.15 + cfg["primary"][1] * 0.12
        va[..., 2] = va[..., 2] * 0.15 + cfg["primary"][2] * 0.12
        vs_dark_im = Image.fromarray(np.clip(va, 0, 255).astype(np.uint8), "RGBA")

        # Team-tinted ghost silhouette
        gh_h = int(H * 1.14)
        gh_w = int(p_im.width * (gh_h / p_im.height))
        gh_im = p_im.resize((gh_w, gh_h), Image.Resampling.LANCZOS)
        ga = np.asarray(gh_im, dtype=np.float32).copy()
        luma = (0.299 * ga[..., 0] + 0.587 * ga[..., 1] + 0.114 * ga[..., 2]) / 255.0
        t_l = luma ** 0.85
        for c in range(3):
            ga[..., c] = cfg["primary"][c] * (1 - t_l) + cfg["secondary"][c] * t_l + cfg["accent"][c] * np.maximum(0, t_l - 0.55) * 0.65
        ga[..., 3] *= 0.48
        ghost_im = Image.fromarray(np.clip(ga, 0, 255).astype(np.uint8), "RGBA")

        players.append({
            "name": f"{cfg['name_prefix']}{i + 1}",
            "title": ROLES[i],
            "main_im": main_im,
            "grp_im": grp_im,
            "gx": gx, "gy": gy, "gz": gz,
            "vs_im": vs_im,
            "vs_dark_im": vs_dark_im,
            "ghost_im": ghost_im,
            "dur": 2.8,
        })
    cfg["players"] = players


build_team_assets(TEAM_A_CFG)
build_team_assets(TEAM_B_CFG)


def draw_diamond(draw, cx, cy, size, fill, outline=None, width=2):
    r = size * 0.7071
    pts = [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
    draw.polygon(pts, fill=fill, outline=outline, width=width)


def make_octagon_pts(cx, cy, rx, ry):
    k = 0.42
    return [
        (cx - rx * k, cy - ry),
        (cx + rx * k, cy - ry),
        (cx + rx, cy - ry * k),
        (cx + rx, cy + ry * k),
        (cx + rx * k, cy + ry),
        (cx - rx * k, cy + ry),
        (cx - rx, cy + ry * k),
        (cx - rx, cy - ry * k),
    ]


VS_LOGO_IM = Image.open(os.path.join(OUT_DIR, "vs_logo.png")).convert("RGBA")


def draw_pro_vs_centerpiece(im, dr, cx, cy, s=1.0, is_intro=False):
    target_h = int((220 if is_intro else 175) * s)
    target_w = int(VS_LOGO_IM.width * (target_h / VS_LOGO_IM.height))
    vs_resized = VS_LOGO_IM.resize((target_w, target_h), Image.Resampling.LANCZOS)

    # Subtle dark shadow + glow behind the lightning-slash VS logo
    vs_arr = np.asarray(vs_resized, dtype=np.uint8)
    sh_arr = np.zeros_like(vs_arr)
    sh_arr[..., 3] = (vs_arr[..., 3].astype(np.float32) * 0.75).astype(np.uint8)
    sh_im = Image.fromarray(sh_arr, "RGBA")

    px = int(cx - target_w // 2)
    py = int(cy - target_h // 2)
    im.alpha_composite(sh_im, (px + 4, py + 6))
    im.alpha_composite(vs_resized, (px, py))


def draw_shutter_wipe(im, p, cfg):
    if p <= 0.0 or p >= 1.0:
        return
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(overlay)
    span = W + H + 360
    pos = (p - 0.5) * span * 2.1
    cx, cy = W * 0.5, H * 0.5
    cos45, sin45 = 0.7071, -0.7071
    for half_w, col in [(310, (*cfg["accent"], 255)), (270, (*cfg["secondary"], 255)), (210, (*cfg["primary"], 255))]:
        x0, x1 = pos - half_w, pos + half_w
        y0, y1 = -950, 950
        pts = [(cx + px * cos45 - py * sin45, cy + px * sin45 + py * cos45) for px, py in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]]
        dr.polygon(pts, fill=col)
    im.alpha_composite(overlay)


def draw_geo_frame(dr, t, cfg):
    drift = math.sin(t * 1.4) * 8
    # Outer wing accent lines ONLY (never crossing the central player face!)
    dr.line([(W * 0.04, -20), (W * 0.28, H + 20)], fill=(*cfg["accent"], 85), width=4)
    dr.line([(W * 0.78, -20), (W * 1.02, H + 20)], fill=(*cfg["accent"], 85), width=4)

    draw_diamond(dr, -40 + drift, H * 0.52, 460, (*cfg["primary"], 255), (*cfg["accent"], 95), 2)
    draw_diamond(dr, -80 - drift * 0.5, H * 0.48, 350, (*cfg["secondary"], 255))
    draw_diamond(dr, W + 25 - drift, H * 0.45, 510, (*cfg["primary"], 255), (*cfg["accent"], 100), 2)
    draw_diamond(dr, W + 75 + drift * 0.5, H * 0.62, 375, (*cfg["secondary"], 255))
    draw_diamond(dr, W * 0.42, -170, 370, (*cfg["primary"], 255))
    draw_diamond(dr, W * 0.62, -180, 350, (*cfg["secondary"], 255))
    draw_diamond(dr, W * 0.14, H + 140, 300, (*cfg["primary"], 255))
    draw_diamond(dr, W * 0.85, H + 155, 310, (*cfg["primary"], 255))

    draw_diamond(dr, W * 0.15, H * 0.28 + math.sin(t * 2.1) * 10, 60, (*cfg["secondary"], 255), (*cfg["accent"], 140), 2)
    draw_diamond(dr, W * 0.82, H * 0.62 + math.cos(t * 1.8) * 11, 70, (*cfg["secondary"], 255), (*cfg["accent"], 140), 2)
    draw_diamond(dr, W * 0.88, H * 0.22 + math.sin(t * 2.4 + 1) * 8, 46, (*cfg["accent"], 255))


def render_segment_frame(seg, lt, global_t):
    stype = seg["type"]
    dur = seg["dur"]

    if stype == "team_intro":
        cfg = seg["cfg"]
        im = cfg["bg_im"].copy()
        dr = ImageDraw.Draw(im)

        smoke = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sdr = ImageDraw.Draw(smoke)
        expand = ease_out_cubic(min(1.0, lt / 1.0))
        for i in range(14):
            ang = (i / 14.0) * math.pi * 2 + lt * 0.3 * (1 if i % 2 == 0 else -1)
            rad = (170 + (i % 3) * 75) * (0.45 + 0.75 * expand)
            px = int(W * 0.5 + math.cos(ang) * rad * 1.35)
            py = int(H * 0.5 + math.sin(ang) * rad * 0.85)
            pr = 140 + (i % 3) * 45
            col = cfg["secondary"] if i % 2 == 0 else cfg["accent"]
            sdr.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(*col, int(42 * expand)))
        im.alpha_composite(smoke)

        pop = ease_out_back(c01((lt - 0.08) / 0.55))
        if pop > 0.02:
            lsize = max(12, int(185 * pop))
            l_im = logo_intro_base.resize((lsize, lsize), Image.Resampling.LANCZOS)
            im.alpha_composite(l_im, (W // 2 - lsize // 2, int(H * 0.41) - lsize // 2))

        ta = int(255 * ease_out_cubic(c01((lt - 0.18) / 0.45)))
        if ta > 5:
            tl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            tdr = ImageDraw.Draw(tl)
            tdr.text((W // 2, int(H * 0.72)), cfg["team_name"], font=FONT_INTRO_MAIN, fill=(255, 255, 255, ta), anchor="mm")
            tdr.text((W // 2, int(H * 0.80)), cfg["intro_title"], font=FONT_INTRO_SUB, fill=(*cfg["accent"], ta), anchor="mm")
            tdr.text((W // 2, int(H * 0.86)), cfg["intro_sub"], font=FONT_INTRO_SMALL, fill=(235, 230, 245, int(ta * 0.85)), anchor="mm")
            im.alpha_composite(tl)

        if lt > dur - 0.22:
            draw_shutter_wipe(im, ((lt - (dur - 0.22)) / 0.22) * 0.5, cfg)
        return im.convert("RGB")

    elif stype == "group_photo":
        cfg = seg["cfg"]
        im = cfg["bg_im"].copy()
        dr = ImageDraw.Draw(im)
        draw_geo_frame(dr, global_t, cfg)

        # Watermark team logo behind group squad
        im.alpha_composite(logo_watermark, (W // 2 - logo_watermark.width // 2, int(H * 0.36) - logo_watermark.height // 2))

        # Top header
        dr.text((W // 2, int(H * 0.08)), cfg["team_name"], font=FONT_INTRO_MAIN, fill=(255, 255, 255, 255), anchor="mm")
        dr.text((W // 2, int(H * 0.13)), "OFFICIAL SQUAD LINEUP", font=FONT_INTRO_SMALL, fill=(*cfg["accent"], 255), anchor="mm")

        # Draw all players sorted back-to-front (groupZ)
        ordered = sorted(cfg["players"], key=lambda x: x["gz"])
        for order_idx, p in enumerate(ordered):
            enter = ease_out_back(c01((lt - 0.04 * order_idx) / 0.48), 1.18)
            gim = p["grp_im"]
            mx = int(W * 0.5 + p["gx"] - gim.width * 0.5)
            my = int(H - gim.height + 24 + p["gy"] + (1.0 - enter) * 65)
            im.alpha_composite(gim, (mx, my))

            # Name tag pill
            tag_x = mx + gim.width // 2
            tag_y = min(H - 28, my + gim.height - 38)
            dr.rectangle([tag_x - 52, tag_y - 12, tag_x + 52, tag_y + 12], fill=(*cfg["primary"], 235), outline=(*cfg["accent"], 255), width=2)
            dr.text((tag_x, tag_y), p["name"], font=FONT_TAG, fill=(255, 255, 255, 255), anchor="mm")

        if lt < 0.22:
            draw_shutter_wipe(im, 0.5 + (lt / 0.22) * 0.5, cfg)
        elif lt > dur - 0.22:
            draw_shutter_wipe(im, ((lt - (dur - 0.22)) / 0.22) * 0.5, cfg)
        return im.convert("RGB")

    elif stype == "player":
        cfg = seg["cfg"]
        p = seg["player"]
        prog = lt / dur
        im = cfg["bg_im"].copy()
        dr = ImageDraw.Draw(im)

        # 1. Left Ghost Silhouette
        enter_gh = ease_out_cubic(c01(lt / 0.5))
        gh_im = p["ghost_im"]
        gx = int(W * 0.24 - gh_im.width * 0.5 - 28 * prog - (1.0 - enter_gh) * 75)
        im.alpha_composite(gh_im, (gx, int(H * 0.02)))

        # 2. Geometric Frame (no white line crossing the face!)
        draw_geo_frame(dr, global_t, cfg)

        # 3. Main Opaque Player Cutout (100% opaque at all times!)
        enter_m = ease_out_cubic(c01(lt / 0.42))
        m_im = p["main_im"]
        mx = int(W * 0.56 - m_im.width * 0.5 + (1.0 - enter_m) * 160 + 12 * prog)
        my = int(H - m_im.height + 14)
        im.alpha_composite(m_im, (mx, my))

        # 4. Header & Bottom-Left Name/Title
        h_enter = ease_out_cubic(c01((lt - 0.1) / 0.4))
        hdr = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        h_draw = ImageDraw.Draw(hdr)

        tx = int(W * 0.52 + (1.0 - h_enter) * 55)
        hdr.alpha_composite(logo_small, (tx - 150, 16))
        h_draw.text((tx, 30), cfg["team_name"], font=FONT_HEADER, fill=(255, 255, 255, int(255 * h_enter)), anchor="mm")

        n_enter = ease_out_cubic(c01((lt - 0.14) / 0.42))
        t_enter = ease_out_cubic(c01((lt - 0.24) / 0.42))
        if n_enter > 0.01:
            ny = int(H - 82 + (1.0 - n_enter) * 24)
            h_draw.text((64, ny), p["name"], font=FONT_NAME, fill=(0, 0, 0, int(195 * n_enter)), anchor="lm")
            h_draw.text((62, ny - 2), p["name"], font=FONT_NAME, fill=(255, 255, 255, int(255 * n_enter)), anchor="lm")
        if t_enter > 0.01:
            ty = int(H - 42 + (1.0 - t_enter) * 18)
            h_draw.text((76, ty), p["title"], font=FONT_TITLE, fill=(243, 239, 251, int(255 * t_enter)), anchor="lm")
            h_draw.rectangle([76, ty + 18, 76 + int(95 * t_enter), ty + 22], fill=(*cfg["accent"], int(255 * t_enter)))

        im.alpha_composite(hdr)

        if lt < 0.22:
            draw_shutter_wipe(im, 0.5 + (lt / 0.22) * 0.5, cfg)
        elif lt > dur - 0.22:
            draw_shutter_wipe(im, ((lt - (dur - 0.22)) / 0.22) * 0.5, cfg)
        return im.convert("RGB")

    elif stype == "team_outro":
        cfg = seg["cfg"]
        im = cfg["bg_im"].copy()
        dr = ImageDraw.Draw(im)

        smoke = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sdr = ImageDraw.Draw(smoke)
        expand = ease_out_cubic(min(1.0, lt / 1.0))
        for i in range(14):
            ang = (i / 14.0) * math.pi * 2 + lt * 0.3 * (1 if i % 2 == 0 else -1)
            rad = (170 + (i % 3) * 75) * (0.45 + 0.75 * expand)
            px = int(W * 0.5 + math.cos(ang) * rad * 1.35)
            py = int(H * 0.5 + math.sin(ang) * rad * 0.85)
            pr = 140 + (i % 3) * 45
            col = cfg["secondary"] if i % 2 == 0 else cfg["accent"]
            sdr.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(*col, int(42 * expand)))
        im.alpha_composite(smoke)

        pop = ease_out_back(c01((lt - 0.08) / 0.55))
        if pop > 0.02:
            lsize = max(12, int(185 * pop))
            l_im = logo_intro_base.resize((lsize, lsize), Image.Resampling.LANCZOS)
            im.alpha_composite(l_im, (W // 2 - lsize // 2, int(H * 0.41) - lsize // 2))

        ta = int(255 * ease_out_cubic(c01((lt - 0.18) / 0.45)))
        if ta > 5:
            tl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            tdr = ImageDraw.Draw(tl)
            tdr.text((W // 2, int(H * 0.72)), cfg["team_name"], font=FONT_INTRO_MAIN, fill=(255, 255, 255, ta), anchor="mm")
            tdr.text((W // 2, int(H * 0.80)), cfg["intro_title"], font=FONT_INTRO_SUB, fill=(*cfg["accent"], ta), anchor="mm")
            tdr.text((W // 2, int(H * 0.86)), cfg["intro_sub"], font=FONT_INTRO_SMALL, fill=(235, 230, 245, int(ta * 0.85)), anchor="mm")
            im.alpha_composite(tl)

        if lt < 0.22:
            draw_shutter_wipe(im, 0.5 + (lt / 0.22) * 0.5, cfg)

        fade_dur = min(0.8, dur * 0.35)
        if lt > dur - fade_dur:
            fade_p = ease_in_cubic(c01((lt - (dur - fade_dur)) / fade_dur))
            fade_ov = Image.new("RGBA", (W, H), (0, 0, 0, int(255 * fade_p)))
            im.alpha_composite(fade_ov)
        return im.convert("RGB")

    elif stype == "vs_intro":
        # Split Team A (Left, Purple) vs Team B (Right, Red)
        im = TEAM_A_CFG["bg_im"].copy()
        right_bg = TEAM_B_CFG["bg_im"]
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon([(int(W * 0.53), 0), (W, 0), (W, H), (int(W * 0.47), H)], fill=255)
        im.paste(right_bg, (0, 0), mask)

        dr = ImageDraw.Draw(im)

        l_im = logo_intro_base.resize((150, 150), Image.Resampling.LANCZOS)
        im.alpha_composite(l_im, (int(W * 0.26) - 75, int(H * 0.42) - 75))
        im.alpha_composite(l_im, (int(W * 0.74) - 75, int(H * 0.42) - 75))

        dr.text((int(W * 0.26), int(H * 0.72)), TEAM_A_CFG["team_name"], font=FONT_TITLE, fill=(255, 255, 255, 255), anchor="mm")
        dr.text((int(W * 0.74), int(H * 0.72)), TEAM_B_CFG["team_name"], font=FONT_TITLE, fill=(255, 255, 255, 255), anchor="mm")

        # Pro Esports Center Winged Crest & Tapered Energy Clash
        draw_pro_vs_centerpiece(im, dr, W * 0.5, H * 0.50, 1.0, is_intro=True)
        return im.convert("RGB")

    else:
        # vs_pair: 1v1 Matchup with silhouette-to-lit reveal!
        pA = seg["pA"]
        pB = seg["pB"]
        im = TEAM_A_CFG["bg_im"].copy()
        right_bg = TEAM_B_CFG["bg_im"]
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon([(int(W * 0.53), 0), (W, 0), (W, H), (int(W * 0.47), H)], fill=255)
        im.paste(right_bg, (0, 0), mask)

        # Ghost silhouettes on left & right wings
        im.alpha_composite(pA["ghost_im"], (int(W * 0.14 - pA["ghost_im"].width * 0.5), int(H * 0.04)))
        im.alpha_composite(pB["ghost_im"], (int(W * 0.86 - pB["ghost_im"].width * 0.5), int(H * 0.04)))

        dr = ImageDraw.Draw(im)

        # Silhouette-to-lit curve (matches Screen Recording 2026-11-02 221407.mp4!)
        light_up = ease_out_cubic(c01((lt - 0.1) / 1.1))
        slide_in = ease_out_cubic(c01(lt / 0.6))

        # Blend dark silhouette -> lit cutout for Player A (Left) and Player B (Right)
        for side_x, pl, dir_sign in [(W * 0.30, pA, -1), (W * 0.70, pB, 1)]:
            lit_arr = np.asarray(pl["vs_im"], dtype=np.float32)
            dark_arr = np.asarray(pl["vs_dark_im"], dtype=np.float32)
            blended = dark_arr * (1.0 - light_up) + lit_arr * light_up
            p_im = Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8), "RGBA")
            px = int(side_x - p_im.width * 0.5 + dir_sign * (1.0 - slide_in) * 50)
            py = int(H - p_im.height - 36)
            im.alpha_composite(p_im, (px, py))

        # Pro Esports Center Winged Crest & Tapered Energy Clash
        draw_pro_vs_centerpiece(im, dr, W * 0.5, H * 0.51, 0.82, is_intro=False)

        # Bottom Nameplates
        dr.rectangle([0, H - 78, W, H], fill=(8, 3, 15, 230))
        dr.text((int(W * 0.30), H - 50), pA["name"], font=FONT_TITLE, fill=(255, 255, 255, 255), anchor="mm")
        dr.text((int(W * 0.30), H - 22), f"{pA['title']} • {TEAM_A_CFG['team_name']}", font=FONT_INTRO_SMALL, fill=(*TEAM_A_CFG["accent"], 255), anchor="mm")

        dr.text((int(W * 0.70), H - 50), pB["name"], font=FONT_TITLE, fill=(255, 255, 255, 255), anchor="mm")
        dr.text((int(W * 0.70), H - 22), f"{pB['title']} • {TEAM_B_CFG['team_name']}", font=FONT_INTRO_SMALL, fill=(*TEAM_B_CFG["accent"], 255), anchor="mm")

        return im.convert("RGB")


def make_team_timeline(cfg):
    segs = []
    t = 0.0
    for stype, dur in [("team_intro", 2.0), ("group_photo", 2.8)]:
        segs.append({"type": stype, "cfg": cfg, "start": t, "end": t + dur, "dur": dur})
        t += dur
    for p in cfg["players"]:
        d = p["dur"]
        segs.append({"type": "player", "cfg": cfg, "player": p, "start": t, "end": t + d, "dur": d})
        t += d
    segs.append({"type": "team_outro", "cfg": cfg, "start": t, "end": t + 2.4, "dur": 2.4})
    return segs


def make_vs_timeline():
    segs = []
    t = 0.0
    segs.append({"type": "vs_intro", "start": t, "end": t + 2.2, "dur": 2.2})
    t += 2.2
    for i in range(6):
        d = 3.2
        segs.append({"type": "vs_pair", "pA": TEAM_A_CFG["players"][i], "pB": TEAM_B_CFG["players"][i], "start": t, "end": t + d, "dur": d})
        t += d
    return segs


def encode_timeline(segs, out_path):
    total_dur = segs[-1]["end"]
    n_frames = int(round(total_dur * FPS))
    print(f"Rendering {os.path.basename(out_path)} ({total_dur:.1f}s, {n_frames} frames) ...")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-stream_loop", "-1", "-i", BGM_PATH,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "ultrafast",
        "-c:a", "aac", "-b:a", "192k", "-t", f"{total_dur:.2f}",
        out_path
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(n_frames):
        t = f / FPS
        active = segs[-1]
        for s in segs:
            if s["start"] <= t <= s["end"]:
                active = s
                break
        im = render_segment_frame(active, t - active["start"], t)
        proc.stdin.write(im.tobytes())
    proc.stdin.close()
    proc.wait()
    assert proc.returncode == 0
    print(f"  -> Saved {out_path} ({os.path.getsize(out_path) // 1024} KB)")


if __name__ == "__main__":
    tl_a = make_team_timeline(TEAM_A_CFG)
    tl_b = make_team_timeline(TEAM_B_CFG)
    tl_vs = make_vs_timeline()

    p_a = os.path.join(OUT_DIR, "sikat_team_a_intro.mp4")
    p_b = os.path.join(OUT_DIR, "sikat_team_b_intro.mp4")
    p_vs = os.path.join(OUT_DIR, "sikat_vs_intro.mp4")
    p_all = os.path.join(OUT_DIR, "sikat_all_combined_intro.mp4")

    encode_timeline(tl_a, p_a)
    # Keep sikat_players_intro.mp4 updated as well
    shutil.copyfile(p_a, os.path.join(OUT_DIR, "sikat_players_intro.mp4"))
    encode_timeline(tl_b, p_b)
    encode_timeline(tl_vs, p_vs)

    # Concatenate all 3 into sikat_all_combined_intro.mp4 via FFmpeg
    concat_list = os.path.join(OUT_DIR, "concat_list.txt")
    with open(concat_list, "w", encoding="utf-8") as f:
        f.write(f"file '{p_a}'\nfile '{p_b}'\nfile '{p_vs}'\n")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
        "-i", concat_list, "-c", "copy", p_all
    ], check=True)
    os.remove(concat_list)
    print(f"  -> Saved {p_all} ({os.path.getsize(p_all) // 1024} KB)")
    print("All 4 videos rendered successfully!")
