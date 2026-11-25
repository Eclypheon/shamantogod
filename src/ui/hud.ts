import { META_UPGRADES, PLANETS, SPELLS, type MetaUpgradeConfig } from '../game/data';
import {
  buildGuardTower,
  buyMetaUpgrade,
  computeDominance,
  formAlliance,
  getCastRangePx,
  getMetaUpgradeCost,
  getPlanetConfig,
  getPlanetManaPerSec,
  getPopCap,
  getTotalManaPerSec,
  hasSavedGame,
  isCampaignWon,
  isSpellUnlocked,
  rebalanceUnits,
  resetGame,
  saveGame,
  switchPlanet,
  type GameState,
} from '../game/state';

export type DrawerTab = 'none' | 'tribe' | 'planets' | 'telemetry';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

// Coordinates (% of parchment board) for the 6 glowing meta-progression nodes around center (50, 50)
const NODE_POS: Record<MetaUpgradeConfig['id'], { x: number; y: number }> = {
  startingMana: { x: 22, y: 26 },
  manaRate: { x: 50, y: 18 },
  castRange: { x: 78, y: 26 },
  spellPower: { x: 78, y: 74 },
  popCap: { x: 50, y: 82 },
  offlineEfficiency: { x: 22, y: 74 },
};

export class HudController {
  private root: HTMLElement;
  private state: GameState;
  private activeTab: DrawerTab = 'none';
  private titleOpen = true;
  private pantheonOpen = false;
  private confirmRestart = false;
  private victoryDismissed = false;
  private selectedMetaId: MetaUpgradeConfig['id'] = 'manaRate';
  private toastTimer = 0;
  private onJoystick: (x: number, y: number) => void;
  private onResetState: (fresh: GameState) => void;
  private onStartAudio: () => void;
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private installDismissed = false;
  private lastSpellSignature = '';

  // Persistent HUD DOM references
  private elPlanetTitle!: HTMLElement;
  private elModeBadge!: HTMLElement;
  private elDomFill!: HTMLElement;
  private elDomVal!: HTMLElement;
  private elManaVal!: HTMLElement;
  private elManaRate!: HTMLElement;
  private elEssenceVal!: HTMLElement;
  private elPopVal!: HTMLElement;
  private elRangeVal!: HTMLElement;
  private elBuffs!: HTMLElement;
  private elAscendBtn!: HTMLButtonElement;
  private elTabBtns!: NodeListOf<HTMLButtonElement>;
  private elSpellDock!: HTMLElement;
  private elDrawer!: HTMLElement;
  private elToast!: HTMLElement;
  private elInstallBanner!: HTMLElement;
  private elTitleScreen!: HTMLElement;
  private elPantheonModal!: HTMLElement;

  constructor(
    root: HTMLElement,
    state: GameState,
    onJoystick: (x: number, y: number) => void,
    onResetState: (fresh: GameState) => void,
    onStartAudio: () => void
  ) {
    this.root = root;
    this.state = state;
    this.onJoystick = onJoystick;
    this.onResetState = onResetState;
    this.onStartAudio = onStartAudio;

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
          <span class="mode-badge" id="hud-mode"></span>
          <div class="dom-track" title="Dominance"><div class="dom-fill" id="hud-dom-fill"></div></div>
          <span class="metric"><strong id="hud-dom">0%</strong></span>
          <span id="hud-buffs" style="display:flex;gap:4px;"></span>
        </div>
        <div class="ribbon-center">
          <span class="metric">Mana <strong id="hud-mana">0</strong><span class="sub" id="hud-rate">(+0/s)</span></span>
          <span class="sep">·</span>
          <span class="metric">Essence <strong id="hud-essence">0</strong></span>
          <span class="sep hide-sm">·</span>
          <span class="metric hide-sm">Pop <strong id="hud-pop">0/0</strong></span>
          <span class="sep hide-sm">·</span>
          <span class="metric hide-sm">Range <strong id="hud-range">0</strong></span>
        </div>
        <div class="ribbon-right">
          <button class="btn" data-tab="tribe">Tribe</button>
          <button class="btn" data-tab="planets">Worlds</button>
          <button class="btn" id="hud-open-pantheon">Pantheon</button>
          <button class="btn" data-tab="telemetry">Stats</button>
          <button class="btn ascend" id="hud-ascend" style="display:none;">Ascend</button>
          <button class="btn" id="hud-open-menu">Menu</button>
        </div>
      </header>

      <div class="papyrus toast" id="hud-toast"></div>
      <div class="papyrus install-banner" id="hud-install"></div>

      <aside class="papyrus scroll-drawer" id="hud-drawer"></aside>

      <div class="joystick-zone" id="hud-joystick">
        <div class="joystick-knob" id="hud-joystick-knob"></div>
      </div>

      <nav class="papyrus spell-dock" id="hud-spells"></nav>

      <section class="title-screen open" id="hud-title"></section>
      <section class="pantheon-modal" id="hud-pantheon"></section>

      <div class="landscape-overlay" id="hud-rotate">
        <div style="font-size:38px;">&#8635;</div>
        <strong style="font-family:var(--font-display);font-size:17px;letter-spacing:0.06em;">Rotate to Landscape</strong>
        <span style="font-size:14px;max-width:280px;opacity:0.85;">Shaman to God is crafted for wide-screen landscape play. Tilt your device to begin.</span>
        <button class="btn" id="hud-rotate-dismiss">Continue anyway</button>
      </div>
    `;

    this.elPlanetTitle = this.root.querySelector('#hud-planet')!;
    this.elModeBadge = this.root.querySelector('#hud-mode')!;
    this.elDomFill = this.root.querySelector('#hud-dom-fill')!;
    this.elDomVal = this.root.querySelector('#hud-dom')!;
    this.elManaVal = this.root.querySelector('#hud-mana')!;
    this.elManaRate = this.root.querySelector('#hud-rate')!;
    this.elEssenceVal = this.root.querySelector('#hud-essence')!;
    this.elPopVal = this.root.querySelector('#hud-pop')!;
    this.elRangeVal = this.root.querySelector('#hud-range')!;
    this.elBuffs = this.root.querySelector('#hud-buffs')!;
    this.elAscendBtn = this.root.querySelector('#hud-ascend')!;
    this.elTabBtns = this.root.querySelectorAll('[data-tab]');
    this.elSpellDock = this.root.querySelector('#hud-spells')!;
    this.elDrawer = this.root.querySelector('#hud-drawer')!;
    this.elToast = this.root.querySelector('#hud-toast')!;
    this.elInstallBanner = this.root.querySelector('#hud-install')!;
    this.elTitleScreen = this.root.querySelector('#hud-title')!;
    this.elPantheonModal = this.root.querySelector('#hud-pantheon')!;

    this.elTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tab as DrawerTab;
        this.activeTab = this.activeTab === t ? 'none' : t;
        this.renderDrawer();
        this.syncTabs();
      });
    });

    this.root.querySelector('#hud-open-pantheon')!.addEventListener('click', () => {
      this.activeTab = 'none';
      this.syncTabs();
      this.pantheonOpen = true;
      this.renderPantheon();
    });

    this.root.querySelector('#hud-open-menu')!.addEventListener('click', () => {
      this.confirmRestart = false;
      this.titleOpen = true;
      this.renderTitleScreen();
    });

    this.elAscendBtn.addEventListener('click', () => {
      const nextId = this.state.activePlanetId + 1;
      if (switchPlanet(this.state, nextId)) {
        saveGame(this.state);
        this.showToast(`Ascended to Planet ${ROMAN[nextId - 1] ?? nextId}`);
        this.sync();
        if (this.activeTab !== 'none') this.renderDrawer();
      }
    });

    const rotateOverlay = this.root.querySelector<HTMLElement>('#hud-rotate')!;
    this.root.querySelector('#hud-rotate-dismiss')!.addEventListener('click', () => {
      rotateOverlay.classList.add('dismissed');
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
          ${
            this.confirmRestart
              ? `<button class="btn danger" id="btn-confirm-restart">Confirm Restart</button>
                 <button class="btn" id="btn-cancel-restart">Cancel</button>`
              : `<button class="btn danger" id="btn-restart-game">Restart Game</button>`
          }
          ${this.deferredInstallPrompt ? `<button class="btn" id="btn-title-install">Install PWA</button>` : ''}
        </div>
        <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">
          Move with WASD or Bronze Compass · Tap world to cast spells · Conquer all 15 planets (&gt;95% Dominance)
        </div>
      </div>
    `;

    this.elTitleScreen.querySelector('#btn-start-game')?.addEventListener('click', () => {
      this.titleOpen = false;
      this.elTitleScreen.classList.remove('open');
      this.onStartAudio();
      this.sync();
    });

    this.elTitleScreen.querySelector('#btn-title-pantheon')?.addEventListener('click', () => {
      this.pantheonOpen = true;
      this.renderPantheon();
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
      this.onStartAudio();
      this.showToast('New Conquest Begun');
      this.sync();
    });

    this.elTitleScreen.querySelector('#btn-title-install')?.addEventListener('click', async () => {
      if (!this.deferredInstallPrompt) return;
      await this.deferredInstallPrompt.prompt();
      this.deferredInstallPrompt = null;
      this.renderTitleScreen();
    });
  }

  private renderPantheon(): void {
    this.elPantheonModal.classList.toggle('open', this.pantheonOpen);
    if (!this.pantheonOpen) return;

    const conquered = PLANETS.filter((pl) => this.state.planets[pl.id].conquered).length;
    const selected = META_UPGRADES.find((u) => u.id === this.selectedMetaId) ?? META_UPGRADES[0];
    const selLvl = this.state.metaLevels[selected.id];
    const selCost = getMetaUpgradeCost(selected, selLvl);
    const selMaxed = selLvl >= selected.maxLevel;

    const linesSvg = META_UPGRADES.map((u) => {
      const pos = NODE_POS[u.id];
      const leveled = this.state.metaLevels[u.id] > 0;
      return `<line x1="50%" y1="50%" x2="${pos.x}%" y2="${pos.y}%" stroke="${leveled ? '#b87c1e' : 'rgba(140,98,41,0.4)'}" stroke-width="${leveled ? '3' : '1.8'}" stroke-dasharray="${leveled ? '' : '4 4'}" />`;
    }).join('');

    const nodesHtml = META_UPGRADES.map((u) => {
      const pos = NODE_POS[u.id];
      const lvl = this.state.metaLevels[u.id];
      const cost = getMetaUpgradeCost(u, lvl);
      const maxed = lvl >= u.maxLevel;
      const affordable = !maxed && this.state.divineEssence >= cost;
      const cls = `p-node ${lvl > 0 ? 'leveled' : ''} ${affordable ? 'affordable' : ''}`;
      return `<button class="${cls}" style="left:${pos.x}%;top:${pos.y}%;" data-pnode="${u.id}">
        <span class="pn-name">${u.name}</span>
        <span class="pn-lvl">Lv ${lvl}/${u.maxLevel}</span>
        <span class="pn-cost">${maxed ? 'MAX' : `${cost} Ess`}</span>
      </button>`;
    }).join('');

    this.elPantheonModal.innerHTML = `
      <div class="parchment-board">
        <div class="pantheon-header">
          <h2>PANTHEON OF KAELIS</h2>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="metric">Divine Essence: <strong>${Math.floor(this.state.divineEssence)}</strong></span>
            <button class="btn" id="btn-close-pantheon">Close</button>
          </div>
        </div>
        <div class="pantheon-canvas">
          <svg class="pantheon-lines">${linesSvg}</svg>
          <div class="p-node center-node" style="left:50%;top:50%;">
            <span class="pn-name">SHAMAN'S SPARK</span>
            <span class="pn-lvl">${conquered}/15 Worlds</span>
          </div>
          ${nodesHtml}
        </div>
        <div class="pantheon-footer">
          <div>
            <strong>${selected.name}</strong> (Lv ${selLvl}/${selected.maxLevel}): ${selected.description}
          </div>
          <button class="btn ascend" id="btn-bless-selected" ${selMaxed || this.state.divineEssence < selCost ? 'disabled' : ''}>
            ${selMaxed ? 'Maxed' : `Bless (${selCost} Essence)`}
          </button>
        </div>
      </div>
    `;

    this.elPantheonModal.querySelector('#btn-close-pantheon')?.addEventListener('click', () => {
      this.pantheonOpen = false;
      this.elPantheonModal.classList.remove('open');
    });

    this.elPantheonModal.querySelectorAll<HTMLButtonElement>('[data-pnode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pnode as MetaUpgradeConfig['id'];
        if (this.selectedMetaId === id && buyMetaUpgrade(this.state, id)) {
          saveGame(this.state);
          this.showToast(`Blessed ${META_UPGRADES.find((u) => u.id === id)?.name}!`);
          this.sync();
        } else {
          this.selectedMetaId = id;
        }
        this.renderPantheon();
      });
    });

    this.elPantheonModal.querySelector('#btn-bless-selected')?.addEventListener('click', () => {
      if (buyMetaUpgrade(this.state, this.selectedMetaId)) {
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
      this.onStartAudio();
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

  showToast(msg: string): void {
    this.elToast.textContent = msg;
    this.elToast.classList.add('visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.elToast.classList.remove('visible');
    }, 2200);
  }

  /** Fast in-place HUD update called every 250ms; never destroys joystick or open drawer inputs. */
  sync(): void {
    const cfg = getPlanetConfig(this.state.activePlanetId);
    const p = this.state.planets[cfg.id];
    const dom = computeDominance(p);
    const manaRate = getTotalManaPerSec(this.state);
    const popCap = getPopCap(this.state, cfg.id);
    const range = getCastRangePx(this.state, cfg.id);
    const nextPlanet = this.state.planets[cfg.id + 1];

    this.elPlanetTitle.textContent = `${ROMAN[cfg.id - 1] ?? cfg.id} · ${cfg.name.split(': ')[1] ?? cfg.name}`;
    this.elModeBadge.textContent = cfg.mode === 'junior-god' ? 'Junior God' : 'Shaman';
    this.elModeBadge.classList.toggle('god', cfg.mode === 'junior-god');
    this.elDomFill.style.width = `${dom}%`;
    this.elDomVal.textContent = `${dom.toFixed(0)}%`;
    this.elManaVal.textContent = `${Math.floor(this.state.mana)}`;
    this.elManaRate.textContent = `(+${manaRate.toFixed(1)}/s)`;
    this.elEssenceVal.textContent = `${Math.floor(this.state.divineEssence)}`;
    this.elPopVal.textContent = `${p.loyalPop}/${popCap}`;
    this.elRangeVal.textContent = Number.isFinite(range) ? `${Math.round(range)}` : 'Global';

    // Active buffs
    const activeBuffHtml = Object.entries(this.state.activeBuffs)
      .filter(([, sec]) => sec > 0.2)
      .map(([id, sec]) => `<span class="buff-pill">${id.slice(0, 5)} ${Math.ceil(sec)}s</span>`)
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

    if (this.activeTab === 'telemetry') {
      this.renderDrawer();
    }
  }

  private syncTabs(): void {
    this.elTabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === this.activeTab);
    });
    this.elDrawer.classList.toggle('open', this.activeTab !== 'none');
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
          this.syncSpells();
        });
      });
    }

    for (const s of unlocked) {
      const btn = this.elSpellDock.querySelector<HTMLButtonElement>(`[data-spell="${s.id}"]`);
      const costEl = this.elSpellDock.querySelector<HTMLElement>(`[data-cost="${s.id}"]`);
      if (!btn || !costEl) continue;
      const cd = this.state.spellCooldowns[s.id] ?? 0;
      btn.classList.toggle('active', this.state.selectedSpellId === s.id);
      costEl.textContent = cd > 0 ? `${cd.toFixed(1)}s` : s.isStoneHead ? 'Stone' : `${s.manaCost} M`;
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
      title = `Tribe Decree · Planet ${ROMAN[cfg.id - 1] ?? cfg.id}`;
      const r = this.state.ratios;
      body = `
        <div class="scroll-card">
          <label><input type="checkbox" id="autobuild-chk" ${this.state.autoBuild ? 'checked' : ''}/> Auto-build Huts &amp; Training</label>
          <div class="slider-row"><span>Braves (${p.braves})</span><input type="range" min="10" max="80" value="${r.brave}" data-ratio="brave"/><span data-rval="brave">${r.brave}%</span></div>
          <div class="slider-row"><span>Preachers (${p.preachers})</span><input type="range" min="0" max="60" value="${r.preacher}" data-ratio="preacher"/><span data-rval="preacher">${r.preacher}%</span></div>
          <div class="slider-row"><span>Warriors (${p.warriors})</span><input type="range" min="0" max="70" value="${r.warrior}" data-ratio="warrior"/><span data-rval="warrior">${r.warrior}%</span></div>
          <div class="slider-row"><span>Fire War. (${p.fireWarriors})</span><input type="range" min="0" max="60" value="${r.fireWarrior}" data-ratio="fireWarrior"/><span data-rval="fireWarrior">${r.fireWarrior}%</span></div>
        </div>
        ${
          cfg.allianceTribe && cfg.allianceCost
            ? `<div class="scroll-card">
                <strong>Alliance (${cfg.allianceTribe.toUpperCase()})</strong><br/>
                ${p.allied ? 'Pact sealed: Ally Shaman fights alongside you (+25% Mana, +10% Dominance).' : `<button class="btn ascend" data-action="alliance">Seal Alliance (${cfg.allianceCost} Mana)</button>`}
              </div>`
            : ''
        }
        <div class="scroll-card" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
          <span>Guard Towers: <strong>${p.towersBuilt}/4</strong></span>
          <button class="btn" ${p.towersBuilt >= 4 || this.state.mana < 150 * (p.towersBuilt + 1) ? 'disabled' : ''} data-action="build-tower">
            ${p.towersBuilt >= 4 ? 'Maxed' : `Build (${150 * (p.towersBuilt + 1)} M)`}
          </button>
        </div>
        <div class="scroll-card" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn" data-action="toggle-mute">${this.state.muted ? 'Unmute Audio' : 'Mute Audio'}</button>
          <button class="btn danger" data-action="reset-pwa">Reset PWA Cache</button>
        </div>
      `;
    } else if (this.activeTab === 'planets') {
      title = 'Kaelis Solar System';
      body = `<div class="scroll-card">${PLANETS.map((pl) => {
        const st = this.state.planets[pl.id];
        const dom = computeDominance(st);
        const current = pl.id === this.state.activePlanetId;
        return `<div class="planet-row">
          <div>
            <strong>${ROMAN[pl.id - 1] ?? pl.id} · ${pl.name.split(': ')[1] ?? pl.name}</strong><br/>
            <small>${pl.mode === 'junior-god' ? 'Junior God' : 'Shaman'} · ${dom.toFixed(0)}% ${st.conquered ? '· Conquered' : ''}</small>
          </div>
          <button class="btn ${current ? 'active' : ''}" ${!st.unlocked ? 'disabled' : ''} data-visit="${pl.id}">
            ${current ? 'Here' : st.unlocked ? 'Travel' : 'Locked'}
          </button>
        </div>`;
      }).join('')}</div>`;
    } else if (this.activeTab === 'telemetry') {
      title = 'Oracle Telemetry';
      body = `
        <div class="scroll-card">
          Total Mana/sec: <strong>${getTotalManaPerSec(this.state).toFixed(2)}</strong><br/>
          Swarm Kills: <strong>${this.state.totalSwarmKills}</strong><br/>
          Conquered: <strong>${PLANETS.filter((pl) => this.state.planets[pl.id].conquered).length} / 15</strong>
        </div>
        <div class="scroll-card">
          ${PLANETS.filter((pl) => this.state.planets[pl.id].unlocked)
            .map((pl) => {
              const st = this.state.planets[pl.id];
              return `<div class="planet-row">
                <span>${ROMAN[pl.id - 1] ?? pl.id} (${computeDominance(st).toFixed(0)}%)</span>
                <span>+${getPlanetManaPerSec(this.state, pl.id).toFixed(1)}/s · ${st.swarmKills} kills</span>
              </div>`;
            })
            .join('')}
        </div>
      `;
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
        if (switchPlanet(this.state, id)) {
          saveGame(this.state);
          this.activeTab = 'none';
          this.sync();
        }
      });
    });

    this.elDrawer.querySelector('[data-action="build-tower"]')?.addEventListener('click', () => {
      if (buildGuardTower(this.state, this.state.activePlanetId)) {
        saveGame(this.state);
        this.showToast('Guard Tower constructed!');
        this.renderDrawer();
        this.sync();
      }
    });

    this.elDrawer.querySelector('[data-action="alliance"]')?.addEventListener('click', () => {
      if (formAlliance(this.state, this.state.activePlanetId)) {
        saveGame(this.state);
        this.showToast('Alliance sealed!');
        this.renderDrawer();
        this.sync();
      }
    });

    const autoChk = this.elDrawer.querySelector<HTMLInputElement>('#autobuild-chk');
    if (autoChk) {
      autoChk.addEventListener('change', () => {
        this.state.autoBuild = autoChk.checked;
        saveGame(this.state);
      });
    }

    this.elDrawer.querySelectorAll<HTMLInputElement>('[data-ratio]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.ratio as keyof GameState['ratios'];
        this.state.ratios[key] = Number(inp.value);
        rebalanceUnits(this.state, this.state.planets[this.state.activePlanetId]);
        const valEl = this.elDrawer.querySelector(`[data-rval="${key}"]`);
        if (valEl) valEl.textContent = `${inp.value}%`;
        saveGame(this.state);
      });
    });

    this.elDrawer.querySelector('[data-action="toggle-mute"]')?.addEventListener('click', () => {
      this.state.muted = !this.state.muted;
      saveGame(this.state);
      this.renderDrawer();
    });

    this.elDrawer.querySelector('[data-action="reset-pwa"]')?.addEventListener('click', async () => {
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
}
