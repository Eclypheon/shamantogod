/**
 * Gentle, royalty-free procedural Ancient Ambient Soundscape using Web Audio API.
 * Soft warm harmonic drone + sparse ancient Greek Phrygian/pentatonic lyre plucks.
 */
export class AncientAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pluckTimer = 0;
  private started = false;
  private muted = false;

  // D Dorian / ancient Greek lyre frequencies (Hz)
  private readonly scale = [293.66, 329.63, 349.23, 440.0, 493.88, 523.25, 587.33, 659.25];

  start(muted: boolean): void {
    this.muted = muted;
    if (this.started) {
      this.setMuted(muted);
      return;
    }
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = muted ? 0 : 0.055;
      this.master.connect(this.ctx.destination);

      // Soft warm fifth drone (D2 + A2) through a gentle lowpass filter
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      filter.connect(this.master);

      for (const freq of [73.42, 110.0]) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.value = 0.28;
        osc.connect(g);
        g.connect(filter);
        osc.start();
      }

      this.started = true;
      this.schedulePluck();
    } catch {
      // Ignore autoplay restrictions until next gesture
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      if (!muted && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.master.gain.setTargetAtTime(muted ? 0 : 0.055, this.ctx.currentTime, 0.25);
    }
  }

  private schedulePluck(): void {
    const delayMs = 2600 + Math.random() * 3400;
    this.pluckTimer = window.setTimeout(() => {
      if (!this.muted && this.ctx && this.master && this.ctx.state === 'running') {
        this.playLyreNote();
      }
      this.schedulePluck();
    }, delayMs);
    void this.pluckTimer;
  }

  private playLyreNote(): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const freq = this.scale[Math.floor(Math.random() * this.scale.length)];
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.24, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 2.5);
  }
}
