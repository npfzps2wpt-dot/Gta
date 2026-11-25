// صوت اللعبة: مؤثرات + محرك + سارينة + موسيقى سينثويف مولّدة برمجياً (بدون ملفات)
export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    // ضوضاء بيضاء جاهزة
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // المحرك
    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'square';
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter);
    this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);
    this.engOsc.start();
    this.engOsc2.start();

    // السارينة
    this.sirOsc = ctx.createOscillator();
    this.sirOsc.type = 'triangle';
    this.sirOsc.frequency.value = 800;
    this.sirLfo = ctx.createOscillator();
    this.sirLfo.frequency.value = 1.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    this.sirLfo.connect(lfoGain);
    lfoGain.connect(this.sirOsc.frequency);
    this.sirGain = ctx.createGain();
    this.sirGain.gain.value = 0;
    this.sirOsc.connect(this.sirGain);
    this.sirGain.connect(this.master);
    this.sirOsc.start();
    this.sirLfo.start();

    // الموسيقى
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.2;
    this.bpm = 108;
    this._timer = setInterval(() => this._schedule(), 80);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.1);
  }

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.3) {
      this._playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 64;
      this.nextTime += stepDur;
    }
  }

  _note(freq, t, dur, type, vol, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _playStep(step, t) {
    const ctx = this.ctx;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    // Am F C G
    const roots = [55, 43.65, 65.41, 49];
    const triads = [
      [1, 1.1892, 1.4983],
      [1, 1.26, 1.4983],
      [1, 1.26, 1.4983],
      [1, 1.26, 1.4983],
    ];
    const minor = [true, false, false, false];
    const root = roots[bar];
    // باص
    if (s % 2 === 0) this._note(root * (s % 8 === 6 ? 2 : 1), t, 0.2, 'sawtooth', 0.5, 500);
    // أرابيجيو
    const tr = minor[bar] ? [1, 1.1892, 1.4983] : [1, 1.2599, 1.4983];
    const arp = [0, 1, 2, 1];
    const f = root * 4 * tr[arp[s % 4]] * (s >= 8 && s % 4 === 3 ? 2 : 1);
    this._note(f, t, 0.12, 'square', 0.16, 2200);
    // كيك
    if (s % 4 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.25);
    }
    // سنير + هات
    if (s === 4 || s === 12) this._noise(t, 0.14, 0.45, 1800, this.musicGain, 'bandpass');
    if (s % 2 === 1) this._noise(t, 0.04, 0.18, 7000, this.musicGain, 'highpass');
  }

  _noise(t, dur, vol, freq, dest, type = 'lowpass') {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest || this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  gun(kind = 0, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = kind === 2 ? 0.35 : kind === 1 ? 0.12 : 0.2;
    this._noise(t, dur, 0.7 * vol, kind === 2 ? 1500 : 3500);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(kind === 2 ? 120 : 220, t);
    o.frequency.exponentialRampToValueAtTime(40, t + dur);
    g.gain.setValueAtTime(0.6 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  explode(vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 1.2, 1.2 * vol, 600);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    g.gain.setValueAtTime(1.2 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 1);
  }

  crash(vol = 0.5) {
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, 0.25, Math.min(1, vol), 900);
  }

  punch() {
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, 0.1, 0.5, 400);
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.18);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.25);
      o.connect(g);
      g.connect(this.master);
      o.start(t + i * 0.07);
      o.stop(t + i * 0.07 + 0.3);
    });
  }

  horn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [400, 500].forEach((f) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.12, t);
      g.gain.setValueAtTime(0.12, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.4);
    });
  }

  engine(active, ratio) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const r = Math.min(1.2, Math.max(0, ratio));
    this.engOsc.frequency.setTargetAtTime(38 + r * 110, t, 0.05);
    this.engOsc2.frequency.setTargetAtTime(19 + r * 55, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(250 + r * 900, t, 0.05);
    this.engGain.gain.setTargetAtTime(active ? 0.1 + r * 0.08 : 0, t, 0.1);
  }

  siren(level) {
    if (!this.ctx) return;
    this.sirGain.gain.setTargetAtTime(Math.min(0.12, level * 0.12), this.ctx.currentTime, 0.2);
  }
}
