// Solmar Bay sound engine — every sound is synthesized live with Web Audio,
// so the game ships no audio files. UI blips, footsteps, the two-station
// radio, one shot per weapon, the coastal ambient hum and the two-tone
// police siren are all built here from oscillators and filtered noise.
import { CONFIG } from './config.js';

// The little bass riff the radio loops, one note per beat.
const RADIO_RIFF = [110, 130.8, 164.8, 196, 164.8, 130.8, 110, 98];
const RADIO_BEAT_MS = 250;
const RADIO_NOTE_SECONDS = 0.22;
const RADIO_NOTE_GAIN = 0.05;

// Two-tone siren: low note, high note, and how long each one lasts.
const SIREN_LOW_HZ = 700;
const SIREN_HIGH_HZ = 950;
const SIREN_STEP_MS = 400;
const SIREN_GAIN = 0.04;

export class AudioManager {
  constructor() {
    this.muted = false;
    this.ctx = null;
    this.ambientNode = null;
    this.initialized = false;
    // Which station the dial sits on, the timer that schedules its notes,
    // and the live nodes of the siren loop (null while the siren is quiet).
    this.radioStation = 0;
    this.radioTimer = null;
    this.sirenNodes = null;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.initialized = true;
      this.startAmbient();
      this.startRadio();
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

  // One short pitched blip: an oscillator that slides from one frequency
  // to another while its gain falls away to silence.
  _blip(wave, fromHz, toHz, seconds, volume) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(fromHz, now);
    osc.frequency.exponentialRampToValueAtTime(toHz, now + seconds);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(now + seconds);
  }

  // A burst of white noise that fades out over the given time.
  _noiseBurst(seconds, volume) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  playClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._blip('sine', 600, 800, 0.08, 0.15);
  }

  playJump() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._blip('triangle', 150, 350, 0.2, 0.2);
  }

  playFootstep() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._blip('square', 80, 30, 0.05, 0.08);
  }

  startAmbient() {
    if (!this.ctx) return;
    try {
      // Looping white noise through a low-pass filter reads as a soft
      // coastal hum — ocean and distant city traffic rolled into one.
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.02, this.ctx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      source.start();
      this.ambientNode = source;
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
    const wave = this.radioStation === 0 ? 'square' : 'triangle';
    const octave = this.radioStation === 0 ? 1 : 2;
    let step = 0;
    this.radioTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(
          RADIO_RIFF[step % RADIO_RIFF.length] * octave,
          this.ctx.currentTime
        );
        gain.gain.setValueAtTime(RADIO_NOTE_GAIN, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + RADIO_NOTE_SECONDS);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + RADIO_NOTE_SECONDS);
        step++;
      } catch (e) {
        // A missed radio note is not worth crashing the game over.
      }
    }, RADIO_BEAT_MS);
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
      if (kind === 'FISTS') {
        this._blip('sine', 90, 90, 0.06, 0.12);
      } else if (kind === '.38') {
        this._blip('square', 900, 200, 0.08, 0.25);
      } else if (kind === 'SMG') {
        this._blip('square', 1200, 1200, 0.04, 0.15);
      } else if (kind === '12G') {
        this._blip('sine', 120, 40, 0.25, 0.35);
        this._noiseBurst(0.1, 0.2);
      } else if (kind === 'AR-9') {
        this._blip('sawtooth', 700, 150, 0.12, 0.25);
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
      osc.frequency.setValueAtTime(SIREN_LOW_HZ, this.ctx.currentTime);
      gain.gain.setValueAtTime(SIREN_GAIN, this.ctx.currentTime);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      let high = false;
      const timer = setInterval(() => {
        if (!this.ctx) return;
        high = !high;
        osc.frequency.setValueAtTime(high ? SIREN_HIGH_HZ : SIREN_LOW_HZ, this.ctx.currentTime);
      }, SIREN_STEP_MS);
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
