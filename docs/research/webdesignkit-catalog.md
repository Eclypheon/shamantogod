# Populous: The Beginning Webdesignkit & Multimedia Catalog

Research catalog for issue #2. Inspects the Populous multimedia archives referenced on `ts.popre.net` and `popre.net`, catalogs all available sprites and audio files, and recommends a Phaser 3 asset pipeline.

## 1. Archive Sources and Availability

| Archive | Listed Size | Mirror / URL | Status | Notes |
| --- | --- | --- | --- | --- |
| **Web-Design Kit (`webdesignkit.zip`)** | 2.53 MB | `https://www.popre.net/files/webdesignkit.zip` (via `https://www.popre.net/downloads.php?f=15`) | **Complete & Valid** | 318 files total (283 `.gif`, 33 `.wav`, 2 `.bmp`). Passes `unzip -t`. |
| **Web-Design Kit (`ts.popre.net` mirror)** | 2.53 MB | `https://ts.popre.net/websites/popms.net/downloads/Multimedia/webdesignkit.html` | **Truncated (210 KB)** | HTTrack mirror truncated at 215,352 bytes (141 of 318 files recoverable). Use `popre.net/files/webdesignkit.zip` instead. |
| **Populous Theme (`poptheme.html`)** | 3.14 MB | `https://ts.popre.net/websites/popms.net/downloads/Multimedia/poptheme.html` | **Truncated (209 KB)** | HTTrack mirror truncated at 214,130 bytes. Contains `logos.sys.bmp`, `logow.sys.bmp`, and 7 complete + 1 truncated `Mas*.ttf` Bullfrog fonts. Not on `popre.net/files/` (404). |
| **Populous Soundtrack (`pop_soundtrack.html`)** | 21.03 MB | `https://ts.popre.net/websites/popms.net/downloads/Multimedia/pop_soundtrack.html` | **404 Not Found** | Composer Mark Knight. Missing from both `ts.popre.net` and `popre.net/files/`. |

Category listing page inspected:
`https://ts.popre.net/websites/popms.net/en/downloads/multimedia/viewcategory/4-multimedia4a74.html?limitstart=0&order=&dir=desc`

---

## 2. Sprite Inventory (`webdesignkit.zip`)

All unit sprites are **indexed-color (`P` mode) animated GIFs** with **1-bit transparency** and **100 ms frame duration (10 fps)**, unless noted otherwise.

Files numbered `1` through `8` (e.g., `ShaWalk1.gif`..`ShaWalk8.gif`) represent **8 isometric/compass directions**.

### Coverage Matrix

| Category | 8-Directional Set | Single-Direction Samples | Frame Dimensions | Frames per Clip |
| --- | --- | --- | --- | --- |
| **Shaman** | `Red Shaman/` (40 GIFs, 5 anims x 8 dirs) | `Shamen/` (28 anims across 4 tribes + 1 static banner) | 28x40 to 50x56 (banner 544x60) | 4-14 (banner: 1) |
| **Braves** | `RedBrave/` (79 GIFs, 10 anims x 8 dirs, 7/8 for Kick) | `Braves/` (8 GIFs across 4 tribes) | 28x36 to 46x38 | 4-12 |
| **Preachers** | None | `Preachers/` (7 GIFs across 4 tribes) | 32x38 to 46x38 | 4-18 |
| **Warriors** | `RedWarrior/` (32 GIFs, 4 anims x 8 dirs) | `Warriors/` (7 GIFs across 4 tribes) | 28x40 to 46x38 | 4-9 |
| **Fire Warriors** | None | `Fire warriors/` (6 GIFs across Blue/Red/Yellow) | 34x32 to 46x38 | 4-6 |
| **Spies** (bonus) | `BlueSpy/` (64 GIFs, 8 anims x 8 dirs) | `Spies/` (8 GIFs across 4 tribes) | 28x36 to 46x38 | 4-17 |
| **Wildmen** (bonus) | None | `Wildmen/` (3 GIFs) | 28x28 to 30x40 | 3-4 |
| **Huts** | None | None | - | - |
| **Training Buildings** | None | None | - | - |
| **Spells (Visual VFX)** | None | None | - | - |

### Detailed Unit Breakdown

#### Shaman (`Red Shaman/` and `Shamen/`)
- `Red Shaman/` (40 GIFs, 8 directions each):
  - `ShaCast1..8.gif`: 14 frames, 28x52 to 50x56
  - `ShaFight1..8.gif`: 4 frames, 38x42 to 48x42
  - `ShaKick1..8.gif`: 5 frames, 28x44 to 34x42
  - `ShaStand1..8.gif`: 5 frames, 28x40 to 34x40
  - `ShaWalk1..8.gif`: 8 frames, 28x40 to 34x40
- `Shamen/` (29 GIFs):
  - 7 animations (`Cast` 13-14f, `Fight` 4f, `Fly` 4f, `Kick` 5f, `Roll` 4f, `Stand` 5f, `Walk` 8f) in 4 tribe colors (`Blue`, `Gree`, `Red`, `Yell`).
  - `ShaWand.gif`: 544x60, 1 frame, no transparency (UI/web banner graphic).

#### Braves (`RedBrave/` and `Braves/`)
- `RedBrave/` (79 GIFs, 8 directions each except `BraKick` with 7):
  - `BraFall1..8.gif`: 7-8 frames, 36x40 to 42x42
  - `BraFlinch1..8.gif` (includes `BraFinch2.gif`, `Braflinch7..8.gif`): 7 frames, 30x38 to 34x38
  - `BraJump1..8.gif`: 4 frames, 30x44 to 40x44
  - `BraKick1..8.gif` (7 files): 5-7 frames, 34x42 to 40x42
  - `BraPray1..8.gif`: 6 frames, 34x34 to 36x34
  - `BraPunch1..8.gif`: 5-7 frames, 36x40 to 46x38
  - `BraRun1..8.gif`: 4 frames, 28x40 to 34x40
  - `BraScratch1..8.gif`: 12 frames, 28x36 to 30x36
  - `BraSit1..8.gif`: 6 frames, 28x38 to 32x38
  - `BraWork1..8.gif`: 4 frames, 30x38 to 34x38
- `Braves/` (8 GIFs, single direction):
  - `BlueBraveJumping.gif` (40x42, 4f), `BluePickBum.gif` (30x36, 11f), `GreeBraveWorkingSide.gif` (34x38, 4f), `GreenPray.gif` (36x34, 6f), `RedBraveJump.gif` (40x42, 4f), `RedBravePray.gif` (36x34, 6f), `YellBraveWood.gif` (30x38, 4f), `YellBraveflinch.gif` (32x38, 7f).

#### Preachers (`Preachers/`)
- 7 GIFs (single direction only):
  - `BlueArmUp.gif` (32x40, 10f), `BluePray.gif` (34x34, 6f), `GreenArmsBook.gif` (40x40, 18f), `RedArmUp.gif` (32x38, 10f), `RedPrePunch.gif` (46x38, 5f), `YellPreFly.gif` (40x30, 4f), `YellowPray.gif` (34x34, 6f).

#### Warriors (`RedWarrior/` and `Warriors/`)
- `RedWarrior/` (32 GIFs, 8 directions each):
  - `warflinch1..8.gif`: 5-7 frames, 30x38 to 34x38
  - `warkick1..8.gif`: 6 frames, 34x42 to 40x42
  - `warpunch1..8.gif`: 6 frames, 36x40 to 46x38
  - `warrun1..8.gif`: 4-5 frames, 28x40 to 34x40
- `Warriors/` (7 GIFs, single direction):
  - `BlueWarriorPunch.gif` (42x40, 5f), `BlueWarriorRoll.gif` (36x34, 4f), `GreeWarriorCheer.gif` (30x40, 9f), `GreeWarriorMad.gif` (30x40, 4f), `RedWarriorPray.gif` (34x34, 6f), `RedWarriorPush.gif` (36x38, 7f), `YellSit Warr.gif` (30x38, 6f).

#### Fire Warriors (`Fire warriors/`)
- 6 GIFs (single direction only):
  - `BlueFireJumpingFront.gif` (40x42, 4f), `BlueFistFire.gif` (34x32, 5f), `BluePray.gif` (36x34, 6f), `RedFireFly.gif` (40x30, 4f), `YellFirePunchSide.gif` (46x38, 5f), `YellowPray.gif` (34x36, 6f).

#### Spies and Wildmen (`BlueSpy/`, `Spies/`, `Wildmen/`)
- `BlueSpy/` (64 GIFs, 8 directions each): `SpyFlinch` (5f), `SpyJuggle` (17f), `SpyKick` (5f), `SpyLit` (10-12f), `SpyPray` (5-6f), `SpyPunch` (5-7f), `SpyRun` (4f), `SpyWork` (4-6f).
- `Spies/` (8 GIFs): `BlueJuggle` (15f), `BreeJuggle` (17f), `BlueSpySetFire` (10f), `GreeSetFire`/`RedSetFire`/`YellSetFire` (11f), `Spie Fly` (4f), `SpyRunMad` (4f).
- `Wildmen/` (3 GIFs): `WildDrink.gif` (28x28, 3f), `WildEat.gif` (30x40, 3f), `WildRunSide.gif` (30x36, 4f).

#### Static Bitmaps (Root)
- `PopButton.bmp`: 640x480, indexed `P`, 308,278 bytes.
- `PopLogo.BMP`: 350x128, `RGB`, 134,712 bytes.

---

## 3. Audio Inventory (`webdesignkit.zip`)

33 `.wav` files in the archive root. All are **22050 Hz, 16-bit PCM, mono (1 channel)** except `discopop_stereo.wav` (**22050 Hz, 16-bit, stereo**).

| Group | Files | Duration Range |
| --- | --- | --- |
| **Spells & Disasters** | `Lghtng.wav` (2.01s), `Swamp01.wav` (1.22s), `Sv_blast.wav` (1.16s), `Sv_bolt.wav` (1.20s), `blast.wav` (0.77s), `swarm.wav` (2.17s), `volbrst1.wav` (1.09s), `angel.wav` (2.17s), `sitespel.wav` (2.61s), `Conv_bg.wav` (3.08s), `Bldg_fire.wav` (3.36s) | 0.77s - 3.36s |
| **Combat & Events** | `Attk01_a.wav` (1.41s), `fgtalarm.wav` (2.00s), `charge01.wav` (2.72s), `birth.wav` (0.94s), `boatrid.wav` (0.50s), `punch2.wav` (0.28s), `sham_rtn.wav` (2.29s) | 0.28s - 2.72s |
| **Voices & Reactions** | `v_bow001.wav`..`v_bow007.wav` (7 clips, 0.21-0.31s), `v_intoair01.wav` (0.83s), `v_onfire01.wav` (1.72s), `v_pre_pre001.wav` (0.87s), `Sv_die.wav` (1.29s), `Sv_scrm01.wav` (1.21s), `oh004.wav` (0.51s) | 0.21s - 1.72s |
| **Ambience / Music** | `amb4002.wav` (1.96s), `discopop_stereo.wav` (6.39s, stereo) | 1.96s - 6.39s |

---

## 4. Recommended Phaser 3 Asset Pipeline

### Sprite Atlases
1. **Extract GIF frames to RGBA PNGs**: Use Python (`Pillow`) or ImageMagick (`magick convert -coalesce`) to split each animated GIF into numbered PNG frames.
2. **Normalize pivots for variable bounding boxes**: Frame dimensions vary across animations and directions (e.g., Shaman ranges from `28x40` to `50x56`). Pack with `free-tex-packer-cli` (or TexturePacker) using Phaser 3 JSON Hash format (`trim: true`) and set a bottom-center pivot (`origin: { x: 0.5, y: 1.0 }`) so units stay grounded on isometric terrain tiles.
3. **Group atlases by unit**: Build one atlas per unit (`shaman.png` + `shaman.json`, `brave.png` + `brave.json`, `warrior.png` + `warrior.json`, `spy.png` + `spy.json`) with frame keys formatted as `<anim>_dir<1..8>_<frame>` (e.g., `walk_dir1_00`). Keep `10 fps` (`frameRate: 10`) to match the 100 ms GIF timing.
4. **Tribe recoloring**: Only Red (Shaman, Brave, Warrior) and Blue (Spy) have full 8-directional sets. Either sample the tribe-cloth palette from `Shamen/`/`Braves/`/`Warriors/` to pre-bake Blue/Red/Yellow/Green atlases at build time, or use a lightweight Phaser 3 WebGL palette-swap pipeline.
5. **Address missing assets**: Huts, Training buildings, Spell VFX, and 8-directional Preachers/Fire Warriors are not in `webdesignkit.zip`. Source them from original game data or create matching ~32-56 px isometric sprites in a separate asset ticket.

### Web Audio
1. **Transcode WAVs for web**: Convert the 22050 Hz WAVs with `ffmpeg` to **Opus/WebM** (primary, ~64-96 kbps) and **AAC/M4A** (Safari/iOS fallback), passing both URLs to `this.load.audio(key, [oggOrWebm, m4a])`.
2. **Pack short SFX into an AudioSprite**: Bundle short clips (`v_bow001..007`, `punch2`, `oh004`, `blast`, etc.) into a single Phaser 3 AudioSprite (`sfx.json` + `sfx.webm`/`sfx.m4a`) via `audiosprite` to cut HTTP requests, keeping `amb4002` and `discopop_stereo` as standalone looping tracks.
