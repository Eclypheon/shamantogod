# 0002: Populous Webdesignkit sprite and audio pipeline

- **Status**: Accepted
- **Date**: 2026-11-25

## Context

The game needs authentic *Populous: The Beginning* sprites (Shaman, Braves, Preachers, Warriors, Fire Warriors, Huts, training buildings, spells) and sound effects.

## Decision

Extract and convert sprites and audio files from the *Populous: The Beginning* Webdesignkit hosted at `https://ts.popre.net/websites/popms.net/en/downloads/multimedia/viewcategory/4-multimedia4a74.html?limitstart=0&order=&dir=desc` into web-ready sprite atlases and compressed audio assets stored in the repository.

## Consequences

- Authentic *Populous: The Beginning* visual and audio feel without manual pixel art creation.
- Requires a reproducible extraction/conversion step (research and build script) to turn the Webdesignkit archives into Phaser-compatible sprite sheets and web audio formats.
