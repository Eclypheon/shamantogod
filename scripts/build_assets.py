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

    # 4-dir subset (dirs 1, 3, 5, 7) for Brave, Warrior, Spy across 4 tribes
    for tribe in TRIBE_TARGETS:
        for d in [1, 3, 5, 7]:
            add_clip(f"RedBrave/BraWalk{d}.gif", f"brave_{tribe}_walk_d{d}", tribe)
            add_clip(f"RedBrave/BraWork{d}.gif", f"brave_{tribe}_work_d{d}", tribe)
            add_clip(f"RedWarrior/warrun{d}.gif", f"warrior_{tribe}_run_d{d}", tribe)
            add_clip(f"RedWarrior/warpunch{d}.gif", f"warrior_{tribe}_punch_d{d}", tribe)
            add_clip(f"BlueSpy/SpyRun{d}.gif", f"spy_{tribe}_run_d{d}", tribe, source_blue=True)

    # Single-direction Preachers, Fire Warriors, Wildmen
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
    """Generate palette-matched isometric pixel sprite for buildings."""
    w, h = 56, 56
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    tr, tg, tb = tribe_rgb
    wood_dark = (96, 64, 38, 255)
    wood_light = (145, 98, 56, 255)
    roof_base = (min(255, tr // 2 + 70), min(255, tg // 2 + 55), min(255, tb // 2 + 40), 255)
    roof_hi = (tr, tg, tb, 255)
    stone = (128, 132, 138, 255)
    stone_dark = (82, 86, 92, 255)

    if kind == "tower":
        d.polygon([(28, 42), (16, 36), (28, 30), (40, 36)], fill=stone_dark)
        d.rectangle([20, 16, 36, 36], fill=stone, outline=stone_dark)
        d.polygon([(28, 6), (16, 18), (40, 18)], fill=roof_hi, outline=wood_dark)
        return img

    if kind == "temple":
        d.polygon([(28, 48), (8, 38), (28, 28), (48, 38)], fill=stone_dark)
        d.polygon([(28, 44), (11, 35), (28, 26), (45, 35)], fill=stone)
        d.rectangle([16, 20, 40, 35], fill=stone, outline=stone_dark)
        d.polygon([(28, 7), (13, 22), (43, 22)], fill=roof_hi, outline=wood_dark)
        d.rectangle([26, 3, 30, 10], fill=(245, 220, 90, 255))
        return img

    if kind in ("warrior_hut", "firewarrior_hut"):
        d.polygon([(28, 48), (9, 39), (28, 30), (47, 39)], fill=wood_dark)
        d.rectangle([14, 24, 42, 39], fill=wood_light, outline=wood_dark)
        roof_c = roof_hi if kind == "warrior_hut" else (235, 115, 35, 255)
        d.polygon([(28, 10), (11, 26), (45, 26)], fill=roof_c, outline=wood_dark)
        banner_c = (230, 230, 240, 255) if kind == "warrior_hut" else (255, 210, 60, 255)
        d.rectangle([26, 15, 30, 23], fill=banner_c)
        return img

    # Hut Lv 1-3
    scale = 10 + level * 3
    d.polygon([(28, 48), (28 - scale - 4, 39), (28, 30), (28 + scale + 4, 39)], fill=wood_dark)
    d.rectangle([28 - scale, 39 - (10 + level * 2), 28 + scale, 41], fill=wood_light, outline=wood_dark)
    d.polygon([(28, 22 - level * 4), (28 - scale - 3, 39 - (10 + level * 2)), (28 + scale + 3, 39 - (10 + level * 2))], fill=roof_base, outline=wood_dark)
    d.polygon([(28, 22 - level * 4), (28 - 6, 30 - level * 2), (28 + 6, 30 - level * 2)], fill=roof_hi)
    d.rectangle([25, 33, 31, 41], fill=(35, 24, 18, 255))
    return img


def build_world_atlas():
    frames: dict[str, Image.Image] = {}
    for tribe, rgb in TRIBE_TARGETS.items():
        for lv in (1, 2, 3):
            frames[f"hut_{lv}_{tribe}"] = draw_iso_hut(rgb, lv, "hut")
        frames[f"temple_{tribe}"] = draw_iso_hut(rgb, 2, "temple")
        frames[f"warrior_hut_{tribe}"] = draw_iso_hut(rgb, 2, "warrior_hut")
        frames[f"firewarrior_hut_{tribe}"] = draw_iso_hut(rgb, 2, "firewarrior_hut")
        frames[f"guard_tower_{tribe}"] = draw_iso_hut(rgb, 2, "tower")

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

    pack_atlas(frames, ATLAS_DIR / "world.png", ATLAS_DIR / "world.json", max_width=512)


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
