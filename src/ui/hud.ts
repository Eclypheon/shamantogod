import { META_UPGRADES, PLANETS, SPELLS, type MetaUpgradeConfig } from '../game/data';
import {
  BUILDING_FOLLOWER_REQS,
  buyMetaUpgrade,
  computeDominance,
  formAlliance,
  getMetaUpgradeCost,
  getPlanetConfig,
  getPlanetManaPerSec,
  getPopCap,
  getTotalManaPerSec,
  hasSavedGame,
  isCampaignWon,
  isMetaNodeUnlocked,
  isMetaNodeVisible,
  isSpellUnlocked,
  prestigeToPlanet,
  resetGame,
  saveGame,
  type GameState,
} from '../game/state';

export type DrawerTab = 'none' | 'tribe' | 'planets';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
const SPARK_POS = { x: 600, y: 400 };

export class HudController {
  private root: HTMLElement;
  private state: GameState;
  private activeTab: DrawerTab = 'none';
  private titleOpen = true;
  private pantheonOpen = false;
  private coachActive = false;
  private confirmRestart = false;
  private victoryDismissed = false;
  private selectedMetaId: MetaUpgradeConfig['id'] = 'startingMana';
  private panX = 0;
  private panY = 0;
  private zoom = 0.72;
  private toastTimer = 0;
  private onJoystick: (x: number, y: number) => void;
  private onResetState: (fresh: GameState) => void;
  private onBeginPlay: () => void;
  private onSetPaused: (paused: boolean) => void;
  private onMuteChanged: (muted: boolean) => void;
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private installDismissed = false;
  private lastSpellSignature = '';

  // Persistent HUD DOM references
  private elPlanetTitle!: HTMLElement;
  private elDomFill!: HTMLElement;
  private elDomVal!: HTMLElement;
  private elManaVal!: HTMLElement;
  private elManaRate!: HTMLElement;
  private elEssenceWrap!: HTMLElement;
  private elEssenceVal!: HTMLElement;
  private elPopVal!: HTMLElement;
  private elBuffs!: HTMLElement;
  private elAscendBtn!: HTMLButtonElement;
  private elTabBtns!: NodeListOf<HTMLButtonElement>;
  private elSpellInfo!: HTMLElement;
  private elSpellDock!: HTMLElement;
  private elDrawerBackdrop!: HTMLElement;
  private elDrawer!: HTMLElement;
  private elToast!: HTMLElement;
  private elInstallBanner!: HTMLElement;
  private elTitleScreen!: HTMLElement;
  private elPantheonModal!: HTMLElement;
  private elCoachBubble!: HTMLElement;
  private elCoachArrow!: HTMLElement;
  private activeCoachTarget: HTMLElement | null = null;

  constructor(
    root: HTMLElement,
    state: GameState,
    onJoystick: (x: number, y: number) => void,
    onResetState: (fresh: GameState) => void,
    onBeginPlay: () => void,
    onSetPaused: (paused: boolean) => void,
    onMuteChanged: (muted: boolean) => void
  ) {
    this.root = root;
    this.state = state;
    this.onJoystick = onJoystick;
    this.onResetState = onResetState;
    this.onBeginPlay = onBeginPlay;
    this.onSetPaused = onSetPaused;
    this.onMuteChanged = onMuteChanged;

    this.mountShell();

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e as BeforeInstallPromptEvent;
      this.syncInstallBanner();
      if (this.titleOpen) this.renderTitleScreen();
    });
    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      this.installDismissed = true;
      this.syncInstallBanner();
      if (this.titleOpen) this.renderTitleScreen();
    });

    this.renderTitleScreen();
    this.sync();
  }

  private isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    );
  }

  private isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  private mountShell(): void {
    this.root.innerHTML = `
      <header class="papyrus top-ribbon">
        <div class="ribbon-left">
          <span class="planet-title" id="hud-planet"></span>
          <div class="dom-track" title="Dominance"><div class="dom-fill" id="hud-dom-fill"></div></div>
          <span class="metric"><strong id="hud-dom">0%</strong></span>
          <span id="hud-buffs" style="display:flex;gap:3px;"></span>
        </div>
        <div class="ribbon-center">
          <span class="metric">Mana <strong id="hud-mana">0</strong><span class="sub" id="hud-rate">(+0/s)</span></span>
          <span class="sep">·</span>
          <span class="metric">Pop <strong id="hud-pop">0/0</strong></span>
          <span id="hud-essence-wrap" style="display:none;align-items:baseline;gap:4px;">
            <span class="sep">·</span>
            <span class="metric">Ess <strong id="hud-essence">0</strong></span>
          </span>
        </div>
        <div class="ribbon-right">
          <button class="btn" data-tab="tribe">Tribe</button>
          <button class="btn" data-tab="planets">Worlds</button>
          <button class="btn" id="hud-open-pantheon">Pantheon</button>
          <button class="btn ascend" id="hud-ascend" style="display:none;">Ascend</button>
          <button class="btn" id="hud-open-menu">Menu</button>
        </div>
      </header>

      <div class="papyrus toast" id="hud-toast"></div>
      <div class="papyrus install-banner" id="hud-install"></div>

      <div class="drawer-backdrop" id="hud-drawer-backdrop"></div>
      <aside class="papyrus scroll-drawer" id="hud-drawer"></aside>

      <div class="joystick-zone" id="hud-joystick">
        <div class="joystick-knob" id="hud-joystick-knob"></div>
      </div>

      <div class="papyrus spell-info" id="hud-spell-info"></div>
      <nav class="papyrus spell-dock" id="hud-spells"></nav>

      <section class="title-screen open" id="hud-title"></section>
      <section class="pantheon-modal" id="hud-pantheon"></section>
      <div class="papyrus coach-bubble" id="hud-coach-bubble"></div>
      <div class="coach-arrow" id="hud-coach-arrow"></div>

      <div class="landscape-overlay" id="hud-rotate">
        <div style="font-size:38px;">&#8635;</div>
        <strong style="font-family:var(--font-display);font-size:17px;letter-spacing:0.06em;">Rotate to Landscape</strong>
        <span style="font-size:14px;max-width:280px;opacity:0.85;">Shaman to God is crafted for wide-screen landscape play. Tilt your device to continue.</span>
      </div>
    `;

    this.elPlanetTitle = this.root.querySelector('#hud-planet')!;
    this.elDomFill = this.root.querySelector('#hud-dom-fill')!;
    this.elDomVal = this.root.querySelector('#hud-dom')!;
    this.elManaVal = this.root.querySelector('#hud-mana')!;
    this.elManaRate = this.root.querySelector('#hud-rate')!;
    this.elEssenceWrap = this.root.querySelector('#hud-essence-wrap')!;
    this.elEssenceVal = this.root.querySelector('#hud-essence')!;
    this.elPopVal = this.root.querySelector('#hud-pop')!;
    this.elBuffs = this.root.querySelector('#hud-buffs')!;
    this.elAscendBtn = this.root.querySelector('#hud-ascend')!;
    this.elTabBtns = this.root.querySelectorAll('[data-tab]');
    this.elSpellInfo = this.root.querySelector('#hud-spell-info')!;
    this.elSpellDock = this.root.querySelector('#hud-spells')!;
    this.elDrawerBackdrop = this.root.querySelector('#hud-drawer-backdrop')!;
    this.elDrawer = this.root.querySelector('#hud-drawer')!;

    this.elDrawerBackdrop.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.activeTab = 'none';
      this.syncTabs();
      this.syncCoach();
    });

    // Keyboard shortcuts 1-9 for instant spell switching on desktop
    window.addEventListener('keydown', (e) => {
      if (this.titleOpen || this.pantheonOpen) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx <= 8) {
        const unlocked = SPELLS.filter((s) => isSpellUnlocked(this.state, s));
        if (unlocked[idx]) {
          this.state.selectedSpellId = unlocked[idx].id;
          this.syncSpells();
          this.syncCoach();
        }
      }
    });
    this.elToast = this.root.querySelector('#hud-toast')!;
    this.elInstallBanner = this.root.querySelector('#hud-install')!;
    this.elTitleScreen = this.root.querySelector('#hud-title')!;
    this.elPantheonModal = this.root.querySelector('#hud-pantheon')!;
    this.elCoachBubble = this.root.querySelector('#hud-coach-bubble')!;
    this.elCoachArrow = this.root.querySelector('#hud-coach-arrow')!;

    // Prevent any HUD tap from leaking into Phaser canvas input
    for (const sel of ['.top-ribbon', '.scroll-drawer', '.spell-dock', '.title-screen', '.pantheon-modal']) {
      this.root.querySelector(sel)?.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    this.elTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tab as DrawerTab;
        this.activeTab = this.activeTab === t ? 'none' : t;
        this.renderDrawer();
        this.syncTabs();
        this.syncCoach();
      });
    });

    this.root.querySelector('#hud-open-pantheon')!.addEventListener('click', () => {
      this.activeTab = 'none';
      this.syncTabs();
      this.pantheonOpen = true;
      if (this.state.tutorialStep === 3) {
        this.state.tutorialStep = 4;
        saveGame(this.state);
      }
      this.updatePauseState();
      this.renderPantheon();
      this.syncCoach();
    });

    this.root.querySelector('#hud-open-menu')!.addEventListener('click', () => {
      this.confirmRestart = false;
      this.titleOpen = true;
      this.updatePauseState();
      this.renderTitleScreen();
    });

    this.elAscendBtn.addEventListener('click', () => {
      const nextId = this.state.activePlanetId + 1;
      const res = prestigeToPlanet(this.state, nextId);
      if (res.ok) {
        if (this.state.tutorialStep === 2) this.state.tutorialStep = 3;
        saveGame(this.state);
        const essMsg = res.bankedEssence > 0 ? ` (+${res.bankedEssence} Essence)` : '';
        this.showToast(`Ascended to Planet ${ROMAN[nextId - 1] ?? nextId}${essMsg}`);
        this.sync();
        if (this.activeTab !== 'none') this.renderDrawer();
      }
    });

    this.bindJoystick();
    this.syncInstallBanner();
  }

  private renderTitleScreen(): void {
    this.elTitleScreen.classList.toggle('open', this.titleOpen);
    if (!this.titleOpen) return;

    const saved = hasSavedGame();
    const conquered = PLANETS.filter((pl) => this.state.planets[pl.id].conquered).length;
    const activeCfg = getPlanetConfig(this.state.activePlanetId);
    const won = isCampaignWon(this.state);

    this.elTitleScreen.innerHTML = `
      <div class="title-plaque">
        <div class="title-sub">Chronicles of the Kaelis System</div>
        <h1>SHAMAN TO GOD</h1>
        <div class="title-summary">
          ${won ? 'Pantheon Victory: All 15 Worlds Conquered!' : `Planet ${ROMAN[activeCfg.id - 1] ?? activeCfg.id} · ${conquered}/15 Conquered · ${Math.floor(this.state.divineEssence)} Divine Essence`}
        </div>
        <div class="title-actions">
          <button class="btn ascend" id="btn-start-game">${saved ? 'Continue Conquest' : 'Begin Conquest'}</button>
          <button class="btn" id="btn-title-pantheon">Pantheon Tree</button>
          <button class="btn" id="btn-title-mute">${this.state.muted ? 'Sound: Off' : 'Sound: On'}</button>
          ${
            this.confirmRestart
              ? `<button class="btn danger" id="btn-confirm-restart">Confirm Restart</button>
                 <button class="btn" id="btn-cancel-restart">Cancel</button>`
              : `<button class="btn danger" id="btn-restart-game">Restart Game</button>`
          }
          ${this.deferredInstallPrompt ? `<button class="btn" id="btn-title-install">Install PWA</button>` : ''}
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:2px;">
          <span style="font-size:11px;color:var(--ink-soft);">WASD or Compass to move · Tap world to cast</span>
          <button class="btn" style="font-size:8px;padding:2px 6px;opacity:0.75;" id="btn-title-reset-pwa">Refresh App Cache</button>
        </div>
      </div>
    `;

    this.elTitleScreen.querySelector('#btn-start-game')?.addEventListener('click', () => {
      this.titleOpen = false;
      this.elTitleScreen.classList.remove('open');
      this.updatePauseState();
      this.onBeginPlay();
      this.sync();
    });

    this.elTitleScreen.querySelector('#btn-title-pantheon')?.addEventListener('click', () => {
      this.pantheonOpen = true;
      this.renderPantheon();
    });

    this.elTitleScreen.querySelector('#btn-title-mute')?.addEventListener('click', () => {
      this.state.muted = !this.state.muted;
      this.onMuteChanged(this.state.muted);
      saveGame(this.state);
      this.renderTitleScreen();
    });

    this.elTitleScreen.querySelector('#btn-restart-game')?.addEventListener('click', () => {
      this.confirmRestart = true;
      this.renderTitleScreen();
    });

    this.elTitleScreen.querySelector('#btn-cancel-restart')?.addEventListener('click', () => {
      this.confirmRestart = false;
      this.renderTitleScreen();
    });

    this.elTitleScreen.querySelector('#btn-confirm-restart')?.addEventListener('click', () => {
      const fresh = resetGame();
      this.state = fresh;
      this.onResetState(fresh);
      this.confirmRestart = false;
      this.titleOpen = false;
      this.victoryDismissed = false;
      this.elTitleScreen.classList.remove('open');
      this.updatePauseState();
      this.onBeginPlay();
      this.showToast('New Conquest Begun');
      this.sync();
    });

    this.elTitleScreen.querySelector('#btn-title-install')?.addEventListener('click', async () => {
      if (!this.deferredInstallPrompt) return;
      await this.deferredInstallPrompt.prompt();
      this.deferredInstallPrompt = null;
      this.renderTitleScreen();
    });

    this.elTitleScreen.querySelector('#btn-title-reset-pwa')?.addEventListener('click', async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      window.location.reload();
    });
  }

  private renderPantheon(): void {
    this.elPantheonModal.classList.toggle('open', this.pantheonOpen);
    if (!this.pantheonOpen) return;

    const conquered = PLANETS.filter((pl) => this.state.planets[pl.id].conquered).length;
    const visibleNodes = META_UPGRADES.filter((u) => isMetaNodeVisible(this.state, u));
    const selected = visibleNodes.find((u) => u.id === this.selectedMetaId) ?? visibleNodes[0];
    this.selectedMetaId = selected.id;
    const selLvl = this.state.metaLevels[selected.id];
    const selCost = getMetaUpgradeCost(selected, selLvl);
    const selMaxed = selLvl >= selected.maxLevel;
    const selUnlocked = isMetaNodeUnlocked(this.state, selected);

    // Organic curved Bezier branches for visible nodes only (fog-of-war progressive discovery)
    const pathsSvg = visibleNodes
      .map((u) => {
        const parentCfg = u.parent ? META_UPGRADES.find((m) => m.id === u.parent) : null;
        const from = parentCfg ? { x: parentCfg.x, y: parentCfg.y } : SPARK_POS;
        const to = { x: u.x, y: u.y };
        const mx = (from.x + to.x) / 2 + (to.y - from.y) * 0.14;
        const my = (from.y + to.y) / 2 - (to.x - from.x) * 0.14;
        const leveled = this.state.metaLevels[u.id] > 0;
        const stroke = leveled ? '#b87c1e' : 'rgba(140,98,41,0.62)';
        return `<path d="M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}" fill="none" stroke="${stroke}" stroke-width="${leveled ? '3.5' : '2'}" stroke-dasharray="${leveled ? '' : '5 4'}" />`;
      })
      .join('');

    const nodesHtml = visibleNodes
      .map((u) => {
        const lvl = this.state.metaLevels[u.id];
        const cost = getMetaUpgradeCost(u, lvl);
        const maxed = lvl >= u.maxLevel;
        const affordable = !maxed && this.state.divineEssence >= cost;
        const cls = `p-node ${lvl > 0 ? 'leveled' : ''} ${affordable ? 'affordable' : ''}`;
        return `<button class="${cls}" style="left:${u.x}px;top:${u.y}px;" data-pnode="${u.id}">
          <span class="pn-name">${u.name}</span>
          <span class="pn-lvl">Lv ${lvl}/${u.maxLevel}</span>
          <span class="pn-cost">${maxed ? 'MAX' : `${cost} Ess`}</span>
        </button>`;
      })
      .join('');

    this.elPantheonModal.innerHTML = `
      <div class="parchment-board">
        <div class="pantheon-header">
          <h2>PANTHEON OF KAELIS (${visibleNodes.length}/${META_UPGRADES.length})</h2>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="metric">Essence: <strong>${Math.floor(this.state.divineEssence)}</strong> <span class="sub">(+${Math.floor(this.state.pendingDivineEssence)} on Prestige)</span></span>
            <button class="btn" id="btn-zoom-out">-</button>
            <button class="btn" id="btn-zoom-in">+</button>
            <button class="btn" id="btn-zoom-reset">Fit</button>
            <button class="btn" id="btn-close-pantheon">Close</button>
          </div>
        </div>
        <div class="pantheon-canvas" id="pantheon-viewport">
          <div class="pantheon-stage" id="pantheon-stage" style="transform:translate(${this.panX}px,${this.panY}px) scale(${this.zoom});">
            <svg class="pantheon-lines" viewBox="0 0 1200 800">${pathsSvg}</svg>
            <div class="p-node center-node" style="left:${SPARK_POS.x}px;top:${SPARK_POS.y}px;">
              <span class="pn-name">SHAMAN'S SPARK</span>
              <span class="pn-lvl">${conquered}/15 Worlds</span>
            </div>
            ${nodesHtml}
          </div>
        </div>
        <div class="pantheon-footer">
          <div>
            <strong>${selected.name}</strong> (Lv ${selLvl}/${selected.maxLevel}): ${selected.description}
            ${!selUnlocked && selected.parent ? ` <em>Requires ${META_UPGRADES.find((m) => m.id === selected.parent)?.name}</em>` : ''}
          </div>
          <button class="btn ascend" id="btn-bless-selected" ${!selUnlocked || selMaxed || this.state.divineEssence < selCost ? 'disabled' : ''}>
            ${selMaxed ? 'Maxed' : `Bless (${selCost} Ess)`}
          </button>
        </div>
      </div>
    `;

    const stage = this.elPantheonModal.querySelector<HTMLElement>('#pantheon-stage')!;
    const viewport = this.elPantheonModal.querySelector<HTMLElement>('#pantheon-viewport')!;
    const applyTransform = () => {
      stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    };

    // Drag to pan + wheel to zoom
    let dragging = false;
    let startX = 0;
    let startY = 0;
    viewport.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragging = true;
      startX = e.clientX - this.panX;
      startY = e.clientY - this.panY;
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.panX = Math.max(-320, Math.min(320, e.clientX - startX));
      this.panY = Math.max(-220, Math.min(220, e.clientY - startY));
      applyTransform();
    });
    viewport.addEventListener('pointerup', () => { dragging = false; });
    viewport.addEventListener('pointercancel', () => { dragging = false; });
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.38, Math.min(1.65, this.zoom - e.deltaY * 0.001));
      applyTransform();
    }, { passive: false });

    this.elPantheonModal.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
      this.zoom = Math.min(1.65, this.zoom + 0.14);
      applyTransform();
    });
    this.elPantheonModal.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
      this.zoom = Math.max(0.38, this.zoom - 0.14);
      applyTransform();
    });
    this.elPantheonModal.querySelector('#btn-zoom-reset')?.addEventListener('click', () => {
      this.panX = 0;
      this.panY = 0;
      this.zoom = 0.72;
      applyTransform();
    });

    this.elPantheonModal.querySelector('#btn-close-pantheon')?.addEventListener('click', () => {
      this.pantheonOpen = false;
      this.elPantheonModal.classList.remove('open');
      this.updatePauseState();
    });

    this.elPantheonModal.querySelectorAll<HTMLButtonElement>('[data-pnode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pnode as MetaUpgradeConfig['id'];
        if (id === 'popCap' && this.state.tutorialStep === 4) {
          this.selectedMetaId = 'popCap';
          this.state.tutorialStep = 5;
          saveGame(this.state);
          this.renderPantheon();
          this.syncCoach();
          return;
        }
        if (this.selectedMetaId === id && buyMetaUpgrade(this.state, id)) {
          if (id === 'popCap' && this.state.tutorialStep === 5) this.state.tutorialStep = 6;
          saveGame(this.state);
          this.showToast(`Blessed ${META_UPGRADES.find((u) => u.id === id)?.name}!`);
          this.sync();
        } else {
          this.selectedMetaId = id;
        }
        this.renderPantheon();
        this.syncCoach();
      });
    });

    this.elPantheonModal.querySelector('#btn-bless-selected')?.addEventListener('click', () => {
      if (buyMetaUpgrade(this.state, this.selectedMetaId)) {
        if (this.selectedMetaId === 'popCap' && this.state.tutorialStep === 5) {
          this.state.tutorialStep = 6;
        }
        saveGame(this.state);
        this.showToast(`Blessed ${selected.name}!`);
        this.renderPantheon();
        this.sync();
      }
    });
  }

  private bindJoystick(): void {
    const zone = this.root.querySelector<HTMLElement>('#hud-joystick')!;
    const knob = this.root.querySelector<HTMLElement>('#hud-joystick-knob')!;
    let activePointerId: number | null = null;

    const updateFromClient = (clientX: number, clientY: number) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = rect.width / 2 - 20;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(maxR, dist);
      const ang = Math.atan2(dy, dx);
      const kx = dist > 0.5 ? Math.cos(ang) * clamped : 0;
      const ky = dist > 0.5 ? Math.sin(ang) * clamped : 0;
      knob.style.transform = `translate3d(${kx}px, ${ky}px, 0)`;
      this.onJoystick(kx / maxR, ky / maxR);
    };

    zone.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      activePointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      updateFromClient(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', (e) => {
      if (activePointerId !== e.pointerId) return;
      e.stopPropagation();
      e.preventDefault();
      updateFromClient(e.clientX, e.clientY);
    });

    const endDrag = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      activePointerId = null;
      knob.style.transform = 'translate3d(0, 0, 0)';
      this.onJoystick(0, 0);
    };

    zone.addEventListener('pointerup', endDrag);
    zone.addEventListener('pointercancel', endDrag);
  }

  private updatePauseState(): void {
    this.onSetPaused(this.titleOpen || this.pantheonOpen || this.coachActive);
  }

  private clearCoach(): void {
    if (this.activeCoachTarget) {
      this.activeCoachTarget.classList.remove('coach-target');
      this.activeCoachTarget = null;
    }
    this.elCoachBubble.classList.remove('visible');
    this.elCoachArrow.classList.remove('visible');
    if (this.coachActive) {
      this.coachActive = false;
      this.updatePauseState();
    }
  }

  private buildDrawnArrowSvg(dir: 'down' | 'up' | 'right'): string {
    const rot = dir === 'down' ? 0 : dir === 'up' ? 180 : -90;
    return `<svg viewBox="0 0 36 36" width="30" height="30" style="transform:rotate(${rot}deg);display:block;">
      <path d="M18 4 C17 11 17 17 18 24 M11 19 C14 23 16 27 18 32 C20 27 22 23 25 19" fill="none" stroke="#27180c" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M18 4 C17 11 17 17 18 24 M11 19 C14 23 16 27 18 32 C20 27 22 23 25 19" fill="none" stroke="#e9c46a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14 5 L18 9 L22 5" fill="none" stroke="#c89b4b" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  private pointCoachAt(selector: string, title: string, body: string, placement: 'below' | 'above' | 'left' = 'below'): void {
    const target = this.root.querySelector<HTMLElement>(selector);
    if (!target || target.offsetParent === null) {
      this.clearCoach();
      return;
    }
    if (this.activeCoachTarget && this.activeCoachTarget !== target) {
      this.activeCoachTarget.classList.remove('coach-target');
    }
    this.activeCoachTarget = target;
    target.classList.add('coach-target');
    if (!this.coachActive) {
      this.coachActive = true;
      this.updatePauseState();
    }

    const r = target.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    this.elCoachBubble.innerHTML = `<strong>${title}</strong>${body}`;
    this.elCoachBubble.classList.add('visible');
    this.elCoachArrow.classList.add('visible');

    const bw = Math.min(270, vw - 24);
    const left = Math.max(12, Math.min(vw - bw - 12, cx - bw / 2));

    if (placement === 'above') {
      this.elCoachArrow.innerHTML = this.buildDrawnArrowSvg('down');
      this.elCoachArrow.style.left = `${cx - 15}px`;
      this.elCoachArrow.style.top = `${Math.max(8, r.top - 32)}px`;
      this.elCoachBubble.style.left = `${left}px`;
      this.elCoachBubble.style.top = '';
      this.elCoachBubble.style.bottom = `${Math.max(12, vh - r.top + 34)}px`;
    } else if (placement === 'left') {
      this.elCoachArrow.innerHTML = this.buildDrawnArrowSvg('right');
      this.elCoachArrow.style.left = `${Math.max(8, r.left - 32)}px`;
      this.elCoachArrow.style.top = `${r.top + r.height / 2 - 15}px`;
      this.elCoachBubble.style.left = `${Math.max(12, r.left - bw - 34)}px`;
      this.elCoachBubble.style.bottom = '';
      this.elCoachBubble.style.top = `${Math.max(46, Math.min(vh - 96, r.top - 10))}px`;
    } else {
      this.elCoachArrow.innerHTML = this.buildDrawnArrowSvg('up');
      this.elCoachArrow.style.left = `${cx - 15}px`;
      this.elCoachArrow.style.top = `${r.bottom + 2}px`;
      this.elCoachBubble.style.left = `${left}px`;
      this.elCoachBubble.style.bottom = '';
      this.elCoachBubble.style.top = `${r.bottom + 34}px`;
    }
  }

  /** Interactive click-through tutorial with animated arrow pointers (never auto-opens menus). */
  private syncCoach(): void {
    if (this.titleOpen) {
      this.clearCoach();
      return;
    }

    const p1 = this.state.planets[1];
    const step = this.state.tutorialStep;

    if (step === 0 && this.state.activePlanetId === 1) {
      if (p1.loyalPop >= 1) {
        this.state.tutorialStep = 1;
        saveGame(this.state);
      } else {
        this.pointCoachAt(
          '[data-spell="convert"]',
          'Step I · Convert Followers',
          'Convert is active. Tap near the 6 Wildmen so they become Braves and build your first Hut.',
          'above'
        );
        return;
      }
    }

    if (this.state.tutorialStep === 1 && this.state.activePlanetId === 1 && p1.loyalPop >= 3) {
      this.pointCoachAt(
        '[data-spell="blast"]',
        'Step II · Blast Spell',
        'Tap Blast to select it, then tap enemies to launch them. Your Braves will auto-build Huts and Warrior Training Huts as your tribe grows.',
        'above'
      );
      return;
    }

    if (this.state.tutorialStep === 2 && this.state.planets[2]?.unlocked && this.state.activePlanetId === 1) {
      this.pointCoachAt(
        '#hud-ascend',
        'Step III · Prestige',
        'Planet I is conquered! Tap Ascend II to travel to Planet II and bank Divine Essence.',
        'below'
      );
      return;
    }

    if (this.state.tutorialStep === 3 && this.state.activePlanetId >= 2 && !this.pantheonOpen) {
      this.pointCoachAt(
        '#hud-open-pantheon',
        'Step IV · Open Pantheon',
        'You banked Divine Essence! Tap Pantheon to open the upgrade tree.',
        'below'
      );
      return;
    }

    if (this.state.tutorialStep === 4 && this.pantheonOpen) {
      this.pointCoachAt(
        '[data-pnode="popCap"]',
        'Step IV · Select Fertile Huts',
        'Tap Fertile Huts as your first Pantheon unlock.',
        'above'
      );
      return;
    }

    if (this.state.tutorialStep === 5 && this.pantheonOpen && this.selectedMetaId === 'popCap') {
      this.pointCoachAt(
        '#btn-bless-selected',
        'Step IV · Bless Fertile Huts',
        'Now tap Bless to permanently raise your follower cap and unlock deeper Village nodes!',
        'above'
      );
      return;
    }

    this.clearCoach();
  }

  showToast(msg: string): void {
    this.elToast.textContent = msg;
    this.elToast.classList.add('visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.elToast.classList.remove('visible');
    }, 2200);
  }

  /** Fast in-place HUD update; never destroys joystick or open drawer controls. */
  sync(): void {
    const cfg = getPlanetConfig(this.state.activePlanetId);
    const p = this.state.planets[cfg.id];
    const dom = computeDominance(p);
    const manaRate = getTotalManaPerSec(this.state);
    const popCap = getPopCap(this.state, cfg.id);
    const nextPlanet = this.state.planets[cfg.id + 1];

    this.elPlanetTitle.textContent = `${ROMAN[cfg.id - 1] ?? cfg.id} · ${cfg.name.split(': ')[1] ?? cfg.name}`;
    this.elDomFill.style.width = `${dom}%`;
    this.elDomVal.textContent = `${dom.toFixed(0)}%`;
    this.elManaVal.textContent = `${Math.floor(this.state.mana)}`;
    this.elManaRate.textContent = `(+${manaRate.toFixed(1)}/s)`;
    this.elPopVal.textContent = `${p.loyalPop}/${popCap}`;

    if (this.state.divineEssence > 0) {
      this.elEssenceWrap.style.display = 'inline-flex';
      this.elEssenceVal.textContent = `${Math.floor(this.state.divineEssence)}`;
    } else {
      this.elEssenceWrap.style.display = 'none';
    }

    const activeBuffHtml = Object.entries(this.state.activeBuffs)
      .filter(([, sec]) => sec > 0.2)
      .map(([id, sec]) => `<span class="buff-pill">${id.slice(0, 4)} ${Math.ceil(sec)}s</span>`)
      .join('');
    this.elBuffs.innerHTML = activeBuffHtml;

    if (nextPlanet && nextPlanet.unlocked) {
      this.elAscendBtn.style.display = 'inline-block';
      this.elAscendBtn.textContent = `Ascend ${ROMAN[nextPlanet.planetId - 1] ?? nextPlanet.planetId}`;
    } else {
      this.elAscendBtn.style.display = 'none';
    }

    if (isCampaignWon(this.state) && !this.victoryDismissed && !this.titleOpen) {
      this.victoryDismissed = true;
      this.titleOpen = true;
      this.renderTitleScreen();
    }

    this.syncSpells();
    this.syncTabs();
    this.syncCoach();
  }

  private syncTabs(): void {
    this.elTabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === this.activeTab);
    });
    const isOpen = this.activeTab !== 'none';
    this.elDrawer.classList.toggle('open', isOpen);
    this.elDrawerBackdrop.classList.toggle('open', isOpen);
  }

  private syncSpells(): void {
    const unlocked = SPELLS.filter((s) => isSpellUnlocked(this.state, s));
    const sig = unlocked.map((s) => s.id).join(',');
    if (sig !== this.lastSpellSignature) {
      this.lastSpellSignature = sig;
      this.elSpellDock.innerHTML = unlocked
        .map(
          (s) =>
            `<button class="spell-tablet" data-spell="${s.id}" title="${s.description}">
              <span class="s-name">${s.name}</span>
              <span class="s-cost" data-cost="${s.id}"></span>
            </button>`
        )
        .join('');
      this.elSpellDock.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.state.selectedSpellId = btn.dataset.spell!;
          if (btn.dataset.spell === 'convert' && this.state.tutorialStep === 0) {
            this.state.tutorialStep = 1;
            saveGame(this.state);
          } else if (btn.dataset.spell === 'blast' && this.state.tutorialStep === 1) {
            this.state.tutorialStep = 2;
            saveGame(this.state);
          }
          this.syncSpells();
          this.syncCoach();
        });
      });
    }

    for (const s of unlocked) {
      const btn = this.elSpellDock.querySelector<HTMLButtonElement>(`[data-spell="${s.id}"]`);
      const costEl = this.elSpellDock.querySelector<HTMLElement>(`[data-cost="${s.id}"]`);
      if (!btn || !costEl) continue;
      const cd = this.state.spellCooldowns[s.id] ?? 0;
      btn.classList.toggle('active', this.state.selectedSpellId === s.id);
      costEl.textContent = cd > 0 ? `${cd.toFixed(1)}s` : s.isStoneHead ? 'Free' : `${s.manaCost} M`;
    }

    const activeSpell = unlocked.find((s) => s.id === this.state.selectedSpellId) ?? unlocked[0];
    if (activeSpell) {
      const tag = activeSpell.isStoneHead ? 'Free · Stone Head' : `${activeSpell.manaCost} Mana`;
      this.elSpellInfo.innerHTML = `<strong>${activeSpell.name}</strong> <span style="opacity:0.75;">(${tag})</span> · ${activeSpell.description}`;
    }
  }

  private syncInstallBanner(): void {
    if (this.installDismissed || this.isStandalone()) {
      this.elInstallBanner.classList.remove('visible');
      return;
    }
    if (this.deferredInstallPrompt) {
      this.elInstallBanner.innerHTML = `
        <span>Install <strong>Shaman to God</strong> as a landscape PWA</span>
        <button class="btn ascend" id="btn-install-now">Install</button>
        <button class="btn" id="btn-install-later">Later</button>
      `;
      this.elInstallBanner.classList.add('visible');
      this.elInstallBanner.querySelector('#btn-install-now')?.addEventListener('click', async () => {
        if (!this.deferredInstallPrompt) return;
        await this.deferredInstallPrompt.prompt();
        const choice = await this.deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          this.deferredInstallPrompt = null;
          this.installDismissed = true;
        }
        this.syncInstallBanner();
      });
      this.elInstallBanner.querySelector('#btn-install-later')?.addEventListener('click', () => {
        this.installDismissed = true;
        this.syncInstallBanner();
      });
      return;
    }
    if (this.isIos()) {
      this.elInstallBanner.innerHTML = `
        <span>Install PWA: tap <strong>Share</strong> then <strong>Add to Home Screen</strong></span>
        <button class="btn" id="btn-install-later">Got it</button>
      `;
      this.elInstallBanner.classList.add('visible');
      this.elInstallBanner.querySelector('#btn-install-later')?.addEventListener('click', () => {
        this.installDismissed = true;
        this.syncInstallBanner();
      });
    }
  }

  private renderDrawer(): void {
    if (this.activeTab === 'none') {
      this.elDrawer.classList.remove('open');
      return;
    }

    const cfg = getPlanetConfig(this.state.activePlanetId);
    const p = this.state.planets[cfg.id];
    let title = '';
    let body = '';

    if (this.activeTab === 'tribe') {
      title = `Tribe Ledger · Planet ${ROMAN[cfg.id - 1] ?? cfg.id}`;
      const hasTempleUnlock = this.state.metaLevels.unlockTemple > 0;
      const hasFireUnlock = this.state.metaLevels.unlockFireWarriors > 0;
      const hasGuardUnlock = this.state.metaLevels.unlockGuardhouse > 0;
      const badge = (built: boolean, ordered: boolean, reqLabel: string) =>
        built
          ? '<span style="font-weight:700;color:#2e6b34;">Built</span>'
          : ordered
            ? '<span style="font-weight:700;color:#9b5b14;">Auto-building...</span>'
            : `<span style="opacity:0.7;">Auto at ${reqLabel}</span>`;

      body = `
        <div class="scroll-card">
          Huts: <strong>${p.hutsBuilt}</strong> · Followers: <strong>${p.loyalPop}</strong> (Braves ${p.braves}, Warriors ${p.warriors}, Preachers ${p.preachers}, Fire ${p.fireWarriors})<br/>
          Mana/sec: <strong>+${getPlanetManaPerSec(this.state, cfg.id).toFixed(1)}</strong><br/>
          <small>${p.hutsBuilt < 3 ? 'Braves chop trees to raise Huts (1 per 6 followers). At 3 Huts, pairs enter Huts to breed.' : 'Pairs of Braves breed in Huts while others auto-build, train, repair, or fight.'}</small>
        </div>
        <div class="scroll-card" style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:11px;opacity:0.8;"><strong>Automatic Village Expansion</strong> (no manual clicking needed)</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <div><strong>Warrior Training Hut</strong><br/><small>Trains Braves into melee Warriors</small></div>
            ${badge(p.warriorHutBuilt, p.warriorHutOrdered, `${BUILDING_FOLLOWER_REQS.warrior_hut} followers`)}
          </div>
          ${
            hasTempleUnlock
              ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <div><strong>Temple (Preachers)</strong><br/><small>Trains Preachers to convert rivals</small></div>
                  ${badge(p.templeBuilt, p.templeOrdered, `${BUILDING_FOLLOWER_REQS.temple} followers`)}
                </div>`
              : `<div style="font-size:11px;opacity:0.7;">Temple, Fire Warriors &amp; Guardhouses unlock in the <strong>Pantheon</strong> tree and auto-build once unlocked.</div>`
          }
          ${
            hasFireUnlock
              ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <div><strong>Fire Warrior Hut</strong><br/><small>Trains ranged fireball casters</small></div>
                  ${badge(p.fireWarriorHutBuilt, p.fireWarriorHutOrdered, `${BUILDING_FOLLOWER_REQS.firewarrior_hut} followers`)}
                </div>`
              : ''
          }
          ${
            hasGuardUnlock
              ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <div><strong>Guardhouses (${p.towersBuilt}/4)</strong><br/><small>Boosts Fire Warrior, Shaman &amp; Preacher range</small></div>
                  ${badge(p.towersBuilt >= 4, p.towersOrdered > p.towersBuilt, `${BUILDING_FOLLOWER_REQS.guard_tower} followers`)}
                </div>`
              : ''
          }
        </div>
        ${
          cfg.allianceTribe && cfg.allianceCost
            ? `<div class="scroll-card">
                <strong>Alliance (${cfg.allianceTribe.toUpperCase()})</strong><br/>
                ${p.allied ? 'Pact sealed: Ally Shaman fights alongside you.' : `<button class="btn ascend" data-action="alliance">Seal Alliance (${cfg.allianceCost} Mana)</button>`}
              </div>`
            : ''
        }
        <div class="scroll-card" style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>Audio &amp; Music</strong></span>
          <button class="btn" data-action="mute">${this.state.muted ? 'Sound: Off' : 'Sound: On'}</button>
        </div>
      `;
    } else if (this.activeTab === 'planets') {
      title = 'Kaelis Solar System';
      body = `<div class="scroll-card">
        Pending Prestige Essence: <strong>+${Math.floor(this.state.pendingDivineEssence)}</strong>
      </div>
      <div class="scroll-card">${PLANETS.map((pl) => {
        const st = this.state.planets[pl.id];
        const dom = computeDominance(st);
        const current = pl.id === this.state.activePlanetId;
        return `<div class="planet-row">
          <div>
            <strong>${ROMAN[pl.id - 1] ?? pl.id} · ${pl.name.split(': ')[1] ?? pl.name}</strong><br/>
            <small>${pl.mode === 'junior-god' ? 'Junior God' : 'Shaman'} · ${dom.toFixed(0)}% · +${getPlanetManaPerSec(this.state, pl.id).toFixed(1)}/s</small>
          </div>
          <button class="btn ${current ? 'active' : ''}" ${!st.unlocked ? 'disabled' : ''} data-visit="${pl.id}">
            ${current ? 'Here' : st.unlocked ? 'Travel' : 'Locked'}
          </button>
        </div>`;
      }).join('')}</div>`;
    }

    this.elDrawer.innerHTML = `
      <div class="drawer-header">
        <h3>${title}</h3>
        <button class="btn" id="drawer-close">Close</button>
      </div>
      ${body}
    `;
    this.elDrawer.classList.add('open');
    this.bindDrawerEvents();
  }

  private bindDrawerEvents(): void {
    this.elDrawer.querySelector('#drawer-close')?.addEventListener('click', () => {
      this.activeTab = 'none';
      this.syncTabs();
    });

    this.elDrawer.querySelectorAll<HTMLButtonElement>('[data-visit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.visit);
        const res = prestigeToPlanet(this.state, id);
        if (res.ok) {
          saveGame(this.state);
          this.activeTab = 'none';
          if (res.bankedEssence > 0) this.showToast(`Banked +${res.bankedEssence} Divine Essence!`);
          this.sync();
        }
      });
    });

    this.elDrawer.querySelector('[data-action="alliance"]')?.addEventListener('click', () => {
      if (formAlliance(this.state, this.state.activePlanetId)) {
        saveGame(this.state);
        this.showToast('Alliance sealed!');
        this.renderDrawer();
        this.sync();
      }
    });

    this.elDrawer.querySelector('[data-action="mute"]')?.addEventListener('click', () => {
      this.state.muted = !this.state.muted;
      this.onMuteChanged(this.state.muted);
      saveGame(this.state);
      this.renderDrawer();
    });
  }
}
