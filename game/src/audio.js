// audio.js — all sound for Solmar Bay, synthesized live with WebAudio.
// No audio files anywhere: every effect and every radio note is built from
// oscillators and filtered noise. The engine is created by a factory and
// stays silent until the player unlocks it with a gesture (the title
// screen button), because browsers refuse audio before user interaction.
//
// The loop module calls update() once per frame with the car's speed and
// whether a siren should be sounding; everything else is event driven.

const MPH_PER_MS = 2.23694;

// ---------------------------------------------------------------------------
// Radio stations. Each station is a small step sequencer: a tempo, a bass
// line, a chord pad / lead line and a percussion tick, all expressed as
// note tables so the loop can be scheduled ahead of the playhead.
// Frequencies are plain equal-tempered values in hertz.
// ---------------------------------------------------------------------------

const STATIONS = [
  {
    name: 'SOLMAR FM 98.6',
    frequency: '98.6',
    genre: 'Latin groove',
    bpm: 96,
    // A slow, warm Am - F - C - G stroll. Bass walks the roots, the lead
    // picks out a relaxed montuno-style figure, the shaker ticks on the
    // off-beats.
    bassNotes: [110.0, 110.0, 87.31, 87.31, 130.81, 130.81, 98.0, 98.0],
    leadNotes: [
      440.0, 523.25, 659.25, 523.25, 349.23, 440.0, 523.25, 392.0,
      440.0, 523.25, 659.25, 783.99, 659.25, 523.25, 440.0, 392.0,
    ],
    padChords: [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [261.63, 329.63, 392.0],
      [196.0, 246.94, 293.66],
    ],
    songs: [
      'Atardecer en el Malecón',
      'Brisa de Medianoche',
      'Ritmo del Barrio',
    ],
    leadWave: 'triangle',
    bassWave: 'sine',
  },
  {
    name: 'NEON WAVE 104.3',
    frequency: '104.3',
    genre: 'fast electronic beat',
    bpm: 128,
    // A driving minor-key synth line: fast eighth-note bass, a bright
    // square arpeggio on top, four-on-the-floor kick feel from the tick.
    bassNotes: [
      55.0, 55.0, 65.41, 55.0, 55.0, 82.41, 55.0, 73.42,
      55.0, 55.0, 65.41, 55.0, 98.0, 82.41, 73.42, 65.41,
    ],
    leadNotes: [
      440.0, 554.37, 659.25, 880.0, 659.25, 554.37, 440.0, 329.63,
      440.0, 554.37, 659.25, 880.0, 1108.7, 880.0, 659.25, 554.37,
    ],
    padChords: [
      [110.0, 130.81, 164.81],
      [98.0, 123.47, 146.83],
      [87.31, 110.0, 130.81],
      [98.0, 123.47, 146.83],
    ],
    songs: [
      'Luces de Neón',
      'Persecución Nocturna',
      'Circuito Cerrado',
    ],
    leadWave: 'square',
    bassWave: 'sawtooth',
  },
];

// Short melodic phrases for UI moments. Each entry is [frequency, beats].
const JINGLES = {
  missionComplete: [
    [523.25, 1], [659.25, 1], [783.99, 1], [1046.5, 2],
  ],
  missionFailed: [
    [392.0, 1], [329.63, 1], [261.63, 2],
  ],
  pickup: [
    [880.0, 0.5], [1174.7, 1],
  ],
  busted: [
    [311.13, 1], [311.13, 1], [233.08, 2],
  ],
  wasted: [
    [220.0, 1], [174.61, 1], [146.83, 3],
  ],
  levelUp: [
    [659.25, 0.5], [830.61, 0.5], [987.77, 1],
  ],
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let unlocked = false;
  let muted = false;

  // Engine hum nodes, built on unlock.
  let engineOsc = null;
  let engineSub = null;
  let engineFilter = null;
  let engineGain = null;

  // Siren nodes, built on unlock.
  let sirenOsc = null;
  let sirenLfo = null;
  let sirenGain = null;
  let sirenOn = false;

  // Radio scheduler state.
  let stationIndex = 0;
  let songIndex = 0;
  let radioTimer = null;
  let nextNoteTime = 0;
  let step = 0;
  let barsPlayed = 0;

  // A reusable white-noise buffer for gunshots, ticks and impacts.
  let noiseBuffer = null;

  function buildNoiseBuffer() {
    const length = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseBuffer = buffer;
  }

  function buildEngineHum() {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineSub = ctx.createOscillator();
    engineSub.type = 'square';
    engineSub.frequency.value = 28;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineFilter.Q.value = 2;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineSub.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(sfxBus);
    engineOsc.start();
    engineSub.start();
  }

  function buildSiren() {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 820;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(sfxBus);
    sirenOsc.start();
    sirenLfo.start();
  }

  // Schedule one short synth note on a bus at an exact time.
  function scheduleTone(freq, at, dur, type, peak, bus) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  // Schedule one short burst of filtered noise (hat tick, snare-ish snap).
  function scheduleNoise(at, dur, filterFreq, peak, bus) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  // One step of the radio sequencer: bass + lead + pad + tick.
  function scheduleStep(station, stepIndex, at) {
    const beat = 60 / station.bpm;
    const eighth = beat / 2;
    const bass = station.bassNotes[stepIndex % station.bassNotes.length];
    const lead = station.leadNotes[stepIndex % station.leadNotes.length];
    const bar = Math.floor(stepIndex / 16) % station.padChords.length;

    scheduleTone(bass, at, eighth * 0.9, station.bassWave, 0.16, musicBus);
    if (stepIndex % 2 === 0) {
      scheduleTone(lead, at, eighth * 0.9, station.leadWave, 0.05, musicBus);
    }
    if (stepIndex % 16 === 0) {
      for (const freq of station.padChords[bar]) {
        scheduleTone(freq, at, beat * 4, 'sine', 0.03, musicBus);
      }
    }
    // Off-beat shaker tick; the electronic station gets a busier hat.
    if (stepIndex % 2 === 1) {
      scheduleNoise(at, 0.05, stationIndex === 0 ? 6000 : 8000, 0.05, musicBus);
    }
  }

  // Look-ahead scheduler: keep notes queued a little ahead of playback.
  function radioTick() {
    if (!ctx || !unlocked) return;
    const station = STATIONS[stationIndex];
    const eighth = 60 / station.bpm / 2;
    while (nextNoteTime < ctx.currentTime + 0.15) {
      scheduleStep(station, step, nextNoteTime);
      nextNoteTime += eighth;
      step += 1;
      if (step % 64 === 0) {
        barsPlayed += 1;
        // A new song every eight bars keeps the station feeling alive.
        if (barsPlayed % 8 === 0) {
          songIndex = (songIndex + 1) % station.songs.length;
        }
      }
    }
  }

  function startRadio() {
    if (radioTimer !== null) return;
    nextNoteTime = ctx.currentTime + 0.1;
    step = 0;
    radioTimer = setInterval(radioTick, 40);
  }

  function stopRadio() {
    if (radioTimer !== null) {
      clearInterval(radioTimer);
      radioTimer = null;
    }
  }

  const engine = {
    // Must be called from a user gesture (the title screen button). Builds
    // the context and all persistent nodes, then starts the radio loop.
    unlock() {
      if (unlocked) return true;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        ctx = new AudioContext();
      } catch (err) {
        return false;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.5;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.8;
      sfxBus.connect(master);
      buildNoiseBuffer();
      buildEngineHum();
      buildSiren();
      unlocked = true;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      startRadio();
      return true;
    },

    isUnlocked() {
      return unlocked;
    },

    setMuted(value) {
      muted = Boolean(value);
      if (master) {
        master.gain.value = muted ? 0 : 0.9;
      }
      return muted;
    },

    toggleMute() {
      return engine.setMuted(!muted);
    },

    isMuted() {
      return muted;
    },

    // Called every frame by the game loop. speedMs is metres per second;
    // sirenActive is true while any police unit is chasing.
    update(speedMs, sirenActive) {
      if (!unlocked || !ctx) return;
      const speed = Math.max(0, speedMs || 0);
      const mph = speed * MPH_PER_MS;
      // Engine hum: pitch climbs with speed, volume fades in once rolling.
      const rpm = 55 + Math.min(mph, 140) * 1.6;
      engineOsc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.08);
      engineSub.frequency.setTargetAtTime(rpm / 2, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(
        300 + Math.min(mph, 140) * 9,
        ctx.currentTime,
        0.1,
      );
      const humLevel = speed > 0.5 ? 0.05 + Math.min(mph / 140, 1) * 0.05 : 0.02;
      engineGain.gain.setTargetAtTime(humLevel, ctx.currentTime, 0.1);
      // Siren: fade the two-tone wail in or out.
      if (sirenActive !== sirenOn) {
        sirenOn = Boolean(sirenActive);
        sirenGain.gain.setTargetAtTime(
          sirenOn ? 0.045 : 0,
          ctx.currentTime,
          0.25,
        );
      }
    },

    // A sharp crack: burst of noise through a lowpass, plus a low thump.
    playGunshot() {
      if (!unlocked || !ctx) return;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(sfxBus);
      src.start(now);
      src.stop(now + 0.2);
      scheduleTone(70, now, 0.12, 'sine', 0.35, sfxBus);
    },

    // A short blip for menu navigation and button presses.
    playClick() {
      if (!unlocked || !ctx) return;
      scheduleTone(880, ctx.currentTime, 0.07, 'square', 0.08, sfxBus);
    },

    // A little melodic phrase for mission moments. Unknown kinds fall
    // back to the pickup blip so a bad key never throws.
    playJingle(kind) {
      if (!unlocked || !ctx) return;
      const phrase = JINGLES[kind] || JINGLES.pickup;
      const now = ctx.currentTime;
      let at = now + 0.02;
      for (const [freq, beats] of phrase) {
        const dur = beats * 0.22;
        scheduleTone(freq, at, dur, 'triangle', 0.12, sfxBus);
        at += dur;
      }
    },

    // A dull thud for collisions and footsteps.
    playThud(strength) {
      if (!unlocked || !ctx) return;
      const peak = 0.1 + Math.min(Math.max(strength || 0.5, 0), 1) * 0.25;
      scheduleTone(55, ctx.currentTime, 0.15, 'sine', peak, sfxBus);
    },

    nextStation() {
      stationIndex = (stationIndex + 1) % STATIONS.length;
      songIndex = 0;
      step = 0;
      if (ctx && unlocked) {
        nextNoteTime = ctx.currentTime + 0.08;
      }
      return engine.getStation();
    },

    setStation(index) {
      const i = Number(index);
      if (Number.isInteger(i) && i >= 0 && i < STATIONS.length) {
        stationIndex = i;
        songIndex = 0;
        step = 0;
        if (ctx && unlocked) {
          nextNoteTime = ctx.currentTime + 0.08;
        }
      }
      return engine.getStation();
    },

    // What the HUD shows next to the speed: station name and song title.
    getStation() {
      const station = STATIONS[stationIndex];
      return {
        index: stationIndex,
        name: station.name,
        frequency: station.frequency,
        genre: station.genre,
        songTitle: station.songs[songIndex],
      };
    },

    getStationName() {
      return STATIONS[stationIndex].name;
    },

    getSongTitle() {
      return STATIONS[stationIndex].songs[songIndex];
    },

    // Tear down the scheduler and close the context (used on unload).
    dispose() {
      stopRadio();
      if (ctx) {
        ctx.close();
        ctx = null;
      }
      unlocked = false;
    },
  };

  return engine;
}
