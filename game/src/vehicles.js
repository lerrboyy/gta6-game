// Solmar Bay — cars, traffic and driving.
//
// Everything on four wheels lives here. The manager keeps a list of all
// cars in town: a handful parked near where Rico starts the day, and a
// set of AI drivers looping the streets. One car at a time can be the
// driven car, and the garage next to the safehouse sells it upgrades.
import * as THREE from './three.js';
import { CONFIG } from './config.js';

// How far a car may roam from the centre of town, and how close to the
// garage door a driven car has to sit before upgrades are offered.
const TOWN_EDGE = 130;
const GARAGE_REACH = 12;

// The paint shelf: eleven factory colours cars can spawn in or be
// resprayed with.
const PAINT_SHELF = [
  0xff3b30, 0x0077be, 0x4cd964, 0xffcc00, 0xff9500, 0x8e8e93,
  0xffffff, 0x111111, 0x00b8a9, 0x9b59b6, 0xff6b9d,
];

// Parked cars near the start: x, z and the yaw each one faces.
const PARKED = [
  [15, 18, 0],
  [22, 25, Math.PI / 2],
  [10, 32, Math.PI],
  [28, 28, -Math.PI / 2],
  [8, 22, Math.PI / 4],
];

// Traffic: x, z, and the x/z components of the direction each car drives.
const TRAFFIC = [
  [-50, -50, 1, 0],
  [50, 0, -1, 0],
  [0, 80, 0, -1],
  [-80, -20, 0, 1],
  [30, -90, 0, 1],
  [-30, 50, 1, 0],
  [90, 30, -1, 0],
  [-90, -80, 0, 1],
];

export class VehicleManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.vehicles = [];
    this.drivenCar = null;
    this.garagePos = new THREE.Vector3(60, 0, 60);
    this.nitroTimer = 0;
    this.carColors = PAINT_SHELF.slice();
  }

  // The car nearest to a point, provided it is closer than maxDist.
  getNearestCar(position, maxDist = 4.0) {
    let best = null;
    let bestGap = maxDist;
    for (const candidate of this.vehicles) {
      const gap = candidate.position.distanceTo(position);
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    return best;
  }

  // Assemble one car from boxes and cylinders and hand back the group.
  // The painted body material is tucked onto userData so a garage
  // respray can find and recolour it later.
  createCarMesh(color) {
    const car = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({
      color: color, roughness: 0.35, metalness: 0.4,
    });
    car.userData.bodyMat = paint;

    const putBox = (w, h, d, material, x, y, z, shadow) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      part.position.set(x, y, z);
      if (shadow) part.castShadow = true;
      car.add(part);
      return part;
    };

    // Main shell, plus the lower front and rear decks.
    const shell = putBox(2.0, 0.7, 4.2, paint, 0, 0.6, 0, true);
    shell.receiveShadow = true;
    putBox(1.8, 0.3, 1.0, paint, 0, 0.8, 1.5, true);
    putBox(1.8, 0.3, 0.8, paint, 0, 0.8, -1.6, true);

    // Chrome strips on the nose and the tail.
    const chrome = new THREE.MeshStandardMaterial({
      color: 0x888888, roughness: 0.3, metalness: 0.8,
    });
    putBox(2.0, 0.25, 0.3, chrome, 0, 0.35, 2.12, false);
    putBox(2.0, 0.25, 0.3, chrome, 0, 0.35, -2.12, false);

    // Glasshouse, set a touch rearward, and the raked screen ahead of it.
    const glass = new THREE.MeshStandardMaterial({
      color: 0x111111, roughness: 0.2, metalness: 0.8,
    });
    putBox(1.6, 0.6, 2.2, glass, 0, 1.15, -0.2, true);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.05, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x0a1a2a, roughness: 0.1, metalness: 0.9 })
    );
    screen.position.set(0, 1.2, 1.15);
    screen.rotation.x = 0.6;
    car.add(screen);

    // Wing mirrors, one per side at the front of the cabin.
    const mirrorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.2, metalness: 0.8,
    });
    for (const side of [-1, 1]) {
      putBox(0.08, 0.12, 0.25, mirrorMat, side * 0.86, 1.2, 0.6, true);
    }

    // Wheels: dark rubber rings with pale hubs, axle across the car.
    const rubberGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
    rubberGeo.rotateZ(Math.PI / 2);
    const rubber = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.34, 12);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xbbbbbb, roughness: 0.3, metalness: 0.7,
    });
    const corners = [
      [-1.05, 1.4], [1.05, 1.4], [-1.05, -1.4], [1.05, -1.4],
    ];
    for (const [wx, wz] of corners) {
      const tyre = new THREE.Mesh(rubberGeo, rubber);
      tyre.position.set(wx, 0.35, wz);
      car.add(tyre);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.position.set(wx, 0.35, wz);
      car.add(hub);
    }

    // Lights: warm white up front, red at the back.
    const lampGeo = new THREE.BoxGeometry(0.35, 0.15, 0.08);
    const frontLamp = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const rearLamp = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (const side of [-0.65, 0.65]) {
      const head = new THREE.Mesh(lampGeo, frontLamp);
      head.position.set(side, 0.65, 2.12);
      car.add(head);
      const tail = new THREE.Mesh(lampGeo, rearLamp);
      tail.position.set(side, 0.65, -2.12);
      car.add(tail);
    }

    return car;
  }

  // Fetch a car's tuning record, creating a stock one on first use.
  carMods(car) {
    if (!car.mods) {
      car.mods = { engine: 0, armour: 0, nitro: false, color: null };
    }
    return car.mods;
  }

  // Buy a garage upgrade for the car Rico is driving. Fails quietly
  // when there is no driven car, the kind is unknown, the upgrade is
  // already maxed out, or Rico cannot afford it.
  applyGarageUpgrade(kind, world) {
    if (!this.drivenCar) return false;
    const mods = this.carMods(this.drivenCar);
    const shop = CONFIG.GARAGE;

    let price;
    switch (kind) {
      case 'repair':
        price = shop.repair;
        break;
      case 'respray':
        price = shop.respray;
        break;
      case 'engine':
        if (mods.engine >= shop.maxLevel) return false;
        price = shop.engine;
        break;
      case 'armour':
        if (mods.armour >= shop.maxLevel) return false;
        price = shop.armour;
        break;
      case 'nitro':
        if (mods.nitro) return false;
        price = shop.nitro;
        break;
      default:
        return false;
    }

    if (world.cash < price) return false;
    world.cash -= price;

    switch (kind) {
      case 'respray': {
        const freshPaint = this._pickPaint();
        const bodyMat = this.drivenCar.mesh && this.drivenCar.mesh.userData
          ? this.drivenCar.mesh.userData.bodyMat
          : null;
        if (bodyMat) bodyMat.color.setHex(freshPaint);
        mods.color = freshPaint;
        break;
      }
      case 'engine':
        mods.engine += 1;
        break;
      case 'armour':
        mods.armour += 1;
        break;
      case 'nitro':
        mods.nitro = true;
        break;
      default:
        break; // repair: the money is the whole job.
    }
    return true;
  }

  // Is the driven car parked by the garage door?
  isAtGarage() {
    if (!this.drivenCar) return false;
    return this.drivenCar.position.distanceTo(this.garagePos) <= GARAGE_REACH;
  }

  // A car's top speed, including any engine tuning fitted to it.
  carTopSpeed(car) {
    const extra = car.mods ? car.mods.engine * CONFIG.GARAGE.engineMaxSpeedBonus : 0;
    return car.maxSpeed + extra;
  }

  spawnParkedCars() {
    for (const [x, z, yaw] of PARKED) {
      const mesh = this.createCarMesh(this._pickPaint());
      mesh.position.set(x, 0, z);
      mesh.rotation.y = yaw;
      this.scene.add(mesh);
      this.vehicles.push({
        mesh: mesh,
        position: mesh.position,
        rotation: yaw,
        speed: 0,
        maxSpeed: 25,
        isAI: false,
        aiDir: new THREE.Vector3(0, 0, 1),
      });
    }
  }

  spawnTraffic() {
    for (const [x, z, dx, dz] of TRAFFIC) {
      const heading = new THREE.Vector3(dx, 0, dz);
      const mesh = this.createCarMesh(this._pickPaint());
      mesh.position.set(x, 0, z);
      mesh.rotation.y = Math.atan2(dx, -dz);
      this.scene.add(mesh);
      this.vehicles.push({
        mesh: mesh,
        position: mesh.position,
        rotation: mesh.rotation.y,
        speed: 12 + Math.random() * 6,
        maxSpeed: 20,
        isAI: true,
        aiDir: heading.clone(),
      });
    }
  }

  // One random colour off the paint shelf.
  _pickPaint() {
    return this.carColors[Math.floor(Math.random() * this.carColors.length)];
  }

  init() {
    this.spawnParkedCars();
    this.spawnTraffic();
  }

  update(dt, input, world) {
    for (const car of this.vehicles) {
      if (car === this.drivenCar) {
        this._handleDriven(car, dt, input, world);
      } else if (car.isAI) {
        this._handleTraffic(car, dt);
      }
      // A parked car nobody drives just stays where it was left.
    }
  }

  // Rico at the wheel: nitro, throttle and reverse, coasting, the
  // handbrake, speed-sensitive steering, forward motion, the risk of
  // drawing police attention by shoving through traffic, and the edge
  // of town. The world position rides along with the car.
  _handleDriven(car, dt, input, world) {
    if (input.isPressed('KeyN') && car.mods && car.mods.nitro && this.nitroTimer <= 0) {
      this.nitroTimer = 3;
    }
    if (this.nitroTimer > 0) {
      this.nitroTimer -= dt;
      car.speed = Math.min(this.carTopSpeed(car) + 15, car.speed + 30 * dt);
    }

    let gas = 0;
    if (input.isPressed('KeyW') || input.isPressed('ArrowUp')) gas = 1;
    if (input.isPressed('KeyS') || input.isPressed('ArrowDown')) gas = -1;

    let steer = 0;
    if (input.isPressed('KeyA') || input.isPressed('ArrowLeft')) steer = 1;
    if (input.isPressed('KeyD') || input.isPressed('ArrowRight')) steer = -1;

    if (gas !== 0) {
      car.speed += gas * 15 * dt;
      car.speed = Math.max(-10, Math.min(this.carTopSpeed(car), car.speed));
    } else {
      car.speed *= 0.95;
      if (Math.abs(car.speed) < 0.1) car.speed = 0;
    }

    if (input.isPressed('Space')) car.speed *= 0.85;

    if (steer !== 0 && Math.abs(car.speed) > 0.5) {
      car.rotation += steer * (car.speed / car.maxSpeed) * 2.0 * dt;
      car.mesh.rotation.y = car.rotation;
    }

    const ahead = new THREE.Vector3(Math.sin(car.rotation), 0, Math.cos(car.rotation));
    car.position.addScaledVector(ahead, car.speed * dt);

    if (Math.abs(car.speed) > 5) {
      for (const other of this.vehicles) {
        if (other !== car && other.isAI &&
            car.position.distanceTo(other.position) < 3.5 &&
            Math.random() < 0.1) {
          world.wanted = Math.min(5, world.wanted + 1);
        }
      }
    }

    car.position.x = Math.max(-TOWN_EDGE, Math.min(TOWN_EDGE, car.position.x));
    car.position.z = Math.max(-TOWN_EDGE, Math.min(TOWN_EDGE, car.position.z));

    car.mesh.position.copy(car.position);
    world.position.copy(car.position);
  }

  // Traffic just cruises straight on; a car that leaves town reappears
  // on the opposite side and keeps going.
  _handleTraffic(car, dt) {
    car.position.addScaledVector(car.aiDir, car.speed * dt);
    if (Math.abs(car.position.x) > TOWN_EDGE || Math.abs(car.position.z) > TOWN_EDGE) {
      car.position.x = -car.position.x;
      car.position.z = -car.position.z;
    }
    car.mesh.position.copy(car.position);
  }
}
