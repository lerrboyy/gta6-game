// Solmar Bay — pedestrians and ambient traffic.
//
// Two kinds of street life live here: people on foot, walking the sidewalks
// and scattering when gunfire starts, and ambient cars driving the road
// network and pausing at intersections. Neither of them knows about the
// story or the police; the loop just calls update() every frame and calls
// triggerFlee() when a shot goes off.

import * as configModule from './config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const configValues = configModule.default ?? configModule;
void configValues;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance2D(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dz * dz);
}

function makeRandom(rng) {
  if (typeof rng === 'function') {
    return {
      value: () => rng(),
      range: (min, max) => min + rng() * (max - min),
      int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
      pick: (list) => list[Math.floor(rng() * list.length)],
      shuffle: (list) => {
        const copy = [...list];
        for (let i = copy.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rng() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      },
    };
  }
  if (rng && typeof rng.range === 'function') {
    return {
      value: () => (typeof rng.value === 'function' ? rng.value() : Math.random()),
      range: (min, max) => rng.range(min, max),
      int: (min, max) => (typeof rng.int === 'function' ? rng.int(min, max) : Math.floor(min + Math.random() * (max - min + 1))),
      pick: (list) => (typeof rng.pick === 'function' ? rng.pick(list) : list[Math.floor(Math.random() * list.length)]),
      shuffle: (list) => {
        const copy = [...list];
        for (let i = copy.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      },
    };
  }
  return {
    value: () => Math.random(),
    range: (min, max) => min + Math.random() * (max - min),
    int: (min, max) => Math.floor(min + Math.random() * (max - min + 1)),
    pick: (list) => list[Math.floor(Math.random() * list.length)],
    shuffle: (list) => {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

const SHIRT_COLOURS = [
  0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6,
  0xfd7e14, 0x1abc9c, 0xecf0f1, 0x34495e, 0xff6b9d,
];
const SKIN_TONES = [0xc68e5e, 0x8d5524, 0xffdbac, 0xf1c27d, 0xe0ac69];
const TROUSER_COLOURS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1a1a1a, 0x4a4a4a];
const CAR_COLOURS = [0xc0392b, 0x2980b9, 0xf39c12, 0x7f8c8d, 0x27ae60, 0xececec, 0x8e44ad, 0xd35400];

const PEDESTRIAN_COUNT = 26;
const TRAFFIC_COUNT = 10;
const WALK_SPEED = 1.25;
const FLEE_SPEED = 3.6;
const FLEE_RADIUS = 42;
const TRAFFIC_SPEED = 8;

// The city grid is roughly eight blocks across; streets sit on this spacing
// when the road network the loop hands in does not describe its own.
const GRID_SPACING = 40;
const GRID_EXTENT = 160;

// ---------------------------------------------------------------------------
// Sidewalk and road paths
//
// The road network from the city module can arrive in several shapes: an
// object with sidewalk / road / intersection lists, an array of road
// segments, or nothing at all. Normalise whatever arrives into a set of
// walking paths (sidewalks, offset from the road centre) and driving loops
// (rectangles around city blocks), falling back to the regular grid.
// ---------------------------------------------------------------------------

function normaliseRoads(roads) {
  const paths = [];
  const loops = [];
  const intersections = [];

  const addPath = (points) => {
    if (Array.isArray(points) && points.length >= 2) paths.push(points);
  };

  if (Array.isArray(roads?.sidewalks)) {
    for (const walk of roads.sidewalks) addPath(walk);
  }
  if (Array.isArray(roads?.paths)) {
    for (const walk of roads.paths) addPath(walk);
  }
  if (Array.isArray(roads?.roads)) {
    for (const road of roads.roads) {
      if (Array.isArray(road)) addPath(road);
      else if (Array.isArray(road.points)) addPath(road.points);
    }
  }
  if (Array.isArray(roads)) {
    for (const road of roads) {
      if (Array.isArray(road)) addPath(road);
      else if (Array.isArray(road.points)) addPath(road.points);
    }
  }
  if (Array.isArray(roads?.intersections)) {
    for (const point of roads.intersections) intersections.push(point);
  }

  // Driving loops: rectangles around blocks, one per block, traced clockwise.
  for (let bx = -GRID_EXTENT; bx < GRID_EXTENT; bx += GRID_SPACING) {
    for (let bz = -GRID_EXTENT; bz < GRID_EXTENT; bz += GRID_SPACING) {
      const half = GRID_SPACING / 2 - 4;
      const cx = bx + GRID_SPACING / 2;
      const cz = bz + GRID_SPACING / 2;
      loops.push([
        { x: cx - half, z: cz - half },
        { x: cx + half, z: cz - half },
        { x: cx + half, z: cz + half },
        { x: cx - half, z: cz + half },
      ]);
    }
  }

  // If no sidewalk paths arrived, build them from the same grid: a path
  // along each street, offset a few metres to the side of the road.
  if (paths.length === 0) {
    for (let line = -GRID_EXTENT; line <= GRID_EXTENT; line += GRID_SPACING) {
      paths.push([
        { x: -GRID_EXTENT, z: line + 6 },
        { x: GRID_EXTENT, z: line + 6 },
      ]);
      paths.push([
        { x: line + 6, z: -GRID_EXTENT },
        { x: line + 6, z: GRID_EXTENT },
      ]);
    }
  }

  if (intersections.length === 0) {
    for (let x = -GRID_EXTENT; x <= GRID_EXTENT; x += GRID_SPACING) {
      for (let z = -GRID_EXTENT; z <= GRID_EXTENT; z += GRID_SPACING) {
        intersections.push({ x, z });
      }
    }
  }

  return { paths, loops, intersections };
}

// ---------------------------------------------------------------------------
// Low-poly figures and cars, built from boxes with the global THREE object
// ---------------------------------------------------------------------------

function buildPedestrianMesh(random) {
  const group = new THREE.Group();

  const shirt = new THREE.MeshLambertMaterial({ color: random.pick(SHIRT_COLOURS) });
  const skin = new THREE.MeshLambertMaterial({ color: random.pick(SKIN_TONES) });
  const trousers = new THREE.MeshLambertMaterial({ color: random.pick(TROUSER_COLOURS) });
  const hair = new THREE.MeshLambertMaterial({ color: random.pick([0x1a1a1a, 0x4a2c14, 0x777777, 0x2c1a08]) });

  // Torso and head.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirt);
  torso.position.y = 1.05;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.55;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), hair);
  cap.position.y = 1.72;
  group.add(cap);

  // Arms hang at the sides and swing while walking. Each limb gets its own
  // geometry, translated so it pivots around its top (shoulder / hip).
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), shirt);
  leftArm.geometry.translate(0, -0.2, 0);
  leftArm.position.set(-0.3, 1.32, 0);
  group.add(leftArm);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), shirt);
  rightArm.geometry.translate(0, -0.2, 0);
  rightArm.position.set(0.3, 1.32, 0);
  group.add(rightArm);

  // Legs.
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.16), trousers);
  leftLeg.geometry.translate(0, -0.3, 0);
  leftLeg.position.set(-0.11, 0.72, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.16), trousers);
  rightLeg.geometry.translate(0, -0.3, 0);
  rightLeg.position.set(0.11, 0.72, 0);
  group.add(rightLeg);

  group.userData.limbs = { leftArm, rightArm, leftLeg, rightLeg };
  return group;
}

function buildTrafficCarMesh(random) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: random.pick(CAR_COLOURS) });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.2), paint);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), glass);
  cabin.position.set(0, 1.05, -0.2);
  group.add(cabin);

  const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 10);
  wheelGeometry.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.9, -1.35], [0.9, -1.35], [-0.9, 1.35], [0.9, 1.35]]) {
    const wheel = new THREE.Mesh(wheelGeometry, tyre);
    wheel.position.set(x, 0.34, z);
    group.add(wheel);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPedestrians(scene, roads, rng) {
  const random = makeRandom(rng);
  const network = normaliseRoads(roads);
  const pedestrians = [];
  const traffic = [];

  function spawnPedestrian() {
    const mesh = buildPedestrianMesh(random);
    const path = random.pick(network.paths);
    const startIndex = random.int(0, path.length - 1);
    const start = path[startIndex];
    mesh.position.set(
      start.x + random.range(-1.5, 1.5),
      0,
      start.z + random.range(-1.5, 1.5),
    );
    scene.add(mesh);
    const person = {
      mesh,
      path,
      waypointIndex: (startIndex + 1) % path.length,
      direction: random.value() < 0.5 ? 1 : -1,
      speed: random.range(0.9, 1.6),
      walkPhase: random.range(0, Math.PI * 2),
      fleeing: false,
      fleeTimer: 0,
      fleeDirection: { x: 0, z: 0 },
    };
    pedestrians.push(person);
    return person;
  }

  function spawnTrafficCar() {
    const mesh = buildTrafficCarMesh(random);
    const loop = random.pick(network.loops);
    const startIndex = random.int(0, loop.length - 1);
    const start = loop[startIndex];
    mesh.position.set(start.x, 0, start.z);
    scene.add(mesh);
    const car = {
      mesh,
      loop,
      waypointIndex: (startIndex + 1) % loop.length,
      speed: random.range(6, 10),
      stopTimer: random.range(0, 2),
      waiting: false,
    };
    traffic.push(car);
    return car;
  }

  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) spawnPedestrian();
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar();

  function nearestIntersection(position) {
    let best = null;
    let bestDistance = Infinity;
    for (const point of network.intersections) {
      const distance = distance2D(position, point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    return { point: best, distance: bestDistance };
  }

  function updatePedestrian(person, dt) {
    const mesh = person.mesh;

    if (person.fleeing) {
      person.fleeTimer -= dt;
      mesh.position.x += person.fleeDirection.x * FLEE_SPEED * dt;
      mesh.position.z += person.fleeDirection.z * FLEE_SPEED * dt;
      mesh.rotation.y = Math.atan2(person.fleeDirection.x, person.fleeDirection.z);
      person.walkPhase += dt * 11;
      if (person.fleeTimer <= 0) {
        person.fleeing = false;
        // Pick the nearest sidewalk again after scattering.
        let bestPath = network.paths[0];
        let bestDistance = Infinity;
        for (const path of network.paths) {
          for (const point of path) {
            const distance = distance2D(mesh.position, point);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestPath = path;
            }
          }
        }
        person.path = bestPath;
        person.waypointIndex = 0;
      }
    } else {
      const target = person.path[person.waypointIndex];
      const dx = target.x - mesh.position.x;
      const dz = target.z - mesh.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < 0.6) {
        person.waypointIndex += person.direction;
        if (person.waypointIndex >= person.path.length || person.waypointIndex < 0) {
          person.direction *= -1;
          person.waypointIndex = clamp(person.waypointIndex, 0, person.path.length - 1);
        }
      } else {
        const step = person.speed * dt;
        mesh.position.x += (dx / distance) * step;
        mesh.position.z += (dz / distance) * step;
        mesh.rotation.y = Math.atan2(dx, dz);
        person.walkPhase += dt * 7;
      }
    }

    // Walk swing.
    const limbs = mesh.userData.limbs;
    if (limbs) {
      const swing = Math.sin(person.walkPhase) * 0.5;
      limbs.leftArm.rotation.x = swing;
      limbs.rightArm.rotation.x = -swing;
      limbs.leftLeg.rotation.x = -swing;
      limbs.rightLeg.rotation.x = swing;
    }
  }

  function updateTrafficCar(car, dt) {
    const mesh = car.mesh;
    if (car.waiting) {
      car.stopTimer -= dt;
      if (car.stopTimer <= 0) car.waiting = false;
      return;
    }
    const target = car.loop[car.waypointIndex];
    const dx = target.x - mesh.position.x;
    const dz = target.z - mesh.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < 1.0) {
      car.waypointIndex = (car.waypointIndex + 1) % car.loop.length;
      // Stop at intersections: the next waypoint sits on a crossing, so
      // pause there for a beat before rolling on.
      const near = nearestIntersection(mesh.position);
      if (near.point && near.distance < 7 && random.value() < 0.7) {
        car.waiting = true;
        car.stopTimer = random.range(1, 2.5);
      }
      return;
    }
    const step = car.speed * dt;
    mesh.position.x += (dx / distance) * step;
    mesh.position.z += (dz / distance) * step;
    mesh.rotation.y = Math.atan2(dx, dz);
  }

  const module = {
    getPedestrians() {
      return pedestrians;
    },

    getTraffic() {
      return traffic;
    },

    getCount() {
      return pedestrians.length;
    },

    spawnPedestrian() {
      return spawnPedestrian();
    },

    // Make everyone near a position run away from it — called when a shot
    // is fired. People outside the radius keep walking.
    triggerFlee(position, radius) {
      if (!position) return 0;
      const reach = typeof radius === 'number' ? radius : FLEE_RADIUS;
      let fled = 0;
      for (const person of pedestrians) {
        const distance = distance2D(person.mesh.position, position);
        if (distance > reach) continue;
        const awayX = person.mesh.position.x - position.x;
        const awayZ = person.mesh.position.z - position.z;
        const length = Math.sqrt(awayX * awayX + awayZ * awayZ) || 1;
        // Scatter: mostly away from the shot, with a random sideways push
        // so the crowd does not run in a single line.
        const sideways = random.range(-0.6, 0.6);
        const dirX = awayX / length + sideways;
        const dirZ = awayZ / length + (random.value() < 0.5 ? sideways : -sideways);
        const dirLength = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
        person.fleeDirection = { x: dirX / dirLength, z: dirZ / dirLength };
        person.fleeing = true;
        person.fleeTimer = random.range(2.5, 5);
        fled += 1;
      }
      return fled;
    },

    // Aliases the loop may use for the same idea.
    fleeAt(position, radius) {
      return module.triggerFlee(position, radius);
    },

    fleeFrom(position, radius) {
      return module.triggerFlee(position, radius);
    },

    scatter(position, radius) {
      return module.triggerFlee(position, radius);
    },

    // One frame of street life. `context` is optional: the loop may pass
    // { gunfirePosition } (or a bare position) when a shot was just fired.
    update(dt, context) {
      if (context) {
        const gunfire = context.gunfirePosition ?? context.shotPosition ?? context.gunfire ?? null;
        if (gunfire) module.triggerFlee(gunfire);
        else if (typeof context.x === 'number' && context.shotsFired) {
          module.triggerFlee(context);
        }
      }
      for (const person of pedestrians) updatePedestrian(person, dt);
      for (const car of traffic) updateTrafficCar(car, dt);
    },

    reset() {
      for (const person of [...pedestrians]) scene.remove(person.mesh);
      for (const car of [...traffic]) scene.remove(car.mesh);
      pedestrians.length = 0;
      traffic.length = 0;
      for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) spawnPedestrian();
      for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar();
    },
  };

  return module;
}

export default createPedestrians;
