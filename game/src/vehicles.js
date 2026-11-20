// Solmar Bay — vehicle system: car models, traffic AI, player driving.
//
// VehicleManager owns every car on the map. Parked cars wait near the
// player start for Rico to steal; eight AI cars cruise the road grid and
// wrap to the far side when they leave town. The driven car answers the
// throttle, steering, handbrake and nitro, and brushing an AI car too
// closely at speed can earn Rico another wanted star.
import * as THREE from './three.js';
import { CONFIG } from './config.js';

// The world edge the cars live inside, and the reach of the garage door.
const DRIVE_LIMIT = 130;
const GARAGE_RADIUS = 12;

// Eleven paint jobs the city spawns cars in.
const PAINT_JOBS = [
  0xff3b30, 0x0077be, 0x4cd964, 0xffcc00, 0xff9500, 0x8e8e93,
  0xffffff, 0x111111, 0x00b8a9, 0x9b59b6, 0xff6b9d,
];

// Parked cars waiting near the player start, with their facings.
const PARKED_SPOTS = [
  { x: 15, z: 18, rot: 0 },
  { x: 22, z: 25, rot: Math.PI / 2 },
  { x: 10, z: 32, rot: Math.PI },
  { x: 28, z: 28, rot: -Math.PI / 2 },
  { x: 8, z: 22, rot: Math.PI / 4 },
];

// The eight traffic cars: where they start and which way they drive.
const TRAFFIC_LANES = [
  { x: -50, z: -50, dir: new THREE.Vector3(1, 0, 0) },
  { x: 50, z: 0, dir: new THREE.Vector3(-1, 0, 0) },
  { x: 0, z: 80, dir: new THREE.Vector3(0, 0, -1) },
  { x: -80, z: -20, dir: new THREE.Vector3(0, 0, 1) },
  { x: 30, z: -90, dir: new THREE.Vector3(0, 0, 1) },
  { x: -30, z: 50, dir: new THREE.Vector3(1, 0, 0) },
  { x: 90, z: 30, dir: new THREE.Vector3(-1, 0, 0) },
  { x: -90, z: -80, dir: new THREE.Vector3(0, 0, 1) },
];

export class VehicleManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.vehicles = [];
    this.drivenCar = null;
    this.garagePos = new THREE.Vector3(60, 0, 60);
    this.nitroTimer = 0;
    this.carColors = PAINT_JOBS.slice();
  }

  // ------------------------------------------------------------ lookups

  // The closest car to `position` inside maxDist, or null when the road
  // is empty.
  getNearestCar(position, maxDist = 4.0) {
    let closest = null;
    let closestDist = maxDist;
    for (const car of this.vehicles) {
      const d = car.position.distanceTo(position);
      if (d < closestDist) {
        closestDist = d;
        closest = car;
      }
    }
    return closest;
  }

  // ---------------------------------------------------------- car factory

  // Build one car as a THREE.Group: painted body with hood and trunk
  // decks, silver bumpers, a dark glass cabin, a sloped windshield, side
  // mirrors, four wheels with lighter hubs, and head- and taillights.
  // The body material is kept on the group so a respray can recolour it.
  createCarMesh(color) {
    const car = new THREE.Group();

    const paint = new THREE.MeshStandardMaterial({
      color, roughness: 0.35, metalness: 0.4,
    });
    car.userData.bodyMat = paint;

    const shell = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), paint);
    shell.position.y = 0.6;
    shell.castShadow = true;
    shell.receiveShadow = true;
    car.add(shell);

    // Lower decks at the front (hood) and rear (trunk).
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.0), paint);
    hood.position.set(0, 0.8, 1.5);
    hood.castShadow = true;
    car.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.8), paint);
    trunk.position.set(0, 0.8, -1.6);
    trunk.castShadow = true;
    car.add(trunk);

    // Silver bumpers, front and rear.
    const chrome = new THREE.MeshStandardMaterial({
      color: 0x888888, roughness: 0.3, metalness: 0.8,
    });
    const bumperGeo = new THREE.BoxGeometry(2.0, 0.25, 0.3);
    const bumperFront = new THREE.Mesh(bumperGeo, chrome);
    bumperFront.position.set(0, 0.35, 2.12);
    car.add(bumperFront);
    const bumperRear = new THREE.Mesh(bumperGeo, chrome);
    bumperRear.position.set(0, 0.35, -2.12);
    car.add(bumperRear);

    // Dark glass cabin, set slightly back from centre.
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 })
    );
    cabin.position.set(0, 1.15, -0.2);
    cabin.castShadow = true;
    car.add(cabin);

    // Sloped windshield in front of the cabin.
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.05, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x0a1a2a, roughness: 0.1, metalness: 0.9 })
    );
    shield.position.set(0, 1.2, 1.15);
    shield.rotation.x = 0.6;
    car.add(shield);

    // One small mirror on each side, at the front of the cabin.
    const mirrorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.2, metalness: 0.8,
    });
    const mirrorGeo = new THREE.BoxGeometry(0.08, 0.12, 0.25);
    for (const side of [-1, 1]) {
      const mirror = new THREE.Mesh(mirrorGeo, mirrorMat);
      mirror.position.set(side * 0.86, 1.2, 0.6);
      mirror.castShadow = true;
      car.add(mirror);
    }

    // Four wheels: dark tyres with a lighter hub in the same spot. The
    // cylinder's axle runs across the car, so the geometry is rolled
    // ninety degrees around Z.
    const tyreGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
    tyreGeo.rotateZ(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.34, 12);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xbbbbbb, roughness: 0.3, metalness: 0.7,
    });
    const wheelSpots = [
      [-1.05, 0.35, 1.4],
      [1.05, 0.35, 1.4],
      [-1.05, 0.35, -1.4],
      [1.05, 0.35, -1.4],
    ];
    for (const spot of wheelSpots) {
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.position.set(spot[0], spot[1], spot[2]);
      car.add(tyre);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.position.set(spot[0], spot[1], spot[2]);
      car.add(hub);
    }

    // Pale yellow headlights up front, red taillights at the rear.
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const lampGeo = new THREE.BoxGeometry(0.35, 0.15, 0.08);
    for (const side of [-0.65, 0.65]) {
      const head = new THREE.Mesh(lampGeo, headMat);
      head.position.set(side, 0.65, 2.12);
      car.add(head);
      const tail = new THREE.Mesh(lampGeo, tailMat);
      tail.position.set(side, 0.65, -2.12);
      car.add(tail);
    }

    return car;
  }

  // ------------------------------------------------------------- upgrades

  // Lazily attach the tuning record to a car: engine and armour levels,
  // whether nitro is fitted, and the respray colour (null = factory paint).
  carMods(car) {
    if (!car.mods) {
      car.mods = { engine: 0, armour: 0, nitro: false, color: null };
    }
    return car.mods;
  }

  // Spend cash on the driven car at SOLMAR CUSTOMS. Repair and respray
  // are always available; engine and armour stop at the maximum level and
  // nitro can only be bought once. Returns false when there is no driven
  // car, the kind is unknown, the upgrade is maxed out, or Rico is broke.
  applyGarageUpgrade(kind, world) {
    if (!this.drivenCar) return false;
    const mods = this.carMods(this.drivenCar);
    const prices = CONFIG.GARAGE;

    let cost;
    if (kind === 'repair') {
      cost = prices.repair;
    } else if (kind === 'respray') {
      cost = prices.respray;
    } else if (kind === 'engine') {
      if (mods.engine >= prices.maxLevel) return false;
      cost = prices.engine;
    } else if (kind === 'armour') {
      if (mods.armour >= prices.maxLevel) return false;
      cost = prices.armour;
    } else if (kind === 'nitro') {
      if (mods.nitro) return false;
      cost = prices.nitro;
    } else {
      return false;
    }

    if (world.cash < cost) return false;
    world.cash -= cost;

    if (kind === 'respray') {
      const fresh = this.carColors[Math.floor(Math.random() * this.carColors.length)];
      const bodyMat = this.drivenCar.mesh?.userData?.bodyMat;
      if (bodyMat) bodyMat.color.setHex(fresh);
      mods.color = fresh;
    } else if (kind === 'engine') {
      mods.engine += 1;
    } else if (kind === 'armour') {
      mods.armour += 1;
    } else if (kind === 'nitro') {
      mods.nitro = true;
    }
    // 'repair' only costs money; nothing structural changes.
    return true;
  }

  // True only while Rico is driving and the car sits by the garage door.
  isAtGarage() {
    if (!this.drivenCar) return false;
    return this.drivenCar.position.distanceTo(this.garagePos) <= GARAGE_RADIUS;
  }

  // Top speed, with the engine tuning bonus on top (no bonus without mods).
  carTopSpeed(car) {
    const bonus = car.mods ? car.mods.engine * CONFIG.GARAGE.engineMaxSpeedBonus : 0;
    return car.maxSpeed + bonus;
  }

  // -------------------------------------------------------------- spawning

  spawnParkedCars() {
    for (const spot of PARKED_SPOTS) {
      const paint = this._randomPaint();
      const mesh = this.createCarMesh(paint);
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = spot.rot;
      this.scene.add(mesh);

      this.vehicles.push({
        mesh,
        position: mesh.position,
        rotation: spot.rot,
        speed: 0,
        maxSpeed: 25,
        isAI: false,
        aiDir: new THREE.Vector3(0, 0, 1),
      });
    }
  }

  spawnTraffic() {
    for (const lane of TRAFFIC_LANES) {
      const paint = this._randomPaint();
      const mesh = this.createCarMesh(paint);
      mesh.position.set(lane.x, 0, lane.z);
      mesh.rotation.y = this._yawForDirection(lane.dir);
      this.scene.add(mesh);

      this.vehicles.push({
        mesh,
        position: mesh.position,
        rotation: mesh.rotation.y,
        speed: 12 + Math.random() * 6,
        maxSpeed: 20,
        isAI: true,
        aiDir: lane.dir.clone(),
      });
    }
  }

  // Yaw that points a car mesh along a driving direction: east is a
  // quarter turn, west is minus a quarter, north is a half turn, south
  // is straight ahead.
  _yawForDirection(dir) {
    if (dir.x === 1) return Math.PI / 2;
    if (dir.x === -1) return -Math.PI / 2;
    if (dir.z === 1) return Math.PI;
    return 0;
  }

  _randomPaint() {
    return this.carColors[Math.floor(Math.random() * this.carColors.length)];
  }

  init() {
    this.spawnParkedCars();
    this.spawnTraffic();
  }

  // -------------------------------------------------------------- per-frame

  update(dt, input, world) {
    for (const car of this.vehicles) {
      if (car === this.drivenCar) {
        this._driveCar(car, dt, input, world);
      } else if (car.isAI) {
        this._driveTraffic(car, dt);
      }
      // Parked cars that nobody is driving simply sit where they are.
    }
  }

  // Player driving: nitro, throttle, reverse, coasting, handbrake,
  // steering that scales with speed, forward motion, bumping traffic at
  // speed (which can draw police attention), and the world edge clamp.
  _driveCar(car, dt, input, world) {
    // Nitro: N arms a 3-second boost while the kit is fitted and the
    // previous boost has run out; while it burns, the car shoves hard
    // toward top speed plus 15.
    if (input.isPressed('KeyN') && car.mods && car.mods.nitro && this.nitroTimer <= 0) {
      this.nitroTimer = 3;
    }
    if (this.nitroTimer > 0) {
      this.nitroTimer -= dt;
      car.speed = Math.min(this.carTopSpeed(car) + 15, car.speed + 30 * dt);
    }

    let throttle = 0;
    if (input.isPressed('KeyW') || input.isPressed('ArrowUp')) throttle = 1;
    if (input.isPressed('KeyS') || input.isPressed('ArrowDown')) throttle = -1;

    let steering = 0;
    if (input.isPressed('KeyA') || input.isPressed('ArrowLeft')) steering = 1;
    if (input.isPressed('KeyD') || input.isPressed('ArrowRight')) steering = -1;

    if (throttle !== 0) {
      car.speed += throttle * 15 * dt;
      car.speed = Math.max(-10, Math.min(this.carTopSpeed(car), car.speed));
    } else {
      // No throttle: coast down, and stop dead below a crawl.
      car.speed *= 0.95;
      if (Math.abs(car.speed) < 0.1) car.speed = 0;
    }

    // Space is the handbrake.
    if (input.isPressed('Space')) car.speed *= 0.85;

    // Steering bites only while the car is actually moving, and harder
    // the faster it goes.
    if (steering !== 0 && Math.abs(car.speed) > 0.5) {
      car.rotation += steering * (car.speed / car.maxSpeed) * 2.0 * dt;
      car.mesh.rotation.y = car.rotation;
    }

    const forward = new THREE.Vector3(Math.sin(car.rotation), 0, Math.cos(car.rotation));
    car.position.addScaledVector(forward, car.speed * dt);

    // Shoving through traffic at speed: about one chance in ten per
    // frame, per close AI car, to pick up another wanted star (max 5).
    if (Math.abs(car.speed) > 5) {
      for (const other of this.vehicles) {
        if (other !== car && other.isAI &&
            car.position.distanceTo(other.position) < 3.5 &&
            Math.random() < 0.1) {
          world.wanted = Math.min(5, world.wanted + 1);
        }
      }
    }

    // Keep the car inside the drivable part of town.
    car.position.x = Math.max(-DRIVE_LIMIT, Math.min(DRIVE_LIMIT, car.position.x));
    car.position.z = Math.max(-DRIVE_LIMIT, Math.min(DRIVE_LIMIT, car.position.z));

    car.mesh.position.copy(car.position);
    // The player rides along: the world position follows the car.
    world.position.copy(car.position);
  }

  // Traffic AI: cruise straight ahead; when a car runs off the edge of
  // town it wraps to the opposite side and keeps going.
  _driveTraffic(car, dt) {
    car.position.addScaledVector(car.aiDir, car.speed * dt);

    if (Math.abs(car.position.x) > DRIVE_LIMIT || Math.abs(car.position.z) > DRIVE_LIMIT) {
      car.position.x = -car.position.x;
      car.position.z = -car.position.z;
    }

    car.mesh.position.copy(car.position);
  }
}
