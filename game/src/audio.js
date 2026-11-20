// WebAudio Synthesizer for Solmar Bay sound effects & ambient audio
import { CONFIG } from './config.js';

export class AudioManager {
  constructor() {
    this.muted = false;
    this.ctx = null;
    this.ambientNode = null;
    this.initialized = false;
    // Which radio station is tuned in, the timer that schedules its notes,
    // and the nodes of the police siren loop (null while the siren is off).
    this.radioStation = 0;
    this.radioTimer = null;
    this.sirenNodes = null;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initialized = true;
        this.startAmbient();
        this.startRadio();
      }
    } catch (e) {
      console.warn('WebAudio not supported:', e);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      if (this.muted && this.ctx.state === 'running') {
        this.ctx.suspend();
      } else if (!this.muted && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }
    return this.muted;
  }

  playClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playJump() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(350, this.ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playFootstep() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(80, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  startAmbient() {
    if (!this.ctx) return;
    try {
      // Gentle coastal ocean / city hum wind noise using pink/white noise + filter
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.02, this.ctx.currentTime);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      whiteNoise.start();
      this.ambientNode = whiteNoise;
    } catch (e) {
      console.warn('Ambient audio error:', e);
    }
  }

  // "SOLMAR FM 98.6" style label for the HUD radio display.
  currentStationName() {
    const station = CONFIG.RADIO[this.radioStation];
    return station.name + ' ' + station.freq;
  }

  // A tiny synthesized radio loop: a sunny bassline, one short note per beat.
  // Station 0 plays it on a square wave, station 1 an octave higher on triangle.
  startRadio() {
    this.stopRadio();
    if (!this.ctx) return;
    const bassline = [110, 130.8, 164.8, 196, 164.8, 130.8, 110, 98];
    const station = CONFIG.RADIO[this.radioStation];
    const wave = this.radioStation === 0 ? 'square' : 'triangle';
    const octave = this.radioStation === 0 ? 1 : 2;
    let step = 0;
    this.radioTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(bassline[step % bassline.length] * octave, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.22);
        step++;
      } catch (e) {
        // A missed radio note is not worth crashing the game over.
      }
    }, 250);
  }

  stopRadio() {
    if (this.radioTimer) {
      clearInterval(this.radioTimer);
      this.radioTimer = null;
    }
  }

  // Tune to the next station (wrapping around) and restart the loop on it.
  cycleRadio() {
    this.radioStation = (this.radioStation + 1) % CONFIG.RADIO.length;
    if (this.radioTimer) this.startRadio();
    return this.currentStationName();
  }

  // One short synthesized shot per weapon, each with its own character.
  playWeaponSound(kind) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      if (kind === 'FISTS') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + 0.06);
      } else if (kind === '.38') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + 0.08);
      } else if (kind === 'SMG') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + 0.04);
      } else if (kind === '12G') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + 0.25);
        const noiseLen = Math.floor(this.ctx.sampleRate * 0.1);
        const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen);
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuf;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        noise.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start();
      } else if (kind === 'AR-9') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + 0.12);
      }
    } catch (e) {
      console.warn('Weapon sound error:', e);
    }
  }

  // A quiet two-tone police siren loop; silent when the heat is off.
  startSiren() {
    if (this.sirenNodes || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      let high = false;
      const timer = setInterval(() => {
        if (!this.ctx) return;
        high = !high;
        osc.frequency.setValueAtTime(high ? 950 : 700, this.ctx.currentTime);
      }, 400);
      this.sirenNodes = { osc, gain, timer };
    } catch (e) {
      console.warn('Siren error:', e);
    }
  }

  stopSiren() {
    if (!this.sirenNodes) return;
    try {
      clearInterval(this.sirenNodes.timer);
      this.sirenNodes.osc.stop();
      this.sirenNodes.gain.disconnect();
    } catch (e) {
      // The siren may already be gone; nothing to clean up.
    }
    this.sirenNodes = null;
  }
}
