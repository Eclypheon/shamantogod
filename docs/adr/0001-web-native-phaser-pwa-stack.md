# 0001: Web-native TypeScript, Vite, Phaser 3, and PWA stack

- **Status**: Accepted
- **Date**: 2026-11-25

## Context

The game must publish to GitHub Pages, install as a PWA on desktop and iOS Safari home screens, load quickly, and display dense incremental telemetry alongside an interactive isometric planet map. Unity WebGL builds are large (often 20 to 50 MB or more) and slow to boot on mobile Safari PWAs.

## Decision

Build the game using TypeScript, Vite, and Phaser 3, packaged as a PWA with a service worker and an in-app cache-reset control (unregistering service workers, clearing CacheStorage, and reloading), deployed automatically to GitHub Pages via GitHub Actions.

## Consequences

- Fast initial load and small bundle size suitable for mobile PWAs.
- Native HTML/CSS overlay support for incremental telemetry, spell bars, and meta-progression menus alongside the Phaser 3 canvas.
- Requires building game systems in TypeScript rather than reusing Unity C# scripts.
