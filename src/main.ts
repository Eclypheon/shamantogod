import Phaser from 'phaser';
import './style.css';
import { AncientAmbience } from './game/ambientAudio';
import { PlanetScene } from './game/PlanetScene';
import { applyOfflineProgress, loadGame, saveGame, stepSimulation } from './game/state';
import { HudController } from './ui/hud';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // ignore SW registration failure in dev
    });
  });
}

let state = loadGame();
const offline = applyOfflineProgress(state);
const ambience = new AncientAmbience();

const hudRoot = document.getElementById('hud')!;
let sceneRef: PlanetScene | null = null;

const hud = new HudController(
  hudRoot,
  state,
  (jx, jy) => sceneRef?.setJoystick(jx, jy),
  (freshState) => {
    state = freshState;
    sceneRef?.replaceState(freshState);
  },
  () => {
    ambience.start(state.muted);
    sceneRef?.triggerOpeningConvert();
  },
  (paused) => sceneRef?.setPaused(paused),
  (muted) => ambience.setMuted(muted)
);

if (offline.manaGained >= 1) {
  hud.showToast(`Offline progress: +${Math.floor(offline.manaGained)} Mana`);
}

sceneRef = new PlanetScene(
  state,
  () => hud.sync(),
  (msg) => hud.showToast(msg)
);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0d1321',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  pixelArt: true,
  scene: [sceneRef],
});

window.setInterval(() => {
  stepSimulation(state, 0.25);
}, 250);

window.setInterval(() => {
  saveGame(state);
}, 5000);
