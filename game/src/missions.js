import * as THREE from './three.js';

// Solmar Bay story chain: eight jobs that take the player from a first
// courier run to a beachfront legend. Rico drives, Lena fixes the plans
// and Marco calls the shots — each job has its own staged goal, a timer
// where the story needs one, and a cash payout at the end.

const JOB_CHAIN = [
  { num: 1, name: 'FIRST DELIVERY', stages: 1, reward: 200, intro: ['LENA', 'Rico, get that package across town before the timer runs out.'] },
  { num: 2, name: 'PACKAGE RUN', stages: 5, reward: 300, intro: ['MARCO', 'We need those drops secured across the district, speed is key.'] },
  { num: 3, name: 'LOSE THE HEAT', stages: 3, reward: 500, intro: ['LENA', 'The cops are on your tail, shake them and head to the safehouse.'] },
  { num: 4, name: 'FIRST WHEELS', stages: 2, reward: 400, intro: ['MARCO', 'Swipe a ride off the street and park it in our garage.'] },
  { num: 5, name: 'DRIVE-BY', stages: 3, reward: 600, intro: ['LENA', 'Clear out those rival drivers while cruising down the boulevard.'] },
  { num: 6, name: 'HEAT WAVE', stages: 2, reward: 800, intro: ['LENA', 'Kick up a storm, get wanted level 3 and survive the pressure.'] },
  { num: 7, name: 'NIGHT RUN', stages: 6, reward: 1000, intro: ['MARCO', 'Midnight run, collect all six moonlight drops before dawn.'] },
  { num: 8, name: 'GOLDEN HOUR', stages: 2, reward: 1500, intro: ['LENA', 'Four stars? Time to make your final run for the beach and legend status.'] },
];

// Fixed spots on the map — where each job's target, safehouse, garage and
// beach sit, plus the pickup points for the two collection jobs.
const FIRST_DROP = [30, -5];
const SAFEHOUSE_SPOT = [-40, 50];
const GARAGE_SPOT = [60, 60];
const BEACH_SPOT = [-200, 0];
const RUN_DROPS = [[20, 30], [-10, 45], [35, 20], [-20, 10], [5, -30]];
const NIGHT_DROPS = [[-50, -50], [50, 50], [-30, 60], [40, -40], [0, -70], [-70, 0]];
const HEAT_RIVALS = [[-38, 48], [-42, 52], [-39, 55]];
const DRIVEBY_CARS = [[25, 25], [-25, 35], [40, -30]];

// Tunables: how long the opening job lasts, how long the player must ride
// out the heat in job 6, how often the trigger can fire, and what a
// takedown pays on top of the job reward.
const OPENING_TIME_LIMIT = 90;
const HEAT_SURVIVE_TIME = 30;
const TRIGGER_COOLDOWN_MS = 500;
const TRIGGER_REACH = 40;
const TAKEDOWN_PAYOUT = 50;
const RESPECT_PER_JOB = 50;
const RIVAL_TOUGHNESS = 3;
const RIVAL_CAR_TOUGHNESS = 2;
const DIALOGUE_HOLD_MS = 3500;
const DIALOGUE_GAP_MS = 3800;
const COMPLETE_BANNER_SECS = 3.0;
const LEGEND_BANNER_SECS = 5.0;
const NEXT_JOB_DELAY_MS = 3000;

// How close the player must get to count as arriving / picking something up.
const ARRIVE_RADIUS = 4;
const PICKUP_RADIUS = 3;
const PARK_RADIUS = 5;

export class MissionManager {
  constructor(scene, world, saveManager) {
    this.scene = scene;
    this.world = world;
    this.saveManager = saveManager;

    // Progression: which job is live, plus the clocks and banners the HUD reads.
    this.currentMission = 1;
    this.missionTimer = OPENING_TIME_LIMIT;
    this.messageTimer = 0;
    this.messageText = '';
    this.lastShotTime = 0;

    // Per-job progress flags, reset whenever their job starts.
    this.m3WantedAchieved = false;
    this.m4CarStolen = false;
    this.m6WantedAchieved = false;
    this.m8WantedAchieved = false;
    this.m8Escaped = false;

    // Live mission props in the scene — beacons, pickups, rivals.
    this.rivals = [];
    this.rivalCars = [];
    this.packages = [];
    this.markerMesh = null;
    this.safehouseMesh = null;
    this.garageMesh = null;
    this.beachMesh = null;

    this.objEl = this._ensureHudLine();
    this._ensureCrosshair();

    this.initMission(1);
  }

  // ---- HUD helpers -------------------------------------------------------

  _ensureHudLine() {
    const existing = document.getElementById('mission-objective');
    if (existing) return existing;
    const el = document.createElement('div');
    el.id = 'mission-objective';
    el.style.position = 'fixed';
    el.style.top = '10px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.background = 'rgba(0, 0, 0, 0.7)';
    el.style.color = '#fff';
    el.style.padding = '8px 16px';
    el.style.fontFamily = 'monospace';
    el.style.fontSize = '16px';
    el.style.borderRadius = '4px';
    el.style.zIndex = '1000';
    document.body.appendChild(el);
    return el;
  }

  _ensureCrosshair() {
    if (document.getElementById('crosshair')) return;
    const dot = document.createElement('div');
    dot.id = 'crosshair';
    dot.style.position = 'fixed';
    dot.style.top = '50%';
    dot.style.left = '50%';
    dot.style.transform = 'translate(-50%, -50%)';
    dot.style.width = '10px';
    dot.style.height = '10px';
    dot.style.border = '2px solid rgba(255,255,255,0.7)';
    dot.style.borderRadius = '50%';
    dot.style.zIndex = '999';
    document.body.appendChild(dot);
  }

  // A tall glowing column marking a place the player has to reach.
  _beacon(radius, height, color, emissive, x, z, lift) {
    const shape = new THREE.CylinderGeometry(radius, radius, height, 16);
    const skin = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.3 });
    const column = new THREE.Mesh(shape, skin);
    column.position.set(x, lift, z);
    this.scene.add(column);
    return column;
  }

  // One glowing pickup crate sitting on the street at (x, z).
  _dropCrate(x, z, color, emissive) {
    const shape = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const skin = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.2 });
    const crate = new THREE.Mesh(shape, skin);
    crate.position.set(x, 0.75, z);
    this.scene.add(crate);
    return { mesh: crate, pos: new THREE.Vector3(x, 0, z), collected: false };
  }

  // One rival on foot guarding the safehouse approach.
  _spawnRival(x, z) {
    const shape = new THREE.BoxGeometry(1, 2, 1);
    const skin = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5 });
    const figure = new THREE.Mesh(shape, skin);
    figure.position.set(x, 1, z);
    this.scene.add(figure);
    return { mesh: figure, hp: RIVAL_TOUGHNESS };
  }

  // ---- Dialogue ----------------------------------------------------------

  showDialogue(speaker, text) {
    let box = document.getElementById('dialogue-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dialogue-box';
      box.style.position = 'fixed';
      box.style.bottom = '30px';
      box.style.left = '50%';
      box.style.transform = 'translateX(-50%)';
      box.style.background = 'rgba(0, 0, 0, 0.85)';
      box.style.color = '#fff';
      box.style.padding = '12px 20px';
      box.style.fontFamily = 'monospace';
      box.style.fontSize = '15px';
      box.style.borderRadius = '6px';
      box.style.zIndex = '1001';
      box.style.border = '1px solid #ffd700';
      box.style.display = 'none';
      document.body.appendChild(box);
    }
    box.innerHTML = `<span style="color: #ffd700; font-weight: bold;">${speaker}:</span> ${text}`;
    box.style.display = 'block';

    if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
    this.dialogueTimer = setTimeout(() => {
      box.style.display = 'none';
    }, DIALOGUE_HOLD_MS);
  }

  sayLines(lines) {
    if (!lines || lines.length === 0) return;
    let at = 0;
    const speakNext = () => {
      if (at >= lines.length) return;
      const [speaker, text] = lines[at];
      at += 1;
      this.showDialogue(speaker, text);
      this.dialogueQueueTimer = setTimeout(speakNext, DIALOGUE_GAP_MS);
    };
    speakNext();
  }

  // ---- Mission setup -----------------------------------------------------

  initMission(missionNum) {
    this.currentMission = missionNum;
    this.cleanupCurrentMissionVisuals();

    const job = JOB_CHAIN.find((entry) => entry.num === missionNum);
    if (job && job.intro) this.sayLines([job.intro]);

    switch (missionNum) {
      case 1: {
        // First delivery: one beacon across town, beat the clock.
        this.missionTimer = OPENING_TIME_LIMIT;
        this.m1Target = new THREE.Vector3(FIRST_DROP[0], 0, FIRST_DROP[1]);
        this.markerMesh = this._beacon(1.5, 6, 0x00ffcc, 0x0088aa, FIRST_DROP[0], FIRST_DROP[1], 3);
        break;
      }
      case 2: {
        // Package run: five amber crates scattered through the district.
        this.missionTimer = 0;
        this.packages = RUN_DROPS.map(([x, z]) => this._dropCrate(x, z, 0xffaa00, 0xff5500));
        break;
      }
      case 3: {
        // Lose the heat: draw the cops, shake them, then reach the safehouse
        // while three rivals hold the street outside it.
        this.missionTimer = 0;
        this.m3WantedAchieved = false;
        this.safehouseMesh = this._beacon(2, 8, 0xff00ff, 0x880088, SAFEHOUSE_SPOT[0], SAFEHOUSE_SPOT[1], 4);
        this.rivals = HEAT_RIVALS.map(([x, z]) => this._spawnRival(x, z));
        break;
      }
      case 4: {
        // First wheels: steal any street car, then park it in the garage.
        this.missionTimer = 0;
        this.m4CarStolen = false;
        this.garageMesh = this._beacon(2.5, 6, 0xffd700, 0xaa8800, GARAGE_SPOT[0], GARAGE_SPOT[1], 3);
        break;
      }
      case 5: {
        // Drive-by: three rival cars cruising the boulevard to take out.
        this.missionTimer = 0;
        this.rivalCars = DRIVEBY_CARS.map(([x, z]) => {
          const car = this.world.vehicles.createCarMesh(0xff9500);
          car.position.set(x, 0, z);
          this.scene.add(car);
          return { mesh: car, hp: RIVAL_CAR_TOUGHNESS };
        });
        break;
      }
      case 6: {
        // Heat wave: push the wanted level to 3, then ride out the pressure.
        this.missionTimer = HEAT_SURVIVE_TIME;
        this.m6WantedAchieved = false;
        break;
      }
      case 7: {
        // Night run: six moonlight crates spread to the far corners.
        this.missionTimer = 0;
        this.packages = NIGHT_DROPS.map(([x, z]) => this._dropCrate(x, z, 0x00ffff, 0x005555));
        break;
      }
      case 8: {
        // Golden hour: four stars, break away clean, then run for the beach.
        this.missionTimer = 0;
        this.m8WantedAchieved = false;
        this.m8Escaped = false;
        this.beachMesh = this._beacon(3, 8, 0x00ffcc, 0x008888, BEACH_SPOT[0], BEACH_SPOT[1], 4);
        break;
      }
      default:
        break;
    }
  }

  cleanupCurrentMissionVisuals() {
    for (const key of ['markerMesh', 'safehouseMesh', 'garageMesh', 'beachMesh']) {
      if (this[key]) {
        this.scene.remove(this[key]);
        this[key] = null;
      }
    }
    for (const crate of this.packages) {
      if (crate.mesh) this.scene.remove(crate.mesh);
    }
    this.packages = [];
    for (const rival of this.rivals) {
      if (rival.mesh) this.scene.remove(rival.mesh);
    }
    this.rivals = [];
    for (const car of this.rivalCars) {
      if (car.mesh) this.scene.remove(car.mesh);
    }
    this.rivalCars = [];
  }

  completeMission(reward, nextMissionNum) {
    this.world.cash += reward;
    this.world.respect = (this.world.respect || 0) + (RESPECT_PER_JOB * this.currentMission);
    this.saveManager.save(this.world);
    this.messageText = `MISSION COMPLETE +$${reward}!`;
    this.messageTimer = COMPLETE_BANNER_SECS;

    if (nextMissionNum <= 8) {
      setTimeout(() => {
        this.initMission(nextMissionNum);
      }, NEXT_JOB_DELAY_MS);
    } else {
      this.currentMission = 9;
      this.messageText = 'SOLMAR LEGEND — ALL 8 JOBS DONE!';
      this.messageTimer = LEGEND_BANNER_SECS;
    }
  }

  // ---- Combat ------------------------------------------------------------

  _payTakedown() {
    this.world.cash += TAKEDOWN_PAYOUT;
    this.saveManager.save(this.world);
  }

  // Fire at whatever is ahead: rival cars from behind the wheel in job 5,
  // rivals on foot everywhere else. Only the nearest target roughly in
  // front of the player, inside range, takes the hit.
  _tryShoot(world) {
    const facing = new THREE.Vector3(-Math.sin(world.rotation), 0, -Math.cos(world.rotation));
    const here = world.position;

    if (this.currentMission === 5 && world.isDriving) {
      let target = null;
      let closest = TRIGGER_REACH;
      for (const car of this.rivalCars) {
        const gap = here.distanceTo(car.mesh.position);
        if (gap > closest) continue;
        const heading = car.mesh.position.clone().sub(here).normalize();
        if (heading.dot(facing) <= -0.5) continue;
        closest = gap;
        target = car;
      }
      if (!target) return;
      target.hp -= 1;
      if (target.hp > 0) return;
      this.scene.remove(target.mesh);
      this.rivalCars = this.rivalCars.filter((car) => car !== target);
      this._payTakedown();
      return;
    }

    let target = null;
    let closest = TRIGGER_REACH;
    for (const rival of this.rivals) {
      const gap = here.distanceTo(rival.mesh.position);
      if (gap > closest) continue;
      const heading = rival.mesh.position.clone().sub(here).normalize();
      if (heading.dot(facing) <= 0.5) continue;
      closest = gap;
      target = rival;
    }
    if (!target) return;
    target.hp -= 1;
    if (target.hp > 0) return;
    this.scene.remove(target.mesh);
    this.rivals = this.rivals.filter((rival) => rival !== target);
    this._payTakedown();
  }

  // ---- Per-frame update --------------------------------------------------

  _sweepPickups(world) {
    for (const crate of this.packages) {
      if (crate.collected) continue;
      if (world.position.distanceTo(crate.mesh.position) >= PICKUP_RADIUS) continue;
      crate.collected = true;
      this.scene.remove(crate.mesh);
    }
  }

  _objectiveLine(world) {
    const cash = `Cash: $${world.cash}`;
    switch (this.currentMission) {
      case 1:
        return `JOB 1/8 FIRST DELIVERY — STAGE 1/1 | Reach Marker (30,0,-5) | Time: ${Math.ceil(this.missionTimer)}s | ${cash}`;
      case 2: {
        const left = this.packages.filter((crate) => !crate.collected).length;
        return `JOB 2/8 PACKAGE RUN — STAGE ${5 - left}/5 | Packages Left: ${left}/5 | ${cash}`;
      }
      case 3:
        if (!this.m3WantedAchieved) return `JOB 3/8 LOSE THE HEAT — STAGE 1/3 | Get Wanted (Steal a Car) | ${cash}`;
        if (world.wanted > 0) return `JOB 3/8 LOSE THE HEAT — STAGE 2/3 | Lose Police (Wanted: ${world.wanted}) | ${cash}`;
        return `JOB 3/8 LOSE THE HEAT — STAGE 3/3 | Reach Safehouse (-40,0,50) | ${cash}`;
      case 4:
        if (!this.m4CarStolen) return `JOB 4/8 FIRST WHEELS — STAGE 1/2 | Steal a Car (Press E) | ${cash}`;
        return `JOB 4/8 FIRST WHEELS — STAGE 2/2 | Drive to Garage (60,0,60) | ${cash}`;
      case 5: {
        const downed = 3 - this.rivalCars.length;
        return `JOB 5/8 DRIVE-BY — STAGE ${downed + 1}/3 | Shoot Rival Cars (${downed}/3) | ${cash}`;
      }
      case 6:
        if (!this.m6WantedAchieved) return `JOB 6/8 HEAT WAVE — STAGE 1/2 | Reach Wanted Level 3 | ${cash}`;
        return `JOB 6/8 HEAT WAVE — STAGE 2/2 | Survive Pressure | Time: ${Math.ceil(this.missionTimer)}s | ${cash}`;
      case 7: {
        const left = this.packages.filter((crate) => !crate.collected).length;
        return `JOB 7/8 NIGHT RUN — STAGE ${6 - left}/6 | Packages Left: ${left}/6 | ${cash}`;
      }
      case 8:
        if (!this.m8WantedAchieved) return `JOB 8/8 GOLDEN HOUR — STAGE 1/2 | Reach Wanted 4 | ${cash}`;
        if (!this.m8Escaped) return `JOB 8/8 GOLDEN HOUR — STAGE 1.5/2 | Escape Wanted (Wanted: ${world.wanted}) | ${cash}`;
        return `JOB 8/8 GOLDEN HOUR — STAGE 2/2 | Reach Beach (-200,0,0) | ${cash}`;
      default:
        return `ALL 8 JOBS DONE — SOLMAR IS YOURS! | ${cash}`;
    }
  }

  update(dt, world, input) {
    if (this.messageTimer > 0) this.messageTimer -= dt;

    if (input.isPressed('KeyF')) {
      const now = Date.now();
      if (now - this.lastShotTime > TRIGGER_COOLDOWN_MS) {
        this.lastShotTime = now;
        this._tryShoot(world);
      }
    }

    switch (this.currentMission) {
      case 1: {
        // Opening run: the clock restarts if it runs out — the job never
        // fails, it just gives the player another shot at the timer.
        this.missionTimer -= dt;
        if (this.missionTimer <= 0) this.missionTimer = OPENING_TIME_LIMIT;
        if (world.position.distanceTo(this.m1Target) < ARRIVE_RADIUS) {
          this.completeMission(200, 2);
        }
        break;
      }
      case 2: {
        this._sweepPickups(world);
        if (this.packages.every((crate) => crate.collected)) {
          this.completeMission(300, 3);
        }
        break;
      }
      case 3: {
        if (world.wanted >= 1) this.m3WantedAchieved = true;
        const hideout = new THREE.Vector3(SAFEHOUSE_SPOT[0], 0, SAFEHOUSE_SPOT[1]);
        if (this.m3WantedAchieved && world.wanted === 0 && world.position.distanceTo(hideout) < ARRIVE_RADIUS) {
          this.completeMission(500, 4);
        }
        break;
      }
      case 4: {
        if (world.isDriving) this.m4CarStolen = true;
        const garage = new THREE.Vector3(GARAGE_SPOT[0], 0, GARAGE_SPOT[1]);
        if (this.m4CarStolen && world.position.distanceTo(garage) < PARK_RADIUS) {
          this.completeMission(400, 5);
        }
        break;
      }
      case 5: {
        if (this.rivalCars.length === 0) this.completeMission(600, 6);
        break;
      }
      case 6: {
        if (world.wanted >= 3) this.m6WantedAchieved = true;
        if (this.m6WantedAchieved) {
          this.missionTimer -= dt;
          if (this.missionTimer <= 0) this.completeMission(800, 7);
        }
        break;
      }
      case 7: {
        this._sweepPickups(world);
        if (this.packages.every((crate) => crate.collected)) {
          this.completeMission(1000, 8);
        }
        break;
      }
      case 8: {
        if (world.wanted >= 4) this.m8WantedAchieved = true;
        if (this.m8WantedAchieved && world.wanted === 0) this.m8Escaped = true;
        const shore = new THREE.Vector3(BEACH_SPOT[0], 0, BEACH_SPOT[1]);
        if (this.m8Escaped && world.position.distanceTo(shore) < PARK_RADIUS) {
          this.completeMission(1500, 9);
        }
        break;
      }
      default:
        break;
    }

    if (this.messageTimer > 0) {
      this.objEl.innerText = this.messageText;
      return;
    }
    this.objEl.innerText = this._objectiveLine(world);
  }
}
