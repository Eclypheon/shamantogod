import { META_UPGRADES, PLANETS, SPELLS } from '../game/data';
import {
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

export class HudController {
  private root: HTMLElement;
  private state: GameState;
  private activeTab: DrawerTab = 'none';
  private toastMsg = '';
  private toastTimer = 0;
  private onJoystick: (x: number, y: number) => void;

  constructor(root: HTMLElement, state: GameState, onJoystick: (x: number, y: number) => void) {
    this.root = root;
    this.state = state;
    this.onJoystick = onJoystick;
    this.render();
  }

  showToast(msg: string): void {
    this.toastMsg = msg;
    this.toastTimer = window.setTimeout(() => {
      this.toastMsg = '';
      this.render();
    }, 2200);
    this.render();
  }

  render(): void {
    const cfg = getPlanetConfig(this.state.activePlanetId);
    const p = this.state.planets[cfg.id];
    const dom = computeDominance(p);
    const manaRate = getTotalManaPerSec(this.state);
    const popCap = getPopCap(this.state, cfg.id);
    const range = getCastRangePx(this.state, cfg.id);
    const nextPlanet = this.state.planets[cfg.id + 1];

    const unlockedSpells = SPELLS.filter((s) => isSpellUnlocked(this.state, s));

    this.root.innerHTML = `
      <div class="hud-bar top-bar">
        <div class="stat-group">
          <div class="stat-pill"><strong>P${cfg.id}/15</strong> ${cfg.name} (${cfg.mode === 'junior-god' ? 'Junior God' : 'Shaman'})</div>
          <div class="stat-pill">Mana: <strong>${Math.floor(this.state.mana)}</strong> (+${manaRate.toFixed(1)}/s)</div>
          <div class="stat-pill">Essence: <strong>${Math.floor(this.state.divineEssence)}</strong></div>
          <div class="stat-pill">Dominance: <strong>${dom.toFixed(1)}%</strong></div>
          <div class="stat-pill">Pop: <strong>${p.loyalPop}/${popCap}</strong></div>
          <div class="stat-pill">Range: <strong>${Number.isFinite(range) ? `${Math.round(range)}px` : 'Global'}</strong></div>
        </div>
        <div class="stat-group">
          <button class="btn ${this.activeTab === 'tribe' ? 'active' : ''}" data-tab="tribe">Tribe</button>
          <button class="btn ${this.activeTab === 'planets' ? 'active' : ''}" data-tab="planets">Planets</button>
          <button class="btn ${this.activeTab === 'meta' ? 'active' : ''}" data-tab="meta">Meta</button>
          <button class="btn ${this.activeTab === 'telemetry' ? 'active' : ''}" data-tab="telemetry">Telemetry</button>
          ${nextPlanet && nextPlanet.unlocked ? `<button class="btn prestige" data-action="prestige-next">Prestige P${nextPlanet.planetId}</button>` : ''}
        </div>
      </div>

      ${this.toastMsg ? `<div class="toast">${this.toastMsg}</div>` : ''}
      <div class="landscape-hint">Rotate to landscape for best PWA play</div>

      <div class="hud-panel drawer ${this.activeTab !== 'none' ? 'open' : ''}">
        ${this.renderDrawerContent()}
      </div>

      <div class="touch-joystick" id="joystick">
        <div class="touch-knob" id="joystick-knob"></div>
      </div>

      <div class="bottom-area">
        <div class="hud-bar spell-bar">
          ${unlockedSpells
            .map((s) => {
              const cd = this.state.spellCooldowns[s.id] ?? 0;
              const active = this.state.selectedSpellId === s.id ? 'active' : '';
              return `<button class="btn spell-btn ${active}" data-spell="${s.id}" title="${s.description}">
                <span>${s.name}</span>
                <span class="cost">${cd > 0 ? `${cd.toFixed(1)}s` : s.isStoneHead ? 'Stone Head' : `${s.manaCost} Mana`}</span>
              </button>`;
            })
            .join('')}
        </div>
      </div>
    `;

    this.bindEvents();
    void this.toastTimer;
  }

  private renderDrawerContent(): string {
    const cfg = getPlanetConfig(this.state.activePlanetId);
    const p = this.state.planets[cfg.id];

    if (this.activeTab === 'tribe') {
      const r = this.state.ratios;
      return `
        <h3>Tribe Automation (Planet ${cfg.id})</h3>
        <div class="card">
          <label><input type="checkbox" id="autobuild-chk" ${this.state.autoBuild ? 'checked' : ''}/> Auto-build Huts &amp; Training</label>
          <div class="slider-row"><span>Braves (${p.braves})</span><input type="range" min="10" max="80" value="${r.brave}" data-ratio="brave"/><span>${r.brave}%</span></div>
          <div class="slider-row"><span>Preachers (${p.preachers})</span><input type="range" min="0" max="60" value="${r.preacher}" data-ratio="preacher"/><span>${r.preacher}%</span></div>
          <div class="slider-row"><span>Warriors (${p.warriors})</span><input type="range" min="0" max="70" value="${r.warrior}" data-ratio="warrior"/><span>${r.warrior}%</span></div>
          <div class="slider-row"><span>Fire War. (${p.fireWarriors})</span><input type="range" min="0" max="60" value="${r.fireWarrior}" data-ratio="fireWarrior"/><span>${r.fireWarrior}%</span></div>
        </div>
        ${
          cfg.allianceTribe && cfg.allianceCost
            ? `<div class="card">
                <strong>Alliance (${cfg.allianceTribe.toUpperCase()})</strong><br/>
                ${p.allied ? 'Allied: +25% Mana &amp; +10% Dominance.' : `<button class="btn" data-action="alliance">Form Alliance (${cfg.allianceCost} Mana)</button>`}
              </div>`
            : ''
        }
        <div class="card">
          <strong>Audio &amp; PWA</strong><br/>
          <button class="btn" data-action="toggle-mute">${this.state.muted ? 'Unmute Audio' : 'Mute Audio'}</button>
          <button class="btn danger" data-action="reset-pwa">Reset PWA Cache</button>
        </div>
      `;
    }

    if (this.activeTab === 'planets') {
      return `
        <h3>Kaelis Solar System (15 Planets)</h3>
        <div class="card">
          ${PLANETS.map((pl) => {
            const st = this.state.planets[pl.id];
            const dom = computeDominance(st);
            const current = pl.id === this.state.activePlanetId;
            return `<div class="planet-row">
              <div>
                <strong>P${pl.id}: ${pl.name}</strong><br/>
                <small>${pl.mode === 'junior-god' ? 'Junior God' : 'Shaman'} | Dom: ${dom.toFixed(1)}% ${st.conquered ? '(Conquered)' : ''}</small>
              </div>
              <button class="btn ${current ? 'active' : ''}" ${!st.unlocked ? 'disabled' : ''} data-visit="${pl.id}">
                ${current ? 'Active' : st.unlocked ? 'Visit' : 'Locked'}
              </button>
            </div>`;
          }).join('')}
        </div>
      `;
    }

    if (this.activeTab === 'meta') {
      return `
        <h3>Divine Essence Meta-Upgrades</h3>
        <div class="card">Available Essence: <strong>${Math.floor(this.state.divineEssence)}</strong></div>
        ${META_UPGRADES.map((u) => {
          const lvl = this.state.metaLevels[u.id];
          const cost = getMetaUpgradeCost(u, lvl);
          const maxed = lvl >= u.maxLevel;
          return `<div class="card">
            <strong>${u.name}</strong> (Lv ${lvl}/${u.maxLevel})<br/>
            <small>${u.description}</small><br/>
            <button class="btn" ${maxed || this.state.divineEssence < cost ? 'disabled' : ''} data-meta="${u.id}">
              ${maxed ? 'Maxed' : `Upgrade (${cost} Essence)`}
            </button>
          </div>`;
        }).join('')}
      `;
    }

    if (this.activeTab === 'telemetry') {
      return `
        <h3>System Telemetry</h3>
        <div class="card">
          Total Mana/sec: <strong>${getTotalManaPerSec(this.state).toFixed(2)}</strong><br/>
          Total Swarm Kills: <strong>${this.state.totalSwarmKills}</strong><br/>
          Conquered Planets: <strong>${PLANETS.filter((pl) => this.state.planets[pl.id].conquered).length} / 15</strong>
        </div>
        <div class="card">
          ${PLANETS.filter((pl) => this.state.planets[pl.id].unlocked)
            .map((pl) => {
              const st = this.state.planets[pl.id];
              return `<div class="planet-row">
                <span>P${pl.id} (${computeDominance(st).toFixed(1)}%)</span>
                <span>+${getPlanetManaPerSec(this.state, pl.id).toFixed(1)}/s | Kills: ${st.swarmKills}</span>
              </div>`;
            })
            .join('')}
        </div>
      `;
    }

    return '';
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.onclick = () => {
        const t = btn.dataset.tab as DrawerTab;
        this.activeTab = this.activeTab === t ? 'none' : t;
        this.render();
      };
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach((btn) => {
      btn.onclick = () => {
        this.state.selectedSpellId = btn.dataset.spell!;
        this.render();
      };
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-visit]').forEach((btn) => {
      btn.onclick = () => {
        const id = Number(btn.dataset.visit);
        if (switchPlanet(this.state, id)) {
          saveGame(this.state);
          this.activeTab = 'none';
          this.render();
        }
      };
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-meta]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.meta as (typeof META_UPGRADES)[number]['id'];
        if (buyMetaUpgrade(this.state, id)) {
          saveGame(this.state);
          this.render();
        }
      };
    });

    const prestigeBtn = this.root.querySelector<HTMLButtonElement>('[data-action="prestige-next"]');
    if (prestigeBtn) {
      prestigeBtn.onclick = () => {
        const nextId = this.state.activePlanetId + 1;
        if (switchPlanet(this.state, nextId)) {
          saveGame(this.state);
          this.showToast(`Prestiged to Planet ${nextId}!`);
        }
      };
    }

    const allianceBtn = this.root.querySelector<HTMLButtonElement>('[data-action="alliance"]');
    if (allianceBtn) {
      allianceBtn.onclick = () => {
        if (formAlliance(this.state, this.state.activePlanetId)) {
          saveGame(this.state);
          this.showToast('Alliance formed!');
        }
      };
    }

    const autoChk = this.root.querySelector<HTMLInputElement>('#autobuild-chk');
    if (autoChk) {
      autoChk.onchange = () => {
        this.state.autoBuild = autoChk.checked;
        saveGame(this.state);
      };
    }

    this.root.querySelectorAll<HTMLInputElement>('[data-ratio]').forEach((inp) => {
      inp.oninput = () => {
        const key = inp.dataset.ratio as keyof GameState['ratios'];
        this.state.ratios[key] = Number(inp.value);
        rebalanceUnits(this.state, this.state.planets[this.state.activePlanetId]);
        saveGame(this.state);
        this.render();
      };
    });

    const muteBtn = this.root.querySelector<HTMLButtonElement>('[data-action="toggle-mute"]');
    if (muteBtn) {
      muteBtn.onclick = () => {
        this.state.muted = !this.state.muted;
        saveGame(this.state);
        this.render();
      };
    }

    const resetBtn = this.root.querySelector<HTMLButtonElement>('[data-action="reset-pwa"]');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        window.location.reload();
      };
    }

    // Touch joystick
    const joy = this.root.querySelector<HTMLElement>('#joystick');
    const knob = this.root.querySelector<HTMLElement>('#joystick-knob');
    if (joy && knob) {
      let dragging = false;
      const updateJoy = (cx: number, cy: number) => {
        const rect = joy.getBoundingClientRect();
        const rx = cx - (rect.left + rect.width / 2);
        const ry = cy - (rect.top + rect.height / 2);
        const maxR = rect.width / 2 - 14;
        const dist = Math.hypot(rx, ry);
        const clamped = Math.min(maxR, dist);
        const ang = Math.atan2(ry, rx);
        const kx = Math.cos(ang) * clamped;
        const ky = Math.sin(ang) * clamped;
        knob.style.transform = `translate(${kx}px, ${ky}px)`;
        this.onJoystick(kx / maxR, ky / maxR);
      };
      joy.onpointerdown = (e) => {
        dragging = true;
        joy.setPointerCapture(e.pointerId);
        updateJoy(e.clientX, e.clientY);
      };
      joy.onpointermove = (e) => {
        if (dragging) updateJoy(e.clientX, e.clientY);
      };
      const stop = () => {
        dragging = false;
        knob.style.transform = 'translate(0px, 0px)';
        this.onJoystick(0, 0);
      };
      joy.onpointerup = stop;
      joy.onpointercancel = stop;
    }
  }
}
