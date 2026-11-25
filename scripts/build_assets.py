#!/usr/bin/env python3
"""Download Populous Webdesignkit and build Phaser 3 atlases + MP3 audio + isometric building/VFX sprites."""
import io
import json
import os
import subprocess
import urllib.request
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TMP_ZIP = Path("/tmp/webdesignkit.zip")
ZIP_URL = "https://www.popre.net/files/webdesignkit.zip"

ATLAS_DIR = ROOT / "public" / "assets" / "atlases"
AUDIO_DIR = ROOT / "public" / "assets" / "audio"
ATLAS_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

if not TMP_ZIP.exists():
    print(f"Downloading {ZIP_URL} ...")
    urllib.request.urlretrieve(ZIP_URL, TMP_ZIP)

TRIBE_TARGETS = {
    "blue": (40, 110, 230),
    "red": (215, 48, 42),
    "green": (46, 175, 72),
    "yellow": (225, 190, 40),
}


def recolor_cloth(img: Image.Image, target_rgb: tuple[int, int, int], source_is_blue: bool = False) -> Image.Image:
    """Shift red (or blue) tribe cloth pixels to target tribe color while preserving shading."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    tr, tg, tb = target_rgb
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if source_is_blue:
                is_cloth = b > 90 and b > r * 1.45 and b > g * 1.25
                lum = b / 220.0
            else:
                is_cloth = r > 90 and r > g * 1.45 and r > b * 1.45
                lum = r / 220.0
            if is_cloth:
                lum = max(0.35, min(1.25, lum))
                px[x, y] = (
                    min(255, int(tr * lum)),
                    min(255, int(tg * lum)),
                    min(255, int(tb * lum)),
                    a,
                )
    return rgba


def extract_gif_frames(zf: zipfile.ZipFile, member: str) -> list[Image.Image]:
    data = zf.read(member)
    im = Image.open(io.BytesIO(data))
    frames = []
    try:
        idx = 0
        while True:
            im.seek(idx)
            frames.append(im.convert("RGBA"))
            idx += 1
    except EOFError:
        pass
    return frames


def pack_atlas(frames_dict: dict[str, Image.Image], out_png: Path, out_json: Path, max_width: int = 1024):
    """Simple shelf-packer outputting Phaser 3 JSON Hash atlas."""
    items = sorted(frames_dict.items(), key=lambda kv: (-kv[1].height, kv[0]))
    x, y, row_h = 1, 1, 0
    placements = []
    for name, img in items:
        w, h = img.size
        if x + w + 1 > max_width:
            x = 1
            y += row_h + 1
            row_h = 0
        placements.append((name, img, x, y, w, h))
        x += w + 1
        row_h = max(row_h, h)
    total_h = max(64, y + row_h + 1)
    sheet = Image.new("RGBA", (max_width, total_h), (0, 0, 0, 0))
    json_frames = {}
    for name, img, px_x, px_y, w, h in placements:
        sheet.paste(img, (px_x, px_y))
        json_frames[name] = {
            "frame": {"x": px_x, "y": px_y, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
            "pivot": {"x": 0.5, "y": 1.0},
        }
    sheet.save(out_png, "PNG")
    out_json.write_text(json.dumps({"frames": json_frames, "meta": {"scale": "1"}}))
    print(f"Packed {len(json_frames)} frames into {out_png.name} ({max_width}x{total_h})")


def build_unit_atlas(zf: zipfile.ZipFile):
    names = set(zf.namelist())
    frames: dict[str, Image.Image] = {}

    def add_clip(member: str, prefix: str, tribe: str | None = None, source_blue: bool = False):
        if member not in names:
            return
        raw_frames = extract_gif_frames(zf, member)
        for i, fr in enumerate(raw_frames):
            img = recolor_cloth(fr, TRIBE_TARGETS[tribe], source_blue) if tribe else fr
            frames[f"{prefix}_{i:02d}"] = img

    # 8-dir Shaman (Walk, Stand, Cast, Fight) for all 4 tribes
    for tribe in TRIBE_TARGETS:
        for anim, file_stem in [("walk", "ShaWalk"), ("stand", "ShaStand"), ("cast", "ShaCast"), ("fight", "ShaFight")]:
            for d in range(1, 9):
                add_clip(f"Red Shaman/{file_stem}{d}.gif", f"shaman_{tribe}_{anim}_d{d}", tribe)

    # 8-dir Braves for player (blue) + 4-dir for rival tribes: BraRun, BraWork, BraPunch, BraPray
    for tribe in TRIBE_TARGETS:
        dirs = range(1, 9) if tribe == "blue" else [1, 3, 5, 7]
        for d in dirs:
            add_clip(f"RedBrave/BraRun{d}.gif", f"brave_{tribe}_run_d{d}", tribe)
            add_clip(f"RedBrave/BraWork{d}.gif", f"brave_{tribe}_work_d{d}", tribe)
            add_clip(f"RedBrave/BraPunch{d}.gif", f"brave_{tribe}_punch_d{d}", tribe)
            add_clip(f"RedBrave/BraPray{d}.gif", f"brave_{tribe}_pray_d{d}", tribe)
            add_clip(f"RedWarrior/warrun{d}.gif", f"warrior_{tribe}_run_d{d}", tribe)
            add_clip(f"RedWarrior/warpunch{d}.gif", f"warrior_{tribe}_punch_d{d}", tribe)
        for d in [1, 3, 5, 7]:
            add_clip(f"BlueSpy/SpyRun{d}.gif", f"spy_{tribe}_run_d{d}", tribe, source_blue=True)

    # Single-direction Preachers, Fire Warriors, Wildmen, Warrior standing idle
    for tribe in TRIBE_TARGETS:
        add_clip("Warriors/RedWarriorPray.gif", f"warrior_{tribe}_idle", tribe)

    add_clip("Preachers/BluePray.gif", "preacher_blue_pray")
    add_clip("Preachers/RedArmUp.gif", "preacher_red_pray")
    add_clip("Preachers/GreenArmsBook.gif", "preacher_green_pray")
    add_clip("Preachers/YellowPray.gif", "preacher_yellow_pray")

    add_clip("Fire warriors/BlueFistFire.gif", "firewarrior_blue_fire")
    add_clip("Fire warriors/RedFireFly.gif", "firewarrior_red_fire")
    add_clip("Fire warriors/YellFirePunchSide.gif", "firewarrior_yellow_fire")
    add_clip("Fire warriors/BlueFistFire.gif", "firewarrior_green_fire", "green", source_blue=True)

    add_clip("Wildmen/WildRunSide.gif", "wildman_run")
    add_clip("Wildmen/WildEat.gif", "wildman_eat")

    pack_atlas(frames, ATLAS_DIR / "units.png", ATLAS_DIR / "units.json", max_width=1024)


def draw_iso_hut(tribe_rgb: tuple[int, int, int], level: int, kind: str = "hut") -> Image.Image:
    """Generate Populous-authentic isometric huts (fenced yard, cream plaster, tribe mural, brown shingle roof, turret)."""
    w, h = 72, 72
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    tr, tg, tb = tribe_rgb
    fence = (92, 68, 44, 255)
    fence_hi = (128, 96, 62, 255)
    plaster = (186, 179, 154, 255)
    plaster_sh = (138, 130, 108, 255)
    thatch = (128, 92, 58, 255)
    thatch_dark = (84, 58, 34, 255)
    thatch_hi = (162, 122, 80, 255)
    mural = (tr, tg, tb, 235)
    door = (24, 18, 14, 255)
    stone = (126, 130, 134, 255)
    stone_dark = (78, 82, 88, 255)

    if kind == "plan":
        # Staked wooden blueprint yard for hut construction
        d.polygon([(36, 64), (10, 51), (36, 38), (62, 51)], fill=(120, 96, 62, 75), outline=(215, 185, 110, 210))
        for px, py in [(14, 51), (36, 40), (58, 51), (36, 62), (24, 45), (48, 45), (24, 57), (48, 57)]:
            d.line([(px, py), (px, py - 6)], fill=fence_hi, width=2)
        return img

    if kind == "frame":
        d.polygon([(36, 64), (10, 51), (36, 38), (62, 51)], fill=(116, 90, 56, 110), outline=fence)
        d.rectangle([22, 34, 50, 54], outline=fence_hi, width=2)
        d.line([(22, 34), (36, 22), (50, 34)], fill=thatch_hi, width=2)
        d.line([(36, 22), (36, 54)], fill=fence, width=2)
        return img

    if kind == "tower":
        # Populous Guard Tower: tall slender painted stalk flaring into wide observation pod & conical roof
        d.ellipse([26, 60, 46, 68], fill=(30, 22, 14, 130))
        d.polygon([(31, 64), (33, 34), (39, 34), (41, 64)], fill=plaster, outline=plaster_sh)
        d.rectangle([33, 40, 39, 58], fill=mural)
        d.rectangle([31, 56, 35, 64], fill=door)
        # Wide lookout pod
        d.ellipse([20, 22, 52, 37], fill=plaster, outline=plaster_sh)
        d.ellipse([24, 26, 34, 33], fill=mural, outline=door)
        d.ellipse([38, 26, 48, 33], fill=mural, outline=door)
        # Wide conical woven roof + tribe cap + smoke
        d.polygon([(36, 9), (16, 26), (56, 26)], fill=thatch, outline=thatch_dark)
        d.polygon([(36, 9), (30, 15), (42, 15)], fill=mural)
        d.ellipse([34, 2, 38, 8], fill=(235, 235, 230, 160))
        return img

    if kind == "temple":
        # Populous Temple: wide circular domed roof with tribe crown, open struts, brazier fire, entry tunnel
        d.ellipse([8, 42, 64, 66], fill=(42, 30, 18, 130))
        d.ellipse([12, 34, 60, 62], fill=plaster, outline=plaster_sh)
        # Circular tribe mural + glowing fire brazier inside open gallery
        d.ellipse([24, 42, 38, 56], fill=mural, outline=plaster_sh)
        d.ellipse([43, 40, 55, 52], fill=(40, 26, 14, 255))
        d.polygon([(49, 36), (45, 48), (53, 48)], fill=(255, 160, 30, 255))
        d.polygon([(49, 40), (47, 48), (51, 48)], fill=(255, 235, 120, 255))
        # Protruding entry tunnel on bottom-left
        d.polygon([(12, 52), (24, 46), (28, 58), (16, 64)], fill=plaster_sh, outline=thatch_dark)
        d.rectangle([15, 55, 21, 63], fill=door)
        # Massive domed woven roof + tribe crown cap
        d.ellipse([9, 14, 63, 40], fill=thatch, outline=thatch_dark)
        d.ellipse([16, 17, 56, 34], fill=thatch_hi)
        d.ellipse([27, 15, 45, 25], fill=mural, outline=thatch_dark)
        return img

    if kind == "warrior_hut":
        # Populous Warrior Training Hut: U-shaped fortress yard, shields on fence, tall right turret
        d.polygon([(36, 66), (6, 51), (36, 36), (66, 51)], fill=(78, 58, 36, 130), outline=fence)
        # Left curved wall + tribe banner + round wooden shields on front palisade
        d.rectangle([10, 38, 38, 55], fill=plaster, outline=plaster_sh)
        d.polygon([(8, 38), (22, 28), (42, 38)], fill=thatch, outline=thatch_dark)
        d.rectangle([12, 42, 20, 54], fill=mural)
        d.ellipse([22, 48, 28, 56], fill=(150, 42, 28, 255), outline=fence_hi)
        d.ellipse([30, 52, 36, 60], fill=(150, 42, 28, 255), outline=fence_hi)
        d.rectangle([24, 38, 31, 49], fill=door)
        # Tall conical turret on right with tribe spire tip
        d.rectangle([42, 24, 58, 54], fill=plaster, outline=plaster_sh)
        d.ellipse([46, 30, 52, 38], fill=door)
        d.polygon([(50, 8), (38, 26), (62, 26)], fill=thatch, outline=thatch_dark)
        d.polygon([(50, 8), (46, 14), (54, 14)], fill=mural)
        return img

    if kind == "firewarrior_hut":
        # Populous Fire Warrior Hut: central canopy shrine, two blazing brazier pillars, twin corner turrets
        d.polygon([(36, 66), (6, 51), (36, 36), (66, 51)], fill=(60, 44, 30, 130), outline=fence)
        # Twin side mini-turrets
        for tx in (14, 58):
            d.rectangle([tx - 5, 38, tx + 5, 54], fill=plaster, outline=plaster_sh)
            d.polygon([(tx, 28), (tx - 8, 39), (tx + 8, 39)], fill=thatch, outline=thatch_dark)
        # Central tall shrine + flat-angled canopy + tribe emblem
        d.rectangle([25, 22, 47, 50], fill=plaster, outline=plaster_sh)
        d.rectangle([29, 25, 43, 39], fill=mural)
        d.rectangle([32, 40, 40, 50], fill=door)
        d.polygon([(36, 12), (20, 22), (52, 22)], fill=thatch_hi, outline=thatch_dark)
        # Two blazing fire braziers flanking entrance
        for bx in (24, 48):
            d.rectangle([bx - 3, 46, bx + 3, 60], fill=fence, outline=thatch_dark)
            d.polygon([(bx, 34), (bx - 5, 46), (bx + 5, 46)], fill=(255, 130, 20, 255))
            d.polygon([(bx, 38), (bx - 3, 46), (bx + 3, 46)], fill=(255, 235, 110, 255))
        return img

    # Populous Hut Lv 1-3: fenced yard + cream plaster body + tribe mural + brown shingle roof
    d.polygon([(36, 66), (8, 52), (36, 38), (64, 52)], fill=(96, 74, 48, 130), outline=fence)
    # Fence pickets along front edges
    for t in range(6):
        fx1 = 10 + t * 5
        fy1 = 52 + int(t * 2.4)
        fx2 = 62 - t * 5
        fy2 = 52 + int(t * 2.4)
        d.line([(fx1, fy1), (fx1, fy1 - 6)], fill=fence_hi, width=2)
        d.line([(fx2, fy2), (fx2, fy2 - 6)], fill=fence_hi, width=2)

    # Main plaster cylinder body
    bw = 14 + level * 3
    bh = 16 + level * 2
    base_y = 54
    d.rectangle([36 - bw, base_y - bh, 36 + bw, base_y], fill=plaster, outline=plaster_sh)
    # Shading on right side
    d.rectangle([36 + bw - 5, base_y - bh, 36 + bw, base_y], fill=plaster_sh)
    # Tribe mural painted on wall
    d.rectangle([36 + 3, base_y - bh + 3, 36 + bw - 3, base_y - 2], fill=mural)
    # Dark arched doorway
    d.rectangle([33, base_y - 11, 39, base_y], fill=door)
    # Round dark window on left wall
    d.ellipse([36 - bw + 4, base_y - bh + 4, 36 - bw + 10, base_y - bh + 10], fill=door)

    # Layered curved brown thatch/shingle roof
    roof_y = base_y - bh
    d.polygon([(36, roof_y - 12 - level), (36 - bw - 5, roof_y + 2), (36 + bw + 5, roof_y + 2)], fill=thatch, outline=thatch_dark)
    d.polygon([(36, roof_y - 12 - level), (36 - bw // 2, roof_y - 2), (36 + bw // 2, roof_y - 2)], fill=thatch_hi)

    # Level 2 & 3 conical turret tower on left + tribe chimney cap
    if level >= 2:
        tx = 36 - bw + 7
        d.rectangle([tx - 6, roof_y - 15, tx + 6, roof_y], fill=plaster, outline=plaster_sh)
        d.ellipse([tx - 2, roof_y - 12, tx + 2, roof_y - 6], fill=door)
        d.polygon([(tx, roof_y - 24), (tx - 9, roof_y - 13), (tx + 9, roof_y - 13)], fill=thatch, outline=thatch_dark)
    if level >= 3:
        # Chimney with tribe collar & smoke wisp
        d.rectangle([42, roof_y - 14, 48, roof_y - 6], fill=mural, outline=thatch_dark)
        d.ellipse([43, roof_y - 22, 48, roof_y - 15], fill=(235, 235, 230, 140))
    return img


def draw_populous_tree(stump: bool = False) -> Image.Image:
    w, h = 48, 56
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    trunk = (78, 50, 28, 255)
    trunk_hi = (108, 72, 42, 255)
    if stump:
        d.ellipse([16, 44, 32, 52], fill=(64, 44, 24, 180))
        d.rectangle([20, 42, 28, 49], fill=trunk, outline=trunk_hi)
        return img
    # Shadow + gnarled trunk
    d.ellipse([12, 44, 36, 53], fill=(20, 26, 16, 110))
    d.polygon([(20, 49), (22, 32), (27, 32), (29, 49)], fill=trunk)
    d.line([(23, 47), (24, 33)], fill=trunk_hi, width=2)
    # Angular Populous olive-moss canopy
    d.polygon([(8, 33), (12, 16), (24, 10), (37, 15), (41, 32), (32, 37), (15, 37)], fill=(96, 116, 36, 255), outline=(54, 68, 22, 255))
    d.polygon([(14, 26), (18, 14), (31, 14), (35, 25), (25, 29)], fill=(122, 142, 46, 255))
    for lx, ly in [(15, 22), (24, 18), (32, 24), (20, 30), (29, 31)]:
        d.ellipse([lx - 3, ly - 2, lx + 3, ly + 2], fill=(74, 92, 28, 255))
    return img


def colorize_neutral_banners(img: Image.Image, target_rgb: tuple[int, int, int]) -> Image.Image:
    """Tint neutral grey/white cloth banners on custom building PNGs to tribe color while keeping wood/thatch/fire untouched."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    tr, tg, tb = target_rgb
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            hi = max(r, g, b)
            lo = min(r, g, b)
            sat = hi - lo
            lum = (r + g + b) / 3.0
            # Target neutral light-grey/white cloth banners & pennants (skip warm brown wood/yellow thatch/orange fire)
            if sat < 26 and lum > 95 and lum < 245:
                scale = lum / 205.0
                px[x, y] = (
                    min(255, int(tr * scale)),
                    min(255, int(tg * scale)),
                    min(255, int(tb * scale)),
                    a,
                )
    return rgba


def load_custom_building(filename: str, size: tuple[int, int], tribe_rgb: tuple[int, int, int]) -> Image.Image:
    src_path = ROOT / "assets_src" / "buildings" / filename
    im = Image.open(src_path).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail(size, Image.LANCZOS)
    tinted = colorize_neutral_banners(im, tribe_rgb)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.paste(tinted, ((size[0] - tinted.width) // 2, size[1] - tinted.height), tinted)
    return canvas


def build_world_atlas():
    frames: dict[str, Image.Image] = {}
    for tribe, rgb in TRIBE_TARGETS.items():
        hut_img = load_custom_building("hut.png", (88, 88), rgb)
        for lv in (1, 2, 3):
            frames[f"hut_{lv}_{tribe}"] = hut_img
        frames[f"hut_plan_{tribe}"] = draw_iso_hut(rgb, 1, "plan")
        frames[f"hut_frame_{tribe}"] = draw_iso_hut(rgb, 1, "frame")
        frames[f"temple_{tribe}"] = load_custom_building("temple.png", (102, 102), rgb)
        frames[f"warrior_hut_{tribe}"] = load_custom_building("warrior hut.png", (102, 102), rgb)
        frames[f"firewarrior_hut_{tribe}"] = load_custom_building("firewarrior hut.png", (102, 102), rgb)
        frames[f"guard_tower_{tribe}"] = load_custom_building("guardhouse.png", (86, 106), rgb)

    frames["tree_full"] = draw_populous_tree(stump=False)
    frames["tree_stump"] = draw_populous_tree(stump=True)

    # Stone Head monument
    sh = Image.new("RGBA", (40, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    d.rectangle([10, 10, 30, 44], fill=(115, 120, 125, 255), outline=(65, 68, 72, 255))
    d.rectangle([14, 18, 18, 22], fill=(90, 220, 255, 255))
    d.rectangle([22, 18, 26, 22], fill=(90, 220, 255, 255))
    d.rectangle([16, 30, 24, 34], fill=(65, 68, 72, 255))
    frames["stone_head"] = sh

    # Spell VFX icons/particles
    vfx_colors = {
        "vfx_convert": (90, 220, 255, 220),
        "vfx_blast": (255, 165, 45, 230),
        "vfx_lightning": (210, 240, 255, 245),
        "vfx_swarm": (160, 220, 60, 220),
        "vfx_tornado": (195, 210, 225, 210),
        "vfx_volcano": (255, 75, 25, 240),
        "vfx_fireball": (255, 120, 30, 245),
        "vfx_angel": (255, 240, 140, 240),
    }
    for name, col in vfx_colors.items():
        v = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        dv = ImageDraw.Draw(v)
        dv.ellipse([3, 3, 28, 28], fill=col, outline=(255, 255, 255, 220))
        dv.ellipse([10, 10, 22, 22], fill=(255, 255, 255, 200))
        frames[name] = v

    pack_atlas(frames, ATLAS_DIR / "world.png", ATLAS_DIR / "world.json", max_width=1024)


def build_audio(zf: zipfile.ZipFile):
    wav_map = {
        "Conv_bg.wav": "convert.mp3",
        "blast.wav": "blast.mp3",
        "Lghtng.wav": "lightning.mp3",
        "swarm.wav": "swarm.mp3",
        "Swamp01.wav": "swamp.mp3",
        "volbrst1.wav": "volcano.mp3",
        "angel.wav": "angel.mp3",
        "Bldg_fire.wav": "fire.mp3",
        "birth.wav": "birth.mp3",
        "Attk01_a.wav": "attack.mp3",
        "punch2.wav": "punch.mp3",
        "sham_rtn.wav": "shaman_return.mp3",
        "amb4002.wav": "ambience.mp3",
        "discopop_stereo.wav": "disco.mp3",
    }
    tmp_wav = Path("/tmp/pop_tmp.wav")
    for wav_name, mp3_name in wav_map.items():
        if wav_name not in zf.namelist():
            continue
        tmp_wav.write_bytes(zf.read(wav_name))
        out_mp3 = AUDIO_DIR / mp3_name
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp_wav), "-b:a", "96k", str(out_mp3)],
            check=True,
        )
    if tmp_wav.exists():
        tmp_wav.unlink()
    print(f"Transcoded {len(wav_map)} audio clips to {AUDIO_DIR}")


if __name__ == "__main__":
    with zipfile.ZipFile(TMP_ZIP, "r") as zf:
        build_unit_atlas(zf)
        build_audio(zf)
    build_world_atlas()
