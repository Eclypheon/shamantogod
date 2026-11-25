# 0004: Palette-matched isometric building and spell VFX sprites

- **Status**: Accepted
- **Date**: 2026-11-26

## Context

Inspection of `webdesignkit.zip` in Wayfinder ticket #2 showed 283 animated unit GIFs and 33 WAV audio files, but no sprites for Huts, Training Buildings, Guard Towers, or Spell VFX.

## Decision

Extract and pack unit sprites and WAV audio from `webdesignkit.zip` via a reproducible build script, and generate palette-matched isometric pixel sprites for Huts (Levels 1-3), Training Buildings, Guard Towers, and Spell VFX so every visual element shares a cohesive *Populous: The Beginning* palette.

## Consequences

- Complete visual coverage across units, buildings, terrain, and spells without external manual ripping.
- Consistent 1-bit pixel art aesthetic across both authentic Webdesignkit units and generated structures.
