// vehicles.js — Solmar Bay cars.
//
// A car is a low-poly assembly built from boxes and cylinders on the global
// THREE object: a body, a cabin, tinted windows, four wheels, headlights and
// tail lights, plus model-specific extras (a taxi sign, a police light bar,
// a pickup bed). Each car carries its own state — model, colour, health,
// upgrade levels, speed and heading — and the driving, damage and garage
// behaviour that goes with it.
//
// The module never touches the rest of the game directly. The loop hands a
// car an input snapshot each frame ({ throttle, brake, steer, nitro }) and
// the car moves itself; the HUD reads speed through getSpeedMph().

const MODEL_SPECS = {
  sedan: {
    length: 4.4, width: 1.9, height: 0.62, cabinLength: 2.2,
    topSpeed: 38, acceleration: 14, steering: 1.9,
    wheelRadius: 0.36, defaultColour: 0x2e6f8e,
  },
  coupe: {
    length: 4.1, width: 1.85, height: 0.55, cabinLength: 1.9,
    topSpeed: 44, acceleration: 17, steering: 2.1,
    wheelRadius: 0.35, defaultColour: 0xc23b4e,
  },
  taxi: {
    length: 4.4, width: 1.9, height: 0.62, cabinLength: 2.2,
    topSpeed: 36, acceleration: 13, steering: 1.9,
    wheelRadius: 0.36, defaultColour: 0xf2c230,
  },
  police: {
    length: 4.5, width: 1.95, height: 0.64, cabinLength: 2.3,
    topSpeed: 42, acceleration: 16, steering: 2.0,
    wheelRadius: 0.36, defaultColour: 0x1d2733,
  },
  pickup: {
    length: 5.0, width: 2.0, height: 0.72, cabinLength: 1.6,
    topSpeed: 34, acceleration: 12, steering: 1.7,
    wheelRadius: 0.4, defaultColour: 0x7a5a34,
  },
};

const MODEL_NAMES = Object.keys(MODEL_SPECS);
const MAX_UPGRADE_LEVEL = 3;
const NITRO_BASE_SECONDS = 4;
const SMOKE_HEALTH = 35;
const MPH_PER_MS = 2.23694;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// A tiny fallback random source, used only when the caller does not pass one
// in. The city builder normally supplies the seeded generator.
function fallbackRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function box(width, height, depth, colour, options) {
  const material = new THREE.MeshLambertMaterial({
    color: colour,
    emissive: options && options.emissive ? options.emissive : 0x000000,
    emissiveIntensity: options && options.glow ? 0.9 : 0,
    transparent: !!(options && options.transparent),
    opacity: options && options.opacity !== undefined ? options.opacity : 1,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  return mesh;
}

function makeWheel(radius, width) {
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 12),
    new THREE.MeshLambertMaterial({ color: 0x141414 }),
  );
  tyre.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 8),
    new THREE.MeshLambertMaterial({ color: 0xb8bcc2 }),
  );
  hub.rotation.z = Math.PI / 2;
  const wheel = new THREE.Group();
  wheel.add(tyre);
  wheel.add(hub);
  return wheel;
}

// ---------------------------------------------------------------------------
// Car construction
// ---------------------------------------------------------------------------

function buildBody(spec, model, colour) {
  const group = new THREE.Group();
  const halfLength = spec.length / 2;
  const halfWidth = spec.width / 2;

  const body = box(spec.width, spec.height, spec.length, colour);
  body.position.y = spec.wheelRadius + spec.height / 2;
  group.add(body);
  group.userData.bodyMesh = body;

  const cabin = box(
    spec.width - 0.28, spec.height * 0.72, spec.cabinLength, 0x1c2733,
  );
  cabin.position.y = spec.wheelRadius + spec.height + spec.height * 0.34;
  cabin.position.z = model === 'pickup' ? halfLength - spec.cabinLength : -0.15;
  group.add(cabin);

  // Windshield and rear window: thin dark panes laid over the cabin ends.
  const windshield = box(spec.width - 0.4, spec.height * 0.55, 0.06, 0x8fd4e8, {
    transparent: true, opacity: 0.75,
  });
  windshield.position.set(0, cabin.position.y, cabin.position.z + spec.cabinLength / 2 + 0.02);
  group.add(windshield);
  const rearWindow = box(spec.width - 0.4, spec.height * 0.55, 0.06, 0x8fd4e8, {
    transparent: true, opacity: 0.75,
  });
  rearWindow.position.set(0, cabin.position.y, cabin.position.z - spec.cabinLength / 2 - 0.02);
  group.add(rearWindow);

  // Headlights (warm white, slightly emissive) and red tail lights.
  const lightY = spec.wheelRadius + spec.height * 0.62;
  const frontZ = halfLength + 0.01;
  const backZ = -halfLength - 0.01;
  [-1, 1].forEach((side) => {
    const head = box(0.34, 0.16, 0.06, 0xfff2c0, { emissive: 0xffe9a0, glow: true });
    head.position.set(side * (halfWidth - 0.32), lightY, frontZ);
    group.add(head);
    const tail = box(0.3, 0.14, 0.06, 0xd21f2b, { emissive: 0x8f0f16, glow: true });
    tail.position.set(side * (halfWidth - 0.32), lightY, backZ);
    group.add(tail);
  });

  // Bumpers front and back.
  const bumperFront = box(spec.width - 0.1, 0.18, 0.22, 0x22262b);
  bumperFront.position.set(0, spec.wheelRadius + 0.12, halfLength + 0.05);
  group.add(bumperFront);
  const bumperBack = box(spec.width - 0.1, 0.18, 0.22, 0x22262b);
  bumperBack.position.set(0, spec.wheelRadius + 0.12, -halfLength - 0.05);
  group.add(bumperBack);

  const wheelY = spec.wheelRadius;
  const wheelX = halfWidth - 0.06;
  const wheelZ = halfLength - 0.95;
  const wheels = [];
  [
    [-wheelX, wheelZ], [wheelX, wheelZ],
    [-wheelX, -wheelZ], [wheelX, -wheelZ],
  ].forEach(([x, z]) => {
    const wheel = makeWheel(spec.wheelRadius, 0.26);
    wheel.position.set(x, wheelY, z);
    group.add(wheel);
    wheels.push(wheel);
  });
  group.userData.wheels = wheels;

  if (model === 'taxi') {
    const sign = box(0.7, 0.18, 0.34, 0xf2c230, { emissive: 0xa8840a, glow: true });
    sign.position.set(0, cabin.position.y + spec.height * 0.42, cabin.position.z);
    group.add(sign);
    const stripe = box(spec.width + 0.02, 0.12, spec.length - 1.4, 0x141414);
    stripe.position.set(0, spec.wheelRadius + spec.height * 0.55, 0);
    group.add(stripe);
  }

  if (model === 'police') {
    const barBase = box(0.9, 0.1, 0.3, 0x111418);
    barBase.position.set(0, cabin.position.y + spec.height * 0.42, cabin.position.z);
    group.add(barBase);
    const red = box(0.38, 0.16, 0.28, 0xff2a2a, { emissive: 0xff2a2a, glow: true });
    red.position.set(-0.24, cabin.position.y + spec.height * 0.52, cabin.position.z);
    group.add(red);
    const blue = box(0.38, 0.16, 0.28, 0x2a6bff, { emissive: 0x2a6bff, glow: true });
    blue.position.set(0.24, cabin.position.y + spec.height * 0.52, cabin.position.z);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }

  if (model === 'pickup') {
    // Open bed: low walls around the rear half instead of a full cabin.
    const bedFloorY = spec.wheelRadius + spec.height;
    const bedLength = spec.length - spec.cabinLength - 0.9;
    const wallHeight = 0.34;
    const bedZ = -halfLength + bedLength / 2 + 0.15;
    const sideWall = (side) => {
      const wall = box(0.08, wallHeight, bedLength, colour);
      wall.position.set(side * (halfWidth - 0.05), bedFloorY + wallHeight / 2, bedZ);
      group.add(wall);
    };
    sideWall(-1);
    sideWall(1);
    const tailgate = box(spec.width, wallHeight, 0.08, colour);
    tailgate.position.set(0, bedFloorY + wallHeight / 2, -halfLength + 0.06);
    group.add(tailgate);
    const bedFloor = box(spec.width - 0.1, 0.06, bedLength, 0x2a2f33);
    bedFloor.position.set(0, bedFloorY + 0.03, bedZ);
    group.add(bedFloor);
  }

  return group;
}

function buildSmokePuffs() {
  const smoke = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({
    color: 0x777777, transparent: true, opacity: 0.55,
  });
  const puffs = [];
  for (let i = 0; i < 3; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), material.clone());
    puff.position.set((i - 1) * 0.22, i * 0.25, 0);
    smoke.add(puff);
    puffs.push(puff);
  }
  smoke.visible = false;
  smoke.userData.puffs = puffs;
  return smoke;
}

// ---------------------------------------------------------------------------
// Car factory
// ---------------------------------------------------------------------------

export function createCar(model, colour, x, z, heading) {
  const name = MODEL_SPECS[model] ? model : 'sedan';
  const spec = MODEL_SPECS[name];
  const paint = colour !== undefined ? colour : spec.defaultColour;
  const mesh = buildBody(spec, name, paint);
  mesh.position.set(x || 0, 0, z || 0);
  mesh.rotation.y = heading || 0;

  const smoke = buildSmokePuffs();
  smoke.position.set(0, spec.wheelRadius + spec.height + 0.5, spec.length / 2 - 0.6);
  mesh.add(smoke);

  const car = {
    model: name,
    colour: paint,
    mesh,
    position: { x: x || 0, z: z || 0 },
    heading: heading || 0,
    speed: 0,
    steerAngle: 0,
    slip: 0,
    health: 100,
    maxHealth: 100,
    smoking: false,
    nitroLeft: NITRO_BASE_SECONDS,
    nitroMax: NITRO_BASE_SECONDS,
    nitroActive: false,
    upgrades: { engine: 0, armour: 0, nitro: 0 },
    route: null,
    routeIndex: 0,
    isTraffic: false,
    parked: false,
  };

  car.topSpeed = function topSpeed() {
    return spec.topSpeed * (1 + 0.12 * car.upgrades.engine);
  };

  car.acceleration = function acceleration() {
    return spec.acceleration * (1 + 0.15 * car.upgrades.engine);
  };

  car.accelerate = function accelerate(dt) {
    const target = car.topSpeed() * (car.nitroActive ? 1.35 : 1);
    car.speed = Math.min(target, car.speed + car.acceleration() * (car.nitroActive ? 1.8 : 1) * dt);
  };

  car.brake = function brake(dt) {
    // Strong braking while moving forward; gentle reverse if already stopped.
    if (car.speed > 0.5) {
      car.speed = Math.max(0, car.speed - 26 * dt);
    } else {
      car.speed = Math.max(-8, car.speed - 9 * dt);
    }
  };

  car.steer = function steer(direction, dt) {
    // Steering bites less the faster the car goes, and not at all standing still.
    const speedFactor = clamp(Math.abs(car.speed) / car.topSpeed(), 0, 1);
    const authority = 0.25 + 0.75 * (1 - speedFactor * 0.6);
    const turn = direction * spec.steering * authority * dt;
    car.heading += turn * (car.speed >= 0 ? 1 : -1) * (0.25 + speedFactor);
    car.steerAngle = clamp(direction * 0.5, -0.5, 0.5);
    // Hard steering at speed builds a little sideways drift.
    if (Math.abs(direction) > 0.5 && Math.abs(car.speed) > 14) {
      car.slip = clamp(car.slip + direction * 2.2 * dt, -3, 3);
    }
  };

  car.boost = function boost(dt) {
    if (car.nitroLeft <= 0) {
      car.nitroActive = false;
      return false;
    }
    car.nitroActive = true;
    car.nitroLeft = Math.max(0, car.nitroLeft - dt);
    return true;
  };

  car.damage = function damage(amount) {
    // Armour upgrades soak a share of every hit.
    const soaked = amount * (1 - 0.1 * car.upgrades.armour);
    car.health = Math.max(0, car.health - soaked);
    if (car.health <= SMOKE_HEALTH) {
      car.smoking = true;
      smoke.visible = true;
    }
    return car.health;
  };

  car.repair = function repair() {
    car.health = car.maxHealth;
    car.smoking = false;
    smoke.visible = false;
  };

  car.applyUpgrade = function applyUpgrade(kind, level) {
    if (kind === 'respray') {
      car.respray(level);
      return true;
    }
    if (!['engine', 'armour', 'nitro'].includes(kind)) return false;
    const next = level !== undefined ? level : car.upgrades[kind] + 1;
    car.upgrades[kind] = clamp(next, 0, MAX_UPGRADE_LEVEL);
    if (kind === 'armour') {
      car.maxHealth = 100 + 25 * car.upgrades.armour;
      car.health = Math.min(car.health + 25, car.maxHealth);
    }
    if (kind === 'nitro') {
      car.nitroMax = NITRO_BASE_SECONDS + 2 * car.upgrades.nitro;
      car.nitroLeft = car.nitroMax;
    }
    return true;
  };

  car.respray = function respray(newColour) {
    car.colour = newColour;
    const body = mesh.userData.bodyMesh;
    if (body) body.material.color.setHex(newColour);
  };

  car.getSpeedMph = function getSpeedMph() {
    return Math.abs(car.speed) * MPH_PER_MS;
  };

  car.update = function update(dt, input) {
    const controls = input || {};
    car.nitroActive = false;
    if (controls.nitro) car.boost(dt);
    if (controls.throttle) car.accelerate(dt);
    else if (controls.brake) car.brake(dt);
    else {
      // Rolling drag and engine braking when no pedal is pressed.
      const drag = 6 * dt + Math.abs(car.speed) * 0.12 * dt;
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), drag);
    }
    if (controls.steer) car.steer(controls.steer, dt);
    else car.steerAngle *= Math.max(0, 1 - 6 * dt);

    // Drift: the car slides sideways a touch, then the tyres catch again.
    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    car.position.x += forwardX * car.speed * dt + sideX * car.slip * dt;
    car.position.z += forwardZ * car.speed * dt + sideZ * car.slip * dt;
    car.slip *= Math.max(0, 1 - 3.5 * dt);

    mesh.position.set(car.position.x, 0, car.position.z);
    mesh.rotation.y = car.heading;

    // Front wheels turn with the steering; all wheels spin with speed.
    const wheels = mesh.userData.wheels || [];
    wheels.forEach((wheel, index) => {
      if (index < 2) wheel.rotation.y = car.steerAngle;
      wheel.rotation.x += (car.speed / spec.wheelRadius) * dt;
    });

    // Police light bar flashes while the car is moving in a chase.
    if (name === 'police' && mesh.userData.lightRed) {
      const phase = Math.floor(performance.now() / 180) % 2 === 0;
      mesh.userData.lightRed.material.emissiveIntensity = phase ? 1.4 : 0.15;
      mesh.userData.lightBlue.material.emissiveIntensity = phase ? 0.15 : 1.4;
    }

    // Smoke puffs rise and swell while the car is badly damaged.
    if (car.smoking) {
      const time = performance.now() / 1000;
      smoke.userData.puffs.forEach((puff, i) => {
        const cycle = (time * 0.7 + i / 3) % 1;
        puff.position.y = 0.15 + cycle * 0.9;
        const scale = 0.6 + cycle * 1.4;
        puff.scale.set(scale, scale, scale);
        puff.material.opacity = 0.55 * (1 - cycle);
      });
    }
  };

  return car;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

// Pull usable parking / driving spots out of whatever shape the city module
// hands back: a list of points, a list of road segments, or an object with a
// roads array. Falls back to a plain grid so spawning never crashes.
function collectSpots(roadNetwork) {
  const spots = [];
  const raw = roadNetwork && roadNetwork.roads ? roadNetwork.roads : roadNetwork;
  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (entry && typeof entry.x === 'number' && typeof entry.z === 'number') {
        spots.push({ x: entry.x, z: entry.z, heading: entry.heading || 0 });
      } else if (entry && entry.start && entry.end) {
        // City road segment: park/drive along it, heading down the road.
        const midX = (entry.start.x + entry.end.x) / 2;
        const midZ = (entry.start.z + entry.end.z) / 2;
        const heading = Math.atan2(entry.end.x - entry.start.x, entry.end.z - entry.start.z);
        spots.push({ x: midX, z: midZ, heading });
        spots.push({ x: entry.start.x, z: entry.start.z, heading });
        spots.push({ x: entry.end.x, z: entry.end.z, heading });
      } else if (entry && typeof entry.x1 === 'number') {
        const midX = (entry.x1 + entry.x2) / 2;
        const midZ = (entry.z1 + entry.z2) / 2;
        const heading = Math.atan2(entry.x2 - entry.x1, entry.z2 - entry.z1);
        spots.push({ x: midX, z: midZ, heading });
        spots.push({ x: midX + 6, z: midZ + 6, heading });
      } else if (entry && Array.isArray(entry.points)) {
        entry.points.forEach((point) => {
          spots.push({ x: point.x, z: point.z, heading: point.heading || 0 });
        });
      }
    });
  }
  if (spots.length === 0) {
    for (let gx = -3; gx <= 3; gx++) {
      for (let gz = -3; gz <= 3; gz++) {
        spots.push({ x: gx * 24, z: gz * 24, heading: (gx + gz) % 2 === 0 ? 0 : Math.PI / 2 });
      }
    }
  }
  return spots;
}

export function spawnParkedCars(scene, roadNetwork, count, random) {
  const rng = typeof random === 'function' ? random : fallbackRandom(1337);
  const spots = collectSpots(roadNetwork);
  const cars = [];
  const wanted = count || 14;
  const used = new Set();
  let guard = 0;
  while (cars.length < wanted && guard < wanted * 20) {
    guard++;
    const spot = pick(spots, rng);
    const key = `${Math.round(spot.x)},${Math.round(spot.z)}`;
    if (used.has(key)) continue;
    used.add(key);
    const model = pick(['sedan', 'sedan', 'coupe', 'pickup', 'taxi'], rng);
    const paint = MODEL_SPECS[model].defaultColour;
    const side = rng() > 0.5 ? 1 : -1;
    const car = createCar(
      model,
      paint,
      spot.x + side * 5.5 * Math.cos(spot.heading),
      spot.z - side * 5.5 * Math.sin(spot.heading),
      spot.heading + (side > 0 ? 0 : Math.PI),
    );
    car.parked = true;
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

export function spawnTrafficCar(scene, roadNetwork, random, model) {
  const rng = typeof random === 'function' ? random : fallbackRandom(4242);
  const spots = collectSpots(roadNetwork);
  const spot = pick(spots, rng);
  const name = model && MODEL_SPECS[model] ? model : pick(['sedan', 'coupe', 'taxi', 'pickup'], rng);
  const car = createCar(name, MODEL_SPECS[name].defaultColour, spot.x, spot.z, spot.heading);
  car.isTraffic = true;
  // A simple loop of nearby spots becomes the car's route around the block.
  const nearby = spots.filter((s) => Math.hypot(s.x - spot.x, s.z - spot.z) < 90);
  car.route = (nearby.length >= 3 ? nearby : spots).slice(0, 8).map((s) => ({ x: s.x, z: s.z }));
  car.routeIndex = 0;
  scene.add(car.mesh);
  return car;
}

export function updateTrafficCar(car, dt) {
  if (!car.route || car.route.length === 0) return;
  const target = car.route[car.routeIndex];
  const dx = target.x - car.position.x;
  const dz = target.z - car.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 4) {
    car.routeIndex = (car.routeIndex + 1) % car.route.length;
    return;
  }
  const desired = Math.atan2(dx, dz);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 1.6, -1, 1);
  car.speed = Math.min(car.speed + 8 * dt, 16);
  car.steer(steer, dt);
  car.update(dt, {});
  // Keep the traffic car on its route even while steering.
  car.mesh.position.set(car.position.x, 0, car.position.z);
  car.mesh.rotation.y = car.heading;
}

// ---------------------------------------------------------------------------
// Entering and exiting
// ---------------------------------------------------------------------------

export function nearestCar(playerPosition, cars, maxDistance) {
  let best = null;
  let bestDistance = maxDistance || 4;
  (cars || []).forEach((car) => {
    const distance = Math.hypot(
      car.position.x - playerPosition.x,
      car.position.z - playerPosition.z,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = car;
    }
  });
  return best;
}

export function enterCar(player, car) {
  if (!player || !car) return false;
  player.driving = car;
  player.onFoot = false;
  player.currentVehicle = car;
  if (player.mesh) player.mesh.visible = false;
  car.parked = false;
  return true;
}

export function exitCar(player, car) {
  const vehicle = car || (player && player.driving);
  if (!player || !vehicle) return false;
  // Step out at the driver's door: left side of the car's heading.
  const doorX = vehicle.position.x + Math.cos(vehicle.heading) * -1.6;
  const doorZ = vehicle.position.z - Math.sin(vehicle.heading) * -1.6;
  player.position.x = doorX;
  player.position.z = doorZ;
  player.heading = vehicle.heading;
  player.driving = null;
  player.currentVehicle = null;
  player.onFoot = true;
  if (player.mesh) {
    player.mesh.visible = true;
    player.mesh.position.set(doorX, 0, doorZ);
    player.mesh.rotation.y = vehicle.heading;
  }
  return true;
}

export function updateCar(car, dt, input) {
  if (!car) return;
  car.update(dt, input);
}

export function getSpeedMph(car) {
  if (!car) return 0;
  return car.getSpeedMph ? car.getSpeedMph() : Math.abs(car.speed || 0) * MPH_PER_MS;
}

export function removeCar(scene, car) {
  if (scene && car && car.mesh) scene.remove(car.mesh);
}
