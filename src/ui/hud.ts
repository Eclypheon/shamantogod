import { META_UPGRADES, PLANETS, SPELLS } from '../game/data';
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
  isSpellUnlocked,
  rebalanceUnits,
  saveGame,
  switchPlanet,
  type GameState,
} from '../game/state';

export type DrawerTab = 'none' | 'tribe' | 'planets' | 'meta' | 'telemetry';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

export class HudController {
  private root: HTMLElement;
  private state: GameState;
  private activeTab: DrawerTab = 'none';
  private toastTimer = 0;
  private onJoystick: (x: number, y: number) => void;
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private installDismissed = false;
  private lastSpellSignature = '';

  // Cached persistent DOM references (never torn down on tick)
  private elPlanetTitle!: HTMLElement;
  private elModeBadge!: HTMLElement;
  private elDomFill!: HTMLElement;
  private elDomVal!: HTMLElement;
  private elManaVal!: HTMLElement;
  private elManaRate!: HTMLElement;
  private elEssenceVal!: HTMLElement;
  private elPopVal!: HTMLElement;
  private elRangeVal!: HTMLElement;
  private elAscendBtn!: HTMLButtonElement;
  private elTabBtns!: NodeListOf<HTMLButtonElement>;
  private elSpellDock!: HTMLElement;
  private elDrawer!: HTMLElement;
  private elToast!: HTMLElement;
  private elInstallBanner!: HTMLElement;

  constructor(root: HTMLElement, state: GameState, onJoystick: (x: number, y: number) => void) {
    this.root = root;
    this.state = state;
    this.onJoystick = onJoystick;

    this.mountShell();

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e as BeforeInstallPromptEvent;
      this.syncInstallBanner();
    });
    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      this.installDismissed = true;
      this.syncInstallBanner();
    });

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
          <button class="btn" data-tab="meta">Meta</button>
          <button class="btn" data-tab="telemetry">Stats</button>
          <button class="btn ascend" id="hud-ascend" style="display:none;">Ascend</button>
        </div>
      </header>

      <div class="papyrus toast" id="hud-toast"></div>
      <div class="papyrus install-banner" id="hud-install"></div>

      <aside class="papyrus scroll-drawer" id="hud-drawer"></aside>

      <div class="joystick-zone" id="hud-joystick">
        <div class="joystick-knob" id="hud-joystick-knob"></div>
      </div>

      <nav class="papyrus spell-dock" id="hud-spells"></nav>

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
    this.elAscendBtn = this.root.querySelector('#hud-ascend')!;
    this.elTabBtns = this.root.querySelectorAll('[data-tab]');
    this.elSpellDock = this.root.querySelector('#hud-spells')!;
    this.elDrawer = this.root.querySelector('#hud-drawer')!;
    this.elToast = this.root.querySelector('#hud-toast')!;
    this.elInstallBanner = this.root.querySelector('#hud-install')!;

    this.elTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tab as DrawerTab;
        this.activeTab = this.activeTab === t ? 'none' : t;
        this.renderDrawer();
        this.syncTabs();
      });
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

    if (nextPlanet && nextPlanet.unlocked) {
      this.elAscendBtn.style.display = 'inline-block';
      this.elAscendBtn.textContent = `Ascend ${ROMAN[nextPlanet.planetId - 1] ?? nextPlanet.planetId}`;
    } else {
      this.elAscendBtn.style.display = 'none';
    }

    this.syncSpells();
    this.syncTabs();

    // Update live telemetry tab only when open (has no interactive sliders)
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
    } else if (this.activeTab === 'meta') {
      title = `Pantheon Meta (${Math.floor(this.state.divineEssence)} Essence)`;
      body = META_UPGRADES.map((u) => {
        const lvl = this.state.metaLevels[u.id];
        const cost = getMetaUpgradeCost(u, lvl);
        const maxed = lvl >= u.maxLevel;
        return `<div class="scroll-card">
          <strong>${u.name}</strong> (Lv ${lvl}/${u.maxLevel})<br/>
          <small>${u.description}</small><br/>
          <button class="btn" style="margin-top:4px;" ${maxed || this.state.divineEssence < cost ? 'disabled' : ''} data-meta="${u.id}">
            ${maxed ? 'Maxed' : `Bless (${cost} Essence)`}
          </button>
        </div>`;
      }).join('');
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

    this.elDrawer.querySelectorAll<HTMLButtonElement>('[data-meta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.meta as (typeof META_UPGRADES)[number]['id'];
        if (buyMetaUpgrade(this.state, id)) {
          saveGame(this.state);
          this.renderDrawer();
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
