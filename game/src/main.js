// Solmar Bay — entry point.
//
// This module is the glue: it boots the renderer, builds the city and the
// world, creates every manager, grabs every HUD element by id, wires the
// menus and the keyboard, and drives the per-frame loop. It owns no game
// rules itself — those live in world.js, missions.js, police.js and friends.
import * as THREE from './three.js';
import { CONFIG } from './config.js';
import { SeededRandom } from './random.js';
import { CityGenerator } from './city.js';
import { WorldManager } from './world.js';
import { InputManager } from './input.js';
import { AudioManager } from './audio.js';
import { SaveManager } from './save.js';
import { stageShot } from './shots.js';
import { MissionManager } from './missions.js';

// ------------------------------------------------------------------ boot

// Optional URL knobs: ?shot=play|start|... stages a screenshot, ?seed=N
// picks the city layout (42 when absent or unparsable).
const query = new URLSearchParams(window.location.search);
const shotName = query.get('shot');
const parsedSeed = Number.parseInt(query.get('seed') ?? '', 10);
const citySeed = Number.isInteger(parsedSeed) ? parsedSeed : 42;

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 1000
);

const city = new CityGenerator(scene, citySeed);
city.build();

const world = new WorldManager(scene, city);
const audio = new AudioManager();
const saveManager = new SaveManager();
const missions = new MissionManager(scene, world, saveManager);

// ------------------------------------------------------------- HUD lookup

function grab(id) {
  return document.getElementById(id);
}

const hud = grab('hud');
const startScreen = grab('start-screen');
const pauseScreen = grab('pause-screen');
const startButton = grab('start-btn');
const continueButton = grab('continue-btn');
const resumeButton = grab('resume-btn');
const saveButton = grab('save-btn');
const healthBar = grab('health-fill');
const cashLabel = grab('cash-display');
const speedLabel = grab('speed-display');
const wantedStars = grab('wanted-stars');
const weaponSlots = grab('weapon-slots');
const radioLabel = grab('radio-display');
const clockLabel = grab('clock-display');
const respectBar = grab('respect-fill');
const respectName = grab('respect-label');
const armorBar = grab('armor-fill');
const dispatchPanel = grab('dispatch-panel');
const garageMenu = grab('garage-menu');
const garageRepair = grab('g-repair');
const garageRespray = grab('g-respray');
const garageEngine = grab('g-engine');
const garageArmour = grab('g-armour');
const garageNitro = grab('g-nitro');
const garageClose = grab('g-close');

let phase = 'start'; // 'start' | 'playing' | 'paused'
let garageVisible = false;

// ------------------------------------------------------- weapon slot strip

// Mark the drawn weapon, dim the ones Rico has not bought yet, and label
// every slot with its number key and weapon name.
function refreshWeaponSlots() {
  for (let slot = 0; slot < CONFIG.WEAPONS.length; slot++) {
    const slotEl = document.getElementById('wslot-' + slot);
    if (!slotEl) continue;
    slotEl.classList.toggle('active', slot === world.weaponSlot);
    slotEl.classList.toggle('locked', !world.ownedWeapons.includes(slot));
    slotEl.textContent = (slot + 1) + ' ' + CONFIG.WEAPONS[slot].name;
  }
}

// ---------------------------------------------------------------- minimap

// A tiny overhead sketch: sand strip on the west edge, the road grid, the
// garage in teal, red dots for every pursuing cruiser, and a white arrow
// for Rico that turns with him. It is wrapped so a canvas failure can
// never bring the game down.
function paintMinimap() {
  try {
    const map = document.getElementById('minimap');
    if (!map) return;
    const ctx = map.getContext('2d');
    if (!ctx) return;
    const size = 150;
    const centre = 75;
    const scale = centre / 300;

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#d9c27a';
    ctx.fillRect(0, 0, 18, size);

    ctx.strokeStyle = '#5a5a6a';
    ctx.lineWidth = 1;
    for (let line = 0; line <= size; line += 15) {
      ctx.beginPath();
      ctx.moveTo(line, 0);
      ctx.lineTo(line, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, line);
      ctx.lineTo(size, line);
      ctx.stroke();
    }

    ctx.fillStyle = '#0e7c7b';
    ctx.fillRect(108, 108, 8, 8);

    ctx.fillStyle = '#ff4444';
    for (const cruiser of world.police.policeCars) {
      const px = centre + cruiser.position.x * scale;
      const pz = centre + cruiser.position.z * scale;
      ctx.beginPath();
      ctx.arc(px, pz, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(centre, centre);
    ctx.rotate(world.rotation);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } catch (err) {
    // The minimap must never take the game down with it.
  }
}

// ------------------------------------------------------------ dispatch box

// While Rico is hot, list every unit on him: call sign, distance and
// tactic. Cold, the panel stays hidden.
function refreshDispatch() {
  if (!dispatchPanel) return;
  if (world.wanted > 0) {
    dispatchPanel.classList.remove('hidden');
    const heading = world.police.getWantedName(world) + ' — ' + world.wanted + ' STARS';
    const rows = world.police
      .getDispatch(world)
      .map((unit) => unit.name + ' — ' + unit.dist + ' — ' + unit.tactic);
    dispatchPanel.innerHTML = heading + '<br>' + rows.join('<br>');
  } else {
    dispatchPanel.classList.add('hidden');
  }
}

// ----------------------------------------------------------------- garage

function showGarage() {
  if (!garageMenu) return;
  garageMenu.classList.remove('hidden');
  garageVisible = true;
}

function hideGarage() {
  if (!garageMenu) return;
  garageMenu.classList.add('hidden');
  garageVisible = false;
}

// One garage button: attempt the upgrade, click, and flash DONE! briefly
// when the purchase lands.
function bindGarageButton(button, upgrade) {
  if (!button) return;
  button.addEventListener('click', () => {
    const bought = world.vehicles.applyGarageUpgrade(upgrade, world);
    audio.playClick();
    if (bought) {
      const original = button.textContent;
      button.textContent = 'DONE!';
      setTimeout(() => { button.textContent = original; }, 800);
    }
  });
}
bindGarageButton(garageRepair, 'repair');
bindGarageButton(garageRespray, 'respray');
bindGarageButton(garageEngine, 'engine');
bindGarageButton(garageArmour, 'armour');
bindGarageButton(garageNitro, 'nitro');
if (garageClose) {
  garageClose.addEventListener('click', () => {
    audio.playClick();
    hideGarage();
  });
}

// ------------------------------------------------------------------ input

const input = new InputManager(
  canvas,
  () => { // Mute toggle
    const muted = audio.toggleMute();
    console.log('Mute toggled:', muted);
  },
  () => { // Pause toggle
    if (phase === 'playing') pauseGame();
    else if (phase === 'paused') resumeGame();
  },
  () => { // Interact (E key): climb in or out of a car
    if (phase === 'playing') world.toggleCarEnterExit();
  }
);

if (saveManager.hasSave()) {
  continueButton.classList.remove('hidden');
}

// ------------------------------------------------------------ game phases

function beginGame(saved = null) {
  audio.init();
  audio.playClick();
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  canvas.requestPointerLock?.();

  if (saved) {
    world.setPosition(saved.x, saved.y, saved.z);
    world.cash = saved.cash;
    world.health = saved.health;
    world.wanted = saved.wanted;
    world.armor = saved.armor ?? 0;
    world.respect = saved.respect ?? 0;
    world.day = saved.day ?? 1;
    world.clockMinutes = saved.clockMinutes ?? 571;
    world.weaponSlot = saved.weaponSlot ?? 1;
    world.ownedWeapons = saved.ownedWeapons ?? [0, 1];
  } else {
    world.setPosition(0, 0, 10);
    world.cash = 500;
    world.health = 100;
    world.wanted = 0;
    world.armor = 0;
    world.respect = 0;
    world.day = 1;
    world.clockMinutes = 571;
    world.weaponSlot = 1;
    world.ownedWeapons = [0, 1];
  }
  phase = 'playing';
}

function pauseGame() {
  phase = 'paused';
  pauseScreen.classList.remove('hidden');
  hud.classList.add('hidden');
  document.exitPointerLock?.();
}

function resumeGame() {
  audio.playClick();
  pauseScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  canvas.requestPointerLock?.();
  phase = 'playing';
}

startButton.addEventListener('click', () => beginGame());
continueButton.addEventListener('click', () => {
  const data = saveManager.load();
  if (data) beginGame(data);
  else beginGame();
});
resumeButton.addEventListener('click', () => resumeGame());
saveButton.addEventListener('click', () => {
  audio.playClick();
  saveManager.save(world);
  saveButton.textContent = 'GAME SAVED!';
  setTimeout(() => { saveButton.textContent = 'SAVE GAME'; }, 1500);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------- shot / loop

if (shotName) {
  // Screenshot staging: no loop, just pose the scene and hand it to shots.js.
  if (shotName !== 'start') {
    startScreen.classList.add('hidden');
    hud.classList.remove('hidden');
  }
  world.setPosition(0, 0, 10);
  if (shotName === 'play') {
    world.cash = 18450;
    world.wanted = 3;
  } else {
    world.cash = 500;
    world.wanted = 0;
  }
  world.health = 100;
  phase = 'playing';
  if (cashLabel) cashLabel.textContent = `$${world.cash}`;
  if (healthBar) healthBar.style.width = `${world.health}%`;
  if (wantedStars) {
    let stars = '';
    for (let i = 0; i < world.wanted; i++) stars += '★';
    wantedStars.textContent = stars;
  }
  if (shotName === 'play' && speedLabel) {
    speedLabel.classList.remove('hidden');
    speedLabel.textContent = '61 MPH';
  }
  if (shotName === 'play' && radioLabel) {
    radioLabel.textContent = 'SOLMAR FM 98.6 — Golden Hour';
  }
  world.armor = 40;
  world.respect = 800;
  world.day = 1;
  world.clockMinutes = 17 * 60 + 24;
  world.weaponSlot = 2;
  world.ownedWeapons = [0, 1, 2];
  refreshWeaponSlots();
  refreshDispatch();
  stageShot(shotName, scene, camera, world, renderer);
  // The chase staging adds police cars and the heli, so refresh the
  // dispatch list and the minimap now that they exist.
  refreshDispatch();
  paintMinimap();
} else {
  // The live game: one frame at a time, delta clamped so a hitch never
  // teleports anything.
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (phase === 'playing') {
      world.update(dt, input, audio);
      missions.update(dt, world, input);
      world.updateCamera(camera);

      // Health, cash and wanted stars.
      if (healthBar) {
        healthBar.style.width = `${Math.max(0, Math.min(100, world.health))}%`;
      }
      if (cashLabel) cashLabel.textContent = `$${world.cash}`;
      if (wantedStars) {
        let stars = '';
        for (let i = 0; i < world.wanted; i++) stars += '★';
        wantedStars.textContent = stars;
      }

      // Speedometer, visible only behind the wheel.
      if (speedLabel) {
        if (world.isDriving && world.vehicles.drivenCar) {
          speedLabel.classList.remove('hidden');
          const mph = Math.round(Math.abs(world.vehicles.drivenCar.speed) * 3);
          speedLabel.textContent = `${mph} MPH`;
        } else {
          speedLabel.classList.add('hidden');
        }
      }

      // Weapon switching (1-5), radio (R), garage (G, only at SOLMAR CUSTOMS).
      for (let slot = 0; slot < 5; slot++) {
        if (input.consumeKey('Digit' + (slot + 1))) world.switchWeapon(slot);
      }
      refreshWeaponSlots();
      if (input.consumeKey('KeyR')) {
        const station = audio.cycleRadio();
        if (radioLabel) radioLabel.textContent = station;
      }
      if (input.consumeKey('KeyG')) {
        if (garageVisible) hideGarage();
        else if (world.vehicles.isAtGarage()) showGarage();
      }

      // Clock, respect meter, armor bar and the radio station name.
      if (clockLabel) clockLabel.textContent = world.clockText();
      if (respectBar) respectBar.style.width = Math.min(100, world.respect / 15) + '%';
      if (respectName) respectName.textContent = world.addRespect(0);
      if (armorBar) armorBar.style.width = Math.min(100, world.armor) + '%';
      if (radioLabel && !radioLabel.textContent) {
        radioLabel.textContent = audio.currentStationName();
      }

      // The siren wails while the heat is on and cuts out when it is not.
      if (world.wanted > 0) audio.startSiren();
      else audio.stopSiren();

      refreshDispatch();
      paintMinimap();
    }

    renderer.render(scene, camera);
    input.endFrame();
  }

  requestAnimationFrame(animate);
}
