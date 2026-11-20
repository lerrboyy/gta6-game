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

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 42;

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const city = new CityGenerator(scene, seed);
city.build();

const world = new WorldManager(scene, city);
const audio = new AudioManager();
const saveManager = new SaveManager();
const missions = new MissionManager(scene, world, saveManager);

// HUD and UI elements
const hudEl = document.getElementById('hud');
const startScreenEl = document.getElementById('start-screen');
const pauseScreenEl = document.getElementById('pause-screen');
const startBtn = document.getElementById('start-btn');
const continueBtn = document.getElementById('continue-btn');
const resumeBtn = document.getElementById('resume-btn');
const saveBtn = document.getElementById('save-btn');
const healthFill = document.getElementById('health-fill');
const cashDisplay = document.getElementById('cash-display');
const speedDisplay = document.getElementById('speed-display');
const wantedStars = document.getElementById('wanted-stars');
const weaponSlotsEl = document.getElementById('weapon-slots');
const radioDisplay = document.getElementById('radio-display');
const clockDisplay = document.getElementById('clock-display');
const respectFill = document.getElementById('respect-fill');
const respectLabel = document.getElementById('respect-label');
const armorFill = document.getElementById('armor-fill');
const dispatchPanel = document.getElementById('dispatch-panel');
const garageMenuEl = document.getElementById('garage-menu');
const gRepair = document.getElementById('g-repair');
const gRespray = document.getElementById('g-respray');
const gEngine = document.getElementById('g-engine');
const gArmour = document.getElementById('g-armour');
const gNitro = document.getElementById('g-nitro');
const gClose = document.getElementById('g-close');

let gameState = 'start'; // 'start', 'playing', 'paused'
let garageOpen = false; // true while the SOLMAR CUSTOMS menu is on screen

// Highlight the equipped weapon slot and grey out the ones Rico has not bought.
function updateWeaponSlots() {
  for (let i = 0; i < CONFIG.WEAPONS.length; i++) {
    const slotEl = document.getElementById('wslot-' + i);
    if (!slotEl) continue;
    slotEl.classList.toggle('active', i === world.weaponSlot);
    slotEl.classList.toggle('locked', !world.ownedWeapons.includes(i));
    slotEl.textContent = (i + 1) + ' ' + CONFIG.WEAPONS[i].name;
  }
}

// A small top-down sketch of the city: beach, road grid, garage, cops, and Rico.
function drawMinimap() {
  try {
    const minimap = document.getElementById('minimap');
    if (!minimap) return;
    const ctx = minimap.getContext('2d');
    if (!ctx) return;
    const S = 150;
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#d9c27a';
    ctx.fillRect(0, 0, 18, S);
    ctx.strokeStyle = '#5a5a6a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= S; i += 15) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
    ctx.fillStyle = '#0e7c7b';
    ctx.fillRect(108, 108, 8, 8);
    ctx.fillStyle = '#ff4444';
    for (const car of world.police.policeCars) {
      const px = 75 + (car.position.x / 300) * 75;
      const pz = 75 + (car.position.z / 300) * 75;
      ctx.beginPath();
      ctx.arc(px, pz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(75, 75);
    ctx.rotate(world.rotation);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } catch (e) {
    // The minimap must never take the game down with it.
  }
}

// The police dispatch list: who is chasing Rico, how far away, and what they plan.
function updateDispatch() {
  if (!dispatchPanel) return;
  if (world.wanted > 0) {
    dispatchPanel.classList.remove('hidden');
    const title = world.police.getWantedName(world) + ' — ' + world.wanted + ' STARS';
    const lines = world.police.getDispatch(world).map((u) => u.name + ' — ' + u.dist + ' — ' + u.tactic);
    dispatchPanel.innerHTML = title + '<br>' + lines.join('<br>');
  } else {
    dispatchPanel.classList.add('hidden');
  }
}

function openGarage() {
  if (!garageMenuEl) return;
  garageMenuEl.classList.remove('hidden');
  garageOpen = true;
}

function closeGarage() {
  if (!garageMenuEl) return;
  garageMenuEl.classList.add('hidden');
  garageOpen = false;
}

// Garage upgrade buttons: charge the upgrade, click, and flash DONE! on success.
function wireGarageButton(btn, kind) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    const ok = world.vehicles.applyGarageUpgrade(kind, world);
    audio.playClick();
    if (ok) {
      const label = btn.textContent;
      btn.textContent = 'DONE!';
      setTimeout(() => { btn.textContent = label; }, 800);
    }
  });
}
wireGarageButton(gRepair, 'repair');
wireGarageButton(gRespray, 'respray');
wireGarageButton(gEngine, 'engine');
wireGarageButton(gArmour, 'armour');
wireGarageButton(gNitro, 'nitro');
if (gClose) gClose.addEventListener('click', () => { audio.playClick(); closeGarage(); });

const input = new InputManager(
  canvas,
  () => { // Mute toggle
    const muted = audio.toggleMute();
    console.log('Mute toggled:', muted);
  },
  () => { // Pause toggle
    if (gameState === 'playing') {
      pauseGame();
    } else if (gameState === 'paused') {
      resumeGame();
    }
  },
  () => { // Interact (E key)
    if (gameState === 'playing') {
      world.toggleCarEnterExit();
    }
  }
);

if (saveManager.hasSave()) {
  continueBtn.classList.remove('hidden');
}

function startGame(savedData = null) {
  audio.init();
  audio.playClick();
  startScreenEl.classList.add('hidden');
  pauseScreenEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  canvas.requestPointerLock?.();

  if (savedData) {
    world.setPosition(savedData.x, savedData.y, savedData.z);
    world.cash = savedData.cash;
    world.health = savedData.health;
    world.wanted = savedData.wanted;
    world.armor = savedData.armor ?? 0;
    world.respect = savedData.respect ?? 0;
    world.day = savedData.day ?? 1;
    world.clockMinutes = savedData.clockMinutes ?? 571;
    world.weaponSlot = savedData.weaponSlot ?? 1;
    world.ownedWeapons = savedData.ownedWeapons ?? [0, 1];
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
  gameState = 'playing';
}

function pauseGame() {
  gameState = 'paused';
  pauseScreenEl.classList.remove('hidden');
  hudEl.classList.add('hidden');
  document.exitPointerLock?.();
}

function resumeGame() {
  audio.playClick();
  pauseScreenEl.classList.remove('hidden');
  hudEl.classList.add('hidden');
  canvas.requestPointerLock?.();
  gameState = 'playing';
}

startBtn.addEventListener('click', () => startGame());
continueBtn.addEventListener('click', () => {
  const data = saveManager.load();
  if (data) startGame(data);
  else startGame();
});

resumeBtn.addEventListener('click', () => resumeGame());
saveBtn.addEventListener('click', () => {
  audio.playClick();
  saveManager.save(world);
  saveBtn.textContent = 'GAME SAVED!';
  setTimeout(() => { saveBtn.textContent = 'SAVE GAME'; }, 1500);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// If screenshot shot parameter is provided, stage the shot
   if (shot) {
     if (shot !== 'start') {
       startScreenEl.classList.add('hidden');
       hudEl.classList.remove('hidden');
     }
     world.setPosition(0, 0, 10);
     if (shot === 'play') { world.cash = 18450; world.wanted = 3; }
     else { world.cash = 500; world.wanted = 0; }
     world.health = 100;
     gameState = 'playing';
    if (cashDisplay) cashDisplay.textContent = `$${world.cash}`;
    if (healthFill) healthFill.style.width = `${world.health}%`;
    if (wantedStars) wantedStars.textContent = '';
    if (shot === 'play' && wantedStars) {
      let stars = '';
      for (let i = 0; i < world.wanted; i++) stars += '★';
      wantedStars.textContent = stars;
    }
    if (shot === 'play' && document.getElementById('speed-display')) {
      const sp = document.getElementById('speed-display');
      sp.classList.remove('hidden');
      sp.textContent = '61 MPH';
    }
    if (shot === 'play' && document.getElementById('radio-display')) {
      document.getElementById('radio-display').textContent = 'SOLMAR FM 98.6 — Golden Hour';
    }
    world.armor = 40;
    world.respect = 800;
    world.day = 1;
    world.clockMinutes = 17 * 60 + 24;
    world.weaponSlot = 2;
    world.ownedWeapons = [0, 1, 2];
    updateWeaponSlots();
    updateDispatch();
     stageShot(shot, scene, camera, world, renderer);
     // The chase staging adds the police cars and heli, so refresh the
     // dispatch list and the minimap now that they exist.
     updateDispatch();
     drawMinimap();
   } else {
  // Main animation loop
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (gameState === 'playing') {
      world.update(dt, input, audio);
      missions.update(dt, world, input);
      world.updateCamera(camera);

      // Update HUD
      if (healthFill) healthFill.style.width = `${Math.max(0, Math.min(100, world.health))}%`;
      if (cashDisplay) cashDisplay.textContent = `$${world.cash}`;
      if (wantedStars) {
        let stars = '';
        for (let i = 0; i < world.wanted; i++) stars += '★';
        wantedStars.textContent = stars;
      }
      if (speedDisplay) {
        if (world.isDriving && world.vehicles.drivenCar) {
          speedDisplay.classList.remove('hidden');
          const mph = Math.round(Math.abs(world.vehicles.drivenCar.speed) * 3);
          speedDisplay.textContent = `${mph} MPH`;
        } else {
          speedDisplay.classList.add('hidden');
        }
      }

      // Weapon switching (1-5), radio (R), garage (G, only at SOLMAR CUSTOMS).
      for (let slot = 0; slot < 5; slot++) {
        if (input.consumeKey('Digit' + (slot + 1))) world.switchWeapon(slot);
      }
      updateWeaponSlots();
      if (input.consumeKey('KeyR')) {
        const name = audio.cycleRadio();
        if (radioDisplay) radioDisplay.textContent = name;
      }
      if (input.consumeKey('KeyG')) {
        if (garageOpen) closeGarage();
        else if (world.vehicles.isAtGarage()) openGarage();
      }

      // Clock, respect meter, armor bar and the radio station name.
      if (clockDisplay) clockDisplay.textContent = world.clockText();
      if (respectFill) respectFill.style.width = Math.min(100, world.respect / 15) + '%';
      if (respectLabel) respectLabel.textContent = world.addRespect(0);
      if (armorFill) armorFill.style.width = Math.min(100, world.armor) + '%';
      if (radioDisplay && !radioDisplay.textContent) radioDisplay.textContent = audio.currentStationName();

      // The siren wails while the heat is on and cuts out when it is not.
      if (world.wanted > 0) audio.startSiren();
      else audio.stopSiren();

      updateDispatch();
      drawMinimap();
    }

    renderer.render(scene, camera);
    input.endFrame();
  }

  requestAnimationFrame(animate);
}
