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

let gameState = 'start'; // 'start', 'playing', 'paused'

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
  } else {
    world.setPosition(0, 0, 10);
    world.cash = 500;
    world.health = 100;
    world.wanted = 0;
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
     world.cash = 500;
     world.health = 100;
     world.wanted = 0;
     gameState = 'playing';
    if (cashDisplay) cashDisplay.textContent = `$${world.cash}`;
    if (healthFill) healthFill.style.width = `${world.health}%`;
    if (wantedStars) wantedStars.textContent = '';
     stageShot(shot, scene, camera, world, renderer);
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
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}
