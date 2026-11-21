// Solmar Bay — entrypoint and game loop.
//
// Boots the renderer, builds the seeded city, spawns Rico, traffic and
// pedestrians, starts the radio, loads any save, and runs the frame loop.
// Owns the state machine: title, playing, paused, briefing, complete,
// busted, wasted. Draws the whole HUD on the overlay canvas with Canvas 2D.
//
// The one shared state object is built here and handed to the other modules.
// Positions are plain { x, z } (y is up, ground is y = 0), headings are
// radians, speeds are metres per second (the HUD converts to MPH).

import { createRenderer } from './three.js';
import { buildCity } from './city.js';
import { config } from './config.js';
import { createSeededRandom } from './random.js';
import {
  createCar,
  spawnParkedCars,
  spawnTrafficCar,
  updateTrafficCar,
  nearestCar,
  enterCar,
  exitCar,
  updateCar,
  getSpeedMph,
} from './vehicles.js';
import { advanceClock } from './world.js';
import { createPolice } from './police.js';
import { createPedestrians } from './pedestrians.js';
import { createMissions } from './missions.js';
import { createAudioEngine } from './audio.js';
import { createInput } from './input.js';
import { saveProgress, loadProgress, hasSave } from './save.js';
import { stageShot as runStageShot } from './shots.js';

const WEAPONS = ['FISTS', 'PISTOL', 'SMG', 'SHOTGUN', 'RIFLE'];
const WALK_SPEED = 4.0;
const RUN_SPEED = 7.6;
const TURN_SPEED = 2.6;
const NEW_GAME_MONEY = 250;
const START_HOUR = 17.5;
const SAVE_KEY = 'solmar-bay-save-v1';
const WORLD_SPAN = 460;

// ---------------------------------------------------------------------------
// Rico — a small humanoid figure built from boxes: teal jacket, cap, dark
// trousers. Legs and arms swing with a walk phase while he moves.
// ---------------------------------------------------------------------------
function buildPlayerRico() {
  const group = new THREE.Group();

  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x17807a });
  const trousers = new THREE.MeshLambertMaterial({ color: 0x23232e });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), jacket);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);

  const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), capMat);
  capTop.position.y = 1.79;
  group.add(capTop);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.18), capMat);
  brim.position.set(0, 1.74, 0.22);
  group.add(brim);

  function limb(width, height, depth, material, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.y = -height / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }

  const armL = limb(0.14, 0.58, 0.16, jacket, -0.34, 1.38);
  const armR = limb(0.14, 0.58, 0.16, jacket, 0.34, 1.38);
  const legL = limb(0.18, 0.8, 0.2, trousers, -0.14, 0.82);
  const legR = limb(0.18, 0.8, 0.2, trousers, 0.14, 0.82);

  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.32), shoeMat);
  shoeL.position.set(0, -0.8, 0.05);
  legL.add(shoeL);
  const shoeR = shoeL.clone();
  legR.add(shoeR);

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  return { group, armL, armR, legL, legR };
}

// ---- Save glue: save.js owns the localStorage snapshot. The snapshot
// shape is money / respect / day / clockHour / clockMinute / upgrades /
// completedJobs; the loop maps its flat state onto that shape.
function readSave() {
  try {
    return loadProgress();
  } catch (err) {
    return null;
  }
}

function writeSave(state) {
  const data = {
    money: state.money,
    respect: state.respect,
    day: state.day,
    clockHour: Math.floor(state.hour),
    clockMinute: Math.floor(state.minute),
    upgrades: {
      engine: Boolean(state.upgrades.engine),
      armour: Boolean(state.upgrades.armour),
      nitro: Boolean(state.upgrades.nitro),
      respray: state.upgrades.respray || null,
    },
    completedJobs: state.completedJobs || [],
  };
  try {
    saveProgress(data);
  } catch (err) {
    // Storage can be unavailable; the game keeps running without a save.
  }
}

function applySave(state, data) {
  if (!data) return;
  if (typeof data.money === 'number') state.money = data.money;
  if (typeof data.respect === 'number') state.respect = data.respect;
  if (typeof data.day === 'number') state.day = data.day;
  if (typeof data.clockHour === 'number') state.hour = data.clockHour;
  if (typeof data.clockMinute === 'number') state.minute = data.clockMinute;
  if (data.upgrades) {
    state.upgrades = {
      engine: Boolean(data.upgrades.engine),
      armour: Boolean(data.upgrades.armour),
      nitro: Boolean(data.upgrades.nitro),
      respray: data.upgrades.respray || null,
    };
  }
  if (Array.isArray(data.completedJobs)) state.completedJobs = data.completedJobs;
  state.jobsDone = (state.completedJobs || []).length;
}

// ---------------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------------
async function boot() {
  const canvas = document.getElementById('game');
  const hudCanvas = document.getElementById('hud');
  const hud = hudCanvas ? hudCanvas.getContext('2d') : null;

  const renderer = createRenderer(canvas);
  const scene = renderer.scene;

  const rng = createSeededRandom(config.worldSeed);
  const city = buildCity(scene, rng);
  const landmarks = (city && city.landmarks) || {};
  const safehouse = landmarks.safehouse || { x: -95, z: 57 };
  // Spawn on the road just east of the safehouse, facing south.
  const spawn = { x: -76, z: safehouse.z, heading: 0 };

  // The one shared state object. Every module reads or updates through it.
  // `world` is an alias of the state itself, so modules that expect a
  // nested world object (shots, missions, police) read the same numbers.
  const state = {
    screen: 'title',
    mode: 'title',
    cameraMode: 'title',
    day: 1,
    hour: START_HOUR,
    minute: 30,
    totalMinutes: 17 * 60 + 30,
    money: NEW_GAME_MONEY,
    respect: 0,
    armour: 0,
    health: 100,
    wanted: 0,
    jobsDone: 0,
    completedJobs: [],
    upgrades: {},
    weaponSlot: 1,
    muted: false,
    busted: false,
    gunfireAt: -100,
    lastWantedRaiseAt: -100,
    elapsed: 0,
    targetsDestroyed: 0,
    shotStaged: null,
    stagedSpeed: 0,
    stagedMission: null,
    player: null,
    mission: null,
    police: null,
    audio: null,
    traffic: [],
    movingTraffic: [],
    pedestrians: null,
    city,
  };
  state.world = state;

  const rico = buildPlayerRico();
  scene.add(rico.group);
  const player = {
    figure: rico,
    group: rico.group,
    mesh: rico.group,
    position: rico.group.position,
    heading: spawn.heading || 0,
    speed: 0,
    walkPhase: 0,
    vehicle: null,
    driving: null,
    currentVehicle: null,
    onFoot: true,
    weaponSlots: WEAPONS.map((name) => ({ name })),
    activeWeaponSlot: 1,
  };
  player.group.position.set(spawn.x, 0, spawn.z);
  player.group.rotation.y = player.heading;
  state.player = player;

  // Parked cars along the roads, the street-life module (pedestrians plus
  // its own ambient traffic), a few moving cars from the vehicles module,
  // the police, and the mission tracker fed with the real landmark spots.
  state.traffic = spawnParkedCars(scene, city.roads, 14, rng.next);
  state.pedestrians = createPedestrians(scene, city.roads, rng);
  state.movingTraffic = [
    spawnTrafficCar(scene, city.roads, rng.next),
    spawnTrafficCar(scene, city.roads, rng.next),
    spawnTrafficCar(scene, city.roads, rng.next),
  ];
  state.police = createPolice(scene, state, rng);
  state.mission = createMissions(state);
  state.mission.setLandmarks({
    safehouse: landmarks.safehouse || { x: -95, z: 57 },
    garage: landmarks.garage || { x: 19, z: -57 },
    pier: landmarks.pier || { x: -242, z: 0 },
    beach: landmarks.beach || { x: -214, z: 20 },
    malecon: landmarks.malecon || { x: -178, z: 0 },
    docks: { x: 114, z: -114 },
    market: { x: 0, z: -38 },
    plaza: { x: 0, z: 0 },
    northGate: { x: 0, z: -152 },
    marina: { x: -178, z: -76 },
    hotel: { x: 76, z: -76 },
  });

  const audio = createAudioEngine();
  state.audio = audio;
  const input = createInput();

  // A spare sedan parked near the safehouse so the player can drive quickly.
  let starterCar = null;
  try {
    starterCar = createCar('sedan', undefined, spawn.x + 6, spawn.z + 4, Math.PI / 2);
    if (starterCar) {
      starterCar.parked = true;
      scene.add(starterCar.mesh);
      state.traffic.push(starterCar);
    }
  } catch (err) {
    starterCar = null;
  }

  // ---- Tracers for gunfire: short-lived lines that fade within a blink.
  const tracers = [];
  function fireTracer(from, heading) {
    const range = 26;
    const end = new THREE.Vector3(
      from.x + Math.sin(heading) * range,
      1.3,
      from.z + Math.cos(heading) * range
    );
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, 1.3, from.z),
      end,
    ]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true })
    );
    scene.add(line);
    tracers.push({ line, ttl: 0.09 });
  }
  function updateTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const tracer = tracers[i];
      tracer.ttl -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.ttl / 0.09);
      if (tracer.ttl <= 0) {
        scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        tracer.line.material.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  // ---- Overlays ------------------------------------------------------------
  const panels = {};
  for (const id of [
    'title-screen',
    'pause-menu',
    'briefing',
    'mission-complete',
    'busted-screen',
    'wasted-screen',
  ]) {
    panels[id] = document.getElementById(id);
  }
  function showOnly(id) {
    for (const key of Object.keys(panels)) {
      if (!panels[key]) continue;
      const show = key === id;
      panels[key].hidden = !show;
      panels[key].style.display = show ? 'flex' : 'none';
    }
  }
  function hideAllPanels() {
    for (const key of Object.keys(panels)) {
      if (!panels[key]) continue;
      panels[key].hidden = true;
      panels[key].style.display = 'none';
    }
  }
  function setScreen(next) {
    state.screen = next;
    if (next === 'title') showOnly('title-screen');
    else if (next === 'paused') showOnly('pause-menu');
    else if (next === 'briefing') showOnly('briefing');
    else if (next === 'complete') showOnly('mission-complete');
    else if (next === 'busted') showOnly('busted-screen');
    else if (next === 'wasted') showOnly('wasted-screen');
    else hideAllPanels();
  }

  function fillBriefing() {
    const tracker = state.mission;
    const job = tracker && tracker.getCurrentJob ? tracker.getCurrentJob() : null;
    const titleEl = document.getElementById('briefing-title');
    const bodyEl = document.getElementById('briefing-body');
    const payoutEl = document.getElementById('briefing-payout');
    if (titleEl) {
      const index = tracker && tracker.getJobIndex ? tracker.getJobIndex() + 1 : 1;
      titleEl.textContent = job ? `JOB ${index} — ${job.title.toUpperCase()}` : 'New Job';
    }
    if (bodyEl) {
      const lines = (tracker && tracker.getBriefing ? tracker.getBriefing(job) : []) || [];
      bodyEl.textContent = lines.length > 0
        ? lines.map((line) => `${line.speaker}: ${line.line}`).join(' ')
        : 'Rico, we have work.';
    }
    if (payoutEl && job) {
      payoutEl.textContent = `Payout: $${job.payout.toLocaleString('en-US')}  •  Respect +${job.respect}`;
    }
  }

  function fillComplete() {
    const tracker = state.mission;
    const job = tracker && tracker.getCurrentJob ? tracker.getCurrentJob() : null;
    const bodyEl = document.getElementById('complete-body');
    const payoutEl = document.getElementById('complete-payout');
    if (bodyEl) {
      bodyEl.textContent = job
        ? `${job.title} — clean run. The crew is talking about you.`
        : 'Clean run. The crew is talking about you.';
    }
    if (payoutEl && job) {
      payoutEl.textContent = `+$${job.payout.toLocaleString('en-US')}  •  Respect +${job.respect}`;
    }
  }

  // Start the next unplayed job and show its briefing, or free-roam when
  // the story is done.
  function beginNextJob() {
    const tracker = state.mission;
    if (!tracker || !tracker.startNextJob) {
      setScreen('playing');
      return;
    }
    const job = tracker.startNextJob();
    if (job) {
      fillBriefing();
      setScreen('briefing');
    } else {
      setScreen('playing');
    }
  }

  function startNewGame() {
    state.day = 1;
    state.hour = START_HOUR;
    state.minute = 30;
    state.totalMinutes = 17 * 60 + 30;
    state.money = NEW_GAME_MONEY;
    state.respect = 0;
    state.armour = 0;
    state.health = 100;
    state.wanted = 0;
    state.jobsDone = 0;
    state.completedJobs = [];
    state.upgrades = {};
    state.weaponSlot = 1;
    state.activeWeaponSlot = 1;
    player.activeWeaponSlot = 1;
    state.busted = false;
    state.targetsDestroyed = 0;
    state.stagedMission = null;
    if (player.vehicle) {
      exitCar(player);
    }
    player.vehicle = null;
    player.driving = null;
    player.currentVehicle = null;
    player.onFoot = true;
    player.group.position.set(spawn.x, 0, spawn.z);
    player.heading = spawn.heading || 0;
    player.group.visible = true;
    if (state.mission && state.mission.reset) state.mission.reset();
    if (state.police && state.police.reset) state.police.reset();
    renderer.snapChaseCamera(player, 'foot');
    renderer.setTimeOfDay(state.hour);
    try {
      audio.unlock();
    } catch (err) {
      // Audio starts on user gesture; a failure here must not block play.
    }
    beginNextJob();
  }

  function respawn() {
    state.health = 100;
    state.armour = 0;
    state.wanted = 0;
    state.busted = false;
    state.money = Math.max(0, Math.floor(state.money * 0.9));
    if (player.vehicle) {
      exitCar(player);
    }
    player.vehicle = null;
    player.driving = null;
    player.currentVehicle = null;
    player.onFoot = true;
    player.group.visible = true;
    player.group.position.set(spawn.x, 0, spawn.z);
    player.heading = spawn.heading || 0;
    if (state.police && state.police.reset) state.police.reset();
    renderer.snapChaseCamera(player, 'foot');
    setScreen('playing');
  }

  // ---- Title / menu wiring -------------------------------------------------
  const saved = readSave();
  const continueBtn = document.getElementById('btn-continue');
  if (continueBtn) {
    continueBtn.style.display = hasSave() ? 'block' : 'none';
    continueBtn.addEventListener('click', () => {
      applySave(state, saved);
      player.group.position.set(spawn.x, 0, spawn.z);
      player.heading = spawn.heading || 0;
      player.group.visible = true;
      if (state.mission && state.mission.reset) state.mission.reset();
      renderer.snapChaseCamera(player, 'foot');
      renderer.setTimeOfDay(state.hour);
      try {
        audio.unlock();
      } catch (err) {
        // See startNewGame.
      }
      // Resume at the first job not yet finished, so a continued game
      // does not replay jobs already paid out.
      const tracker = state.mission;
      const nextIndex = (state.completedJobs || []).length;
      if (tracker && tracker.startJob && nextIndex < 8) {
        const job = tracker.startJob(nextIndex);
        if (job) {
          fillBriefing();
          setScreen('briefing');
          return;
        }
      }
      setScreen('playing');
    });
  }
  const newGameBtn = document.getElementById('btn-new-game');
  if (newGameBtn) newGameBtn.addEventListener('click', startNewGame);
  const resumeBtn = document.getElementById('btn-resume');
  if (resumeBtn) resumeBtn.addEventListener('click', () => setScreen('playing'));
  const quitBtn = document.getElementById('btn-quit-title');
  if (quitBtn) {
    quitBtn.addEventListener('click', () => {
      writeSave(state);
      // A save now exists, so the title screen must offer Continue.
      if (continueBtn) continueBtn.style.display = hasSave() ? 'block' : 'none';
      setScreen('title');
    });
  }
  const startJobBtn = document.getElementById('btn-briefing-go');
  if (startJobBtn) startJobBtn.addEventListener('click', () => setScreen('playing'));
  const completeBtn = document.getElementById('btn-complete-continue');
  if (completeBtn) completeBtn.addEventListener('click', beginNextJob);
  const bustedBtn = document.getElementById('btn-busted-retry');
  if (bustedBtn) bustedBtn.addEventListener('click', respawn);
  const wastedBtn = document.getElementById('btn-wasted-retry');
  if (wastedBtn) wastedBtn.addEventListener('click', respawn);

  window.addEventListener('resize', () => {
    renderer.resize();
    sizeHud();
  });

  function sizeHud() {
    if (!hudCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    hudCanvas.width = Math.floor(window.innerWidth * dpr);
    hudCanvas.height = Math.floor(window.innerHeight * dpr);
    hudCanvas.style.width = `${window.innerWidth}px`;
    hudCanvas.style.height = `${window.innerHeight}px`;
    if (hud) hud.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeHud();

  function updatePlayerOnFoot(dt) {
    const running = input.isHeld('run');
    const speed = running ? RUN_SPEED : WALK_SPEED;
    let moving = false;
    if (input.isHeld('left')) {
      player.heading += TURN_SPEED * dt;
    }
    if (input.isHeld('right')) {
      player.heading -= TURN_SPEED * dt;
    }
    if (input.isHeld('forward')) {
      player.group.position.x += Math.sin(player.heading) * speed * dt;
      player.group.position.z += Math.cos(player.heading) * speed * dt;
      player.speed = speed;
      moving = true;
    } else if (input.isHeld('back')) {
      player.group.position.x -= Math.sin(player.heading) * speed * 0.55 * dt;
      player.group.position.z -= Math.cos(player.heading) * speed * 0.55 * dt;
      player.speed = speed * 0.55;
      moving = true;
    } else {
      player.speed = 0;
    }
    player.group.rotation.y = player.heading;
    if (moving) {
      player.walkPhase += dt * speed * 1.9;
      const swing = Math.sin(player.walkPhase) * 0.65;
      rico.legL.rotation.x = swing;
      rico.legR.rotation.x = -swing;
      rico.armL.rotation.x = -swing * 0.8;
      rico.armR.rotation.x = swing * 0.8;
    } else {
      rico.legL.rotation.x *= 0.8;
      rico.legR.rotation.x *= 0.8;
      rico.armL.rotation.x *= 0.8;
      rico.armR.rotation.x *= 0.8;
    }
  }

  function updateShooting() {
    if (!input.wasPressed('shoot')) return;
    if (player.vehicle) return;
    if (state.weaponSlot === 0) return;
    fireTracer(player.group.position, player.heading);
    state.gunfireAt = state.elapsed;
    state.targetsDestroyed += 1;
    try {
      audio.playGunshot();
    } catch (err) {
      // Sound is never fatal.
    }
    try {
      if (state.pedestrians && state.pedestrians.triggerFlee) {
        state.pedestrians.triggerFlee(player.group.position);
      }
    } catch (err) {
      // Pedestrians are ambient.
    }
    if (state.elapsed - state.lastWantedRaiseAt > 4) {
      try {
        if (state.police && state.police.reportCrime) state.police.reportCrime('shooting');
      } catch (err) {
        state.wanted = Math.min(5, state.wanted + 1);
      }
      state.lastWantedRaiseAt = state.elapsed;
    }
  }

  function updateEnterExit() {
    if (!input.wasPressed('enterExit')) return;
    if (player.vehicle) {
      exitCar(player);
      player.vehicle = null;
      renderer.snapChaseCamera(player, 'foot');
    } else {
      const car = nearestCar(player.position, state.traffic, 3.6);
      if (car) {
        const wasParked = car.parked;
        enterCar(player, car);
        player.vehicle = car;
        player.speed = 0;
        renderer.snapChaseCamera(car, 'drive');
        if (wasParked) {
          try {
            if (state.police && state.police.reportCrime) state.police.reportCrime('stealing');
          } catch (err) {
            // Wanted level is advisory here.
          }
        }
      }
    }
  }

  function updatePlayerDriving(dt) {
    const car = player.vehicle;
    const steer = (input.isHeld('left') ? 1 : 0) - (input.isHeld('right') ? 1 : 0);
    updateCar(car, dt, {
      throttle: input.isHeld('forward'),
      brake: input.isHeld('back'),
      steer,
      nitro: input.isHeld('run'),
    });
    player.group.position.set(car.position.x, 0, car.position.z);
    player.heading = car.heading || player.heading;
    player.speed = Math.abs(car.speed || 0);
    if (state.shotStaged === 'play') {
      // The staged chase holds its screenshot speed instead of slowing
      // down under drag while the driver holds no pedal.
      car.speed = state.stagedSpeed;
      player.speed = state.stagedSpeed;
    }
  }

  // ---- HUD -----------------------------------------------------------------
  function roundRectPath(x, y, w, h, r) {
    hud.beginPath();
    hud.moveTo(x + r, y);
    hud.arcTo(x + w, y, x + w, y + h, r);
    hud.arcTo(x + w, y + h, x, y + h, r);
    hud.arcTo(x, y + h, x, y, r);
    hud.arcTo(x, y, x + w, y, r);
    hud.closePath();
  }

  function drawStars(x, y, wanted) {
    hud.font = 'bold 22px system-ui, sans-serif';
    for (let i = 0; i < 5; i += 1) {
      hud.fillStyle = i < wanted ? '#ffd23f' : 'rgba(255,255,255,0.35)';
      hud.fillText('★', x + i * 26, y);
    }
  }

  // One line for the top-left job tracker and the minimap marker: the
  // staged screenshot objective when a shot set one, otherwise the live
  // mission tracker's current objective and its distance.
  function getObjectiveLine() {
    if (state.stagedMission) {
      return {
        text: state.stagedMission.objective || state.stagedMission.title || '',
        distance: state.stagedMission.markerDistance,
        marker: null,
      };
    }
    const tracker = state.mission;
    if (!tracker || !tracker.getObjectiveText) return null;
    let marker = null;
    let distance = null;
    try {
      marker = tracker.getMarkerPosition({ playerPosition: player.position });
      distance = tracker.getMarkerDistance({ playerPosition: player.position });
    } catch (err) {
      marker = null;
      distance = null;
    }
    return { text: tracker.getObjectiveText(), distance, marker };
  }

  function drawMinimap(cx, cy, radius) {
    hud.save();
    hud.beginPath();
    hud.arc(cx, cy, radius, 0, Math.PI * 2);
    hud.clip();
    hud.fillStyle = 'rgba(8, 14, 26, 0.82)';
    hud.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    const scale = (radius * 2) / WORLD_SPAN;
    const toMapX = (wx) => cx + wx * scale;
    const toMapY = (wz) => cy + wz * scale;

    hud.strokeStyle = 'rgba(220, 225, 235, 0.55)';
    hud.lineWidth = 2;
    const roads = city.roads;
    const segments = Array.isArray(roads) ? roads : [];
    for (const road of segments) {
      hud.beginPath();
      if (road.start && road.end) {
        hud.moveTo(toMapX(road.start.x), toMapY(road.start.z));
        hud.lineTo(toMapX(road.end.x), toMapY(road.end.z));
      } else if (typeof road.x1 === 'number') {
        hud.moveTo(toMapX(road.x1), toMapY(road.z1));
        hud.lineTo(toMapX(road.x2), toMapY(road.z2));
      } else if (Array.isArray(road.points)) {
        road.points.forEach((point, i) => {
          if (i === 0) hud.moveTo(toMapX(point.x), toMapY(point.z));
          else hud.lineTo(toMapX(point.x), toMapY(point.z));
        });
      }
      hud.stroke();
    }

    const objective = getObjectiveLine();
    if (objective && objective.marker) {
      hud.fillStyle = '#ff4d8d';
      const mx = toMapX(objective.marker.x);
      const my = toMapY(objective.marker.z);
      hud.beginPath();
      hud.moveTo(mx, my - 6);
      hud.lineTo(mx + 5, my);
      hud.lineTo(mx, my + 6);
      hud.lineTo(mx - 5, my);
      hud.closePath();
      hud.fill();
    }

    const units = state.police && state.police.getUnits ? state.police.getUnits() : [];
    hud.fillStyle = '#ff3b30';
    for (const unit of units) {
      const pos = unit.mesh ? unit.mesh.position : unit.position;
      if (!pos) continue;
      hud.beginPath();
      hud.arc(toMapX(pos.x), toMapY(pos.z), 3, 0, Math.PI * 2);
      hud.fill();
    }

    const px = toMapX(player.group.position.x);
    const py = toMapY(player.group.position.z);
    hud.save();
    hud.translate(px, py);
    hud.rotate(-player.heading);
    hud.fillStyle = '#ffffff';
    hud.beginPath();
    hud.moveTo(0, -7);
    hud.lineTo(5, 6);
    hud.lineTo(-5, 6);
    hud.closePath();
    hud.fill();
    hud.restore();

    hud.restore();
    hud.strokeStyle = 'rgba(255,255,255,0.85)';
    hud.lineWidth = 2;
    hud.beginPath();
    hud.arc(cx, cy, radius, 0, Math.PI * 2);
    hud.stroke();
  }

  function drawHud() {
    if (!hud) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    hud.clearRect(0, 0, width, height);
    if (state.screen === 'title') return;

    hud.textBaseline = 'alphabetic';

    // Top right: money, clock, wanted stars.
    hud.textAlign = 'right';
    hud.fillStyle = 'rgba(0,0,0,0.35)';
    hud.font = 'bold 30px system-ui, sans-serif';
    hud.fillText(`$${state.money.toLocaleString('en-US')}`, width - 20, 44);
    hud.fillStyle = '#ffffff';
    hud.fillText(`$${state.money.toLocaleString('en-US')}`, width - 22, 42);
    const hh = String(Math.floor(state.hour)).padStart(2, '0');
    const mm = String(Math.floor(state.minute)).padStart(2, '0');
    hud.font = '600 17px system-ui, sans-serif';
    hud.fillStyle = '#ffe9c9';
    hud.fillText(`DAY ${state.day}  ${hh}:${mm}`, width - 22, 68);
    hud.textAlign = 'left';
    drawStars(width - 152, 96, state.wanted);

    // Top left: current job objective and marker distance.
    const objective = getObjectiveLine();
    hud.textAlign = 'left';
    hud.font = 'bold 13px system-ui, sans-serif';
    hud.fillStyle = '#ffd23f';
    hud.fillText('CURRENT JOB', 22, 34);
    hud.font = '600 18px system-ui, sans-serif';
    hud.fillStyle = '#ffffff';
    const objectiveText = objective ? objective.text : 'Free roam — find Lena for work.';
    hud.fillText(objectiveText, 22, 58);
    if (objective && typeof objective.distance === 'number') {
      hud.font = '600 15px system-ui, sans-serif';
      hud.fillStyle = '#ff8fb8';
      hud.fillText(`◈ ${Math.round(objective.distance)}m`, 22, 82);
    }

    // Bottom left: five weapon slots, active one highlighted.
    const slotSize = 46;
    const slotGap = 8;
    const slotsY = height - slotSize - 18;
    for (let i = 0; i < WEAPONS.length; i += 1) {
      const x = 22 + i * (slotSize + slotGap);
      const active = i === state.weaponSlot;
      hud.fillStyle = active ? 'rgba(255, 210, 63, 0.9)' : 'rgba(10, 16, 28, 0.72)';
      roundRectPath(x, slotsY, slotSize, slotSize, 7);
      hud.fill();
      hud.strokeStyle = active ? '#ffd23f' : 'rgba(255,255,255,0.35)';
      hud.lineWidth = active ? 2.5 : 1.5;
      roundRectPath(x, slotsY, slotSize, slotSize, 7);
      hud.stroke();
      hud.fillStyle = active ? '#1a1a1a' : '#ffffff';
      hud.font = 'bold 11px system-ui, sans-serif';
      hud.textAlign = 'center';
      hud.fillText(WEAPONS[i], x + slotSize / 2, slotsY + 20);
      hud.font = '600 11px system-ui, sans-serif';
      hud.fillText(String(i + 1), x + slotSize / 2, slotsY + 37);
    }
    hud.textAlign = 'left';

    // Bottom right: round minimap, speed and radio beside it.
    const mapRadius = 76;
    const mapCx = width - mapRadius - 24;
    const mapCy = height - mapRadius - 24;
    drawMinimap(mapCx, mapCy, mapRadius);
    const speedMph = Math.round(getSpeedMph(player.vehicle) || player.speed * 2.23694);
    hud.textAlign = 'right';
    hud.fillStyle = '#ffffff';
    hud.font = 'bold 34px system-ui, sans-serif';
    hud.fillText(`${speedMph}`, mapCx - mapRadius - 18, mapCy - 6);
    hud.font = '600 15px system-ui, sans-serif';
    hud.fillStyle = '#ffe9c9';
    hud.fillText('MPH', mapCx - mapRadius - 18, mapCy + 16);
    let station = { name: 'SOLMAR FM 98.6', songTitle: '' };
    try {
      if (audio && audio.getStation) station = audio.getStation();
    } catch (err) {
      // The radio label is advisory.
    }
    hud.font = '600 15px system-ui, sans-serif';
    hud.fillStyle = '#7fe7d2';
    hud.fillText(`♪ ${station.name}`, mapCx - mapRadius - 18, mapCy + 42);
    if (station.songTitle) {
      hud.font = '500 12px system-ui, sans-serif';
      hud.fillStyle = 'rgba(255,255,255,0.75)';
      hud.fillText(station.songTitle, mapCx - mapRadius - 18, mapCy + 60);
    }
    hud.textAlign = 'left';

    // Centre-right: police dispatch panel.
    if (state.wanted > 0) {
      const panelX = width - 308;
      const panelY = Math.round(height * 0.3);
      const panelW = 284;
      let dispatch = [];
      try {
        dispatch = (state.police && state.police.getDispatch ? state.police.getDispatch() : []) || [];
      } catch (err) {
        dispatch = [];
      }
      const rows = dispatch.slice(0, 5);
      const panelH = 34 + rows.length * 22 + 10;
      hud.fillStyle = 'rgba(10, 16, 28, 0.78)';
      roundRectPath(panelX, panelY, panelW, panelH, 8);
      hud.fill();
      hud.strokeStyle = 'rgba(255, 80, 80, 0.7)';
      hud.lineWidth = 1.5;
      roundRectPath(panelX, panelY, panelW, panelH, 8);
      hud.stroke();
      hud.fillStyle = '#ff6b6b';
      hud.font = 'bold 13px system-ui, sans-serif';
      hud.fillText('POLICE DISPATCH', panelX + 12, panelY + 22);
      hud.font = '500 13px system-ui, sans-serif';
      hud.fillStyle = '#ffffff';
      rows.forEach((unit, i) => {
        const label = unit.callSign || unit.label || `UNIT ${i + 1}`;
        const distance = typeof unit.distance === 'number' ? `${Math.round(unit.distance)}m` : '';
        const tactic = unit.tactic || 'PURSUIT';
        hud.fillText(`${label}  ·  ${distance}  ·  ${tactic}`, panelX + 12, panelY + 46 + i * 22);
      });
      if (rows.length === 0) {
        hud.fillText('Units responding…', panelX + 12, panelY + 46);
      }
    }

    // Bottom centre: respect meter and armour/health bars.
    const barW = 230;
    const barX = (width - barW) / 2;
    const barY = height - 58;
    hud.font = 'bold 11px system-ui, sans-serif';
    hud.fillStyle = '#7fe7d2';
    hud.fillText('RESPECT', barX, barY - 6);
    hud.fillStyle = 'rgba(10, 16, 28, 0.72)';
    roundRectPath(barX, barY, barW, 8, 4);
    hud.fill();
    hud.fillStyle = '#2dd4bf';
    roundRectPath(barX, barY, barW * Math.min(1, state.respect / 100), 8, 4);
    hud.fill();
    hud.fillStyle = '#9db8d2';
    hud.fillText('ARMOUR', barX, barY + 26);
    hud.fillStyle = 'rgba(10, 16, 28, 0.72)';
    roundRectPath(barX, barY + 32, barW, 8, 4);
    hud.fill();
    hud.fillStyle = '#7ea6c9';
    roundRectPath(barX, barY + 32, barW * Math.min(1, state.armour / 100), 8, 4);
    hud.fill();
    hud.fillStyle = '#ff8a7a';
    hud.fillText('HEALTH', barX, barY + 58);
    hud.fillStyle = 'rgba(10, 16, 28, 0.72)';
    roundRectPath(barX, barY + 64, barW, 8, 4);
    hud.fill();
    hud.fillStyle = state.health > 30 ? '#58d68d' : '#ff5a4d';
    roundRectPath(barX, barY + 64, barW * Math.max(0, state.health / 100), 8, 4);
    hud.fill();

    // Crosshair while on foot with a gun out.
    if (!player.vehicle && state.weaponSlot > 0 && state.screen === 'playing') {
      hud.strokeStyle = 'rgba(255,255,255,0.9)';
      hud.lineWidth = 2;
      const cx = width / 2;
      const cy = height / 2;
      hud.beginPath();
      hud.moveTo(cx - 9, cy);
      hud.lineTo(cx + 9, cy);
      hud.moveTo(cx, cy - 9);
      hud.lineTo(cx, cy + 9);
      hud.stroke();
    }
  }

  // ---- Mission phase watcher ------------------------------------------------
  let lastMissionStatus = state.mission ? state.mission.getStatus() : 'idle';
  function watchMissions() {
    const tracker = state.mission;
    if (!tracker || !tracker.getStatus) return;
    const status = tracker.getStatus();
    if (status === lastMissionStatus) return;
    if (status === 'complete') {
      const job = tracker.getCurrentJob ? tracker.getCurrentJob() : null;
      if (job && !(state.completedJobs || []).includes(job.id)) {
        state.completedJobs.push(job.id);
      }
      state.jobsDone = (state.completedJobs || []).length;
      fillComplete();
      try {
        audio.playJingle('missionComplete');
      } catch (err) {
        // Sound is never fatal.
      }
      writeSave(state);
      setScreen('complete');
    } else if (status === 'failed') {
      // Restart the same job with a fresh briefing; a bust or waste still
      // takes over the screen later in the same frame.
      const index = tracker.getJobIndex ? tracker.getJobIndex() : -1;
      if (index >= 0 && tracker.startJob) {
        tracker.startJob(index);
        fillBriefing();
        setScreen('briefing');
      } else {
        setScreen('playing');
      }
    }
    lastMissionStatus = status;
  }

  // ---- Shot staging ----------------------------------------------------------
  async function stageShot(name) {
    const tracker = state.mission;
    let staged = null;
    try {
      staged = runStageShot(state);
    } catch (err) {
      staged = null;
    }
    // shots.js writes a plain mission object over the tracker; keep the
    // tracker and remember the staged objective for the HUD instead.
    if (state.mission && state.mission !== tracker) {
      const plain = state.mission;
      state.stagedMission = {
        title: plain.title || '',
        objective: plain.objective || '',
        markerDistance: plain.markerDistance,
      };
    }
    state.mission = tracker;
    if (!staged) return false;
    state.shotStaged = staged;
    if (typeof player.activeWeaponSlot === 'number') {
      state.weaponSlot = player.activeWeaponSlot;
    }
    if (state.cameraMode === 'rooftop') {
      player.group.position.set(player.position.x, 0, player.position.z);
      player.heading = player.heading || 0;
      player.group.rotation.y = player.heading;
    }
    if (player.driving && !player.vehicle) {
      // The play shot stages Rico driving with no car attached yet: put
      // one under him at the staged spot and speed.
      try {
        const car = createCar('sedan', 0x2e6f8e, player.position.x, player.position.z, player.heading);
        car.speed = player.speed || 0;
        scene.add(car.mesh);
        state.traffic.push(car);
        enterCar(player, car);
        player.vehicle = car;
        state.stagedSpeed = player.speed || 0;
        renderer.snapChaseCamera(car, 'drive');
      } catch (err) {
        player.driving = false;
      }
    } else if (player.vehicle) {
      renderer.snapChaseCamera(player.vehicle, 'drive');
    } else {
      renderer.snapChaseCamera(player, 'foot');
    }
    // Keep staged police units exactly where the shot put them: no fresh
    // spawns or chases while the scene is staged.
    if (state.police) state.police._shotStaged = true;
    if (state.mode === 'title' || staged === 'start') setScreen('title');
    else setScreen('playing');
    return true;
  }

  // ---- Frame loop ------------------------------------------------------------
  let lastTime = performance.now();
  let saveTimer = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    state.elapsed += dt;

    if (state.screen === 'title') {
      const t = state.elapsed * 0.05;
      renderer.camera.position.set(Math.sin(t) * 95, 34, Math.cos(t) * 95);
      renderer.camera.lookAt(0, 4, 0);
      renderer.render(dt);
      drawHud();
      input.update();
      return;
    }

    if (input.wasPressed('pause')) {
      if (state.screen === 'playing') setScreen('paused');
      else if (state.screen === 'paused') setScreen('playing');
    }

    if (state.screen === 'playing') {
      const slot = input.pressedWeaponSlot();
      if (slot >= 1 && slot <= 5) {
        state.weaponSlot = slot - 1;
        player.activeWeaponSlot = slot - 1;
      }
      if (input.wasPressed('radio')) {
        try {
          audio.nextStation();
        } catch (err) {
          // Sound is never fatal.
        }
      }
      if (input.wasPressed('mute')) {
        state.muted = !state.muted;
        try {
          audio.setMuted(state.muted);
        } catch (err) {
          // Sound is never fatal.
        }
      }

      if (!state.shotStaged) {
        updateEnterExit();
        if (player.vehicle) updatePlayerDriving(dt);
        else updatePlayerOnFoot(dt);
        updateShooting();
      } else if (player.vehicle) {
        // Staged chase: keep the car rolling at its staged speed without
        // letting input or drag change the shot.
        const car = player.vehicle;
        car.update(dt, {});
        player.group.position.set(car.position.x, 0, car.position.z);
        player.heading = car.heading || player.heading;
        car.speed = state.stagedSpeed;
        player.speed = state.stagedSpeed;
      }
      updateTracers(dt);

      try {
        for (const car of state.movingTraffic) updateTrafficCar(car, dt);
      } catch (err) {
        // Traffic is ambient; a failure must not freeze the game.
      }
      try {
        const result = state.police.update(
          dt,
          player.position,
          player.speed,
          player.heading,
          !player.vehicle,
        );
        if (result && result.busted) state.busted = true;
      } catch (err) {
        // Police is ambient to the loop; the wanted level still shows.
      }
      try {
        state.pedestrians.update(dt);
      } catch (err) {
        // Pedestrians are ambient.
      }
      try {
        state.mission.update(dt, {
          playerPosition: player.position,
          wanted: state.wanted,
          targetsDestroyed: state.targetsDestroyed,
          busted: state.busted,
          wasted: state.health <= 0,
        });
      } catch (err) {
        // A mission error must not freeze the game.
      }
      watchMissions();

      advanceClock(state, dt);
      renderer.setTimeOfDay(state.hour);

      try {
        audio.update(player.speed, state.wanted > 0);
      } catch (err) {
        // Sound is never fatal.
      }

      if (state.busted) {
        writeSave(state);
        setScreen('busted');
      } else if (state.health <= 0) {
        writeSave(state);
        setScreen('wasted');
      }

      saveTimer += dt;
      if (saveTimer > 20) {
        saveTimer = 0;
        writeSave(state);
      }
    }

    if (state.cameraMode === 'rooftop') {
      // High wide view over the city for the rooftop shot.
      renderer.camera.position.set(
        player.group.position.x + 34,
        62,
        player.group.position.z + 44,
      );
      renderer.camera.lookAt(0, 2, 0);
    } else {
      const target = player.vehicle || player;
      renderer.updateChaseCamera(target, dt, player.vehicle ? 'drive' : 'foot');
    }
    renderer.render(dt);
    drawHud();

    input.update();
  }

  // ---- Boot the loop ---------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  setScreen('title');
  renderer.setTimeOfDay(state.hour);
  renderer.snapChaseCamera(player, 'foot');
  if (shot) {
    await stageShot(shot);
  }
  requestAnimationFrame(frame);
}

boot();
