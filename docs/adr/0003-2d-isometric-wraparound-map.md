# 0003: 2D isometric wraparound planet map

- **Status**: Accepted
- **Date**: 2026-11-25

## Context

*Populous: The Beginning* renders planets as 3D spherical globes, which adds heavy 3D camera, mesh deformation, and pathfinding complexity for a browser-based incremental PWA.

## Decision

Represent each planet as a 2D isometric wraparound terrain map. Players move the Shaman using WASD or a touch joystick and tap or click to cast spells within cast range (Planets 1 to 11) or anywhere on the planet (Planet 12 onward).

## Consequences

- Much simpler rendering, pathfinding, and mobile touch controls while preserving the classic isometric *Populous* look.
- Wraparound coordinates still give the feel of circling a small planet without 3D sphere distortion.
