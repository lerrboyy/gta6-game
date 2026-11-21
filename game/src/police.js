// Solmar Bay — wanted level and police.
//
// The police module watches the wanted level on the shared world state and
// answers with cruisers, roadblocks and, from three stars up, a helicopter.
// It never decides guilt itself: the loop (or the world) raises the wanted
// level when a crime happens, and this module turns that number into units
// on the street. The HUD asks it for the dispatch list; the loop asks it
// whether the player just got busted.

import * as configModule from './config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const configValues = configModule.default ?? configModule;

function configNumber(key, fallback) {
  const value = configValues?.[key];
  return typeof value === 'number' ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance2D(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dz * dz);
}

function angleTo(from, to) {
  return Math.atan2((to.x ?? 0) - (from.x ?? 0), (to.z ?? 0) - (from.z ?? 0));
}

// The generator the loop hands in may be a bare function returning 0..1, an
// object with range/pick helpers, or nothing at all. Normalise it once.
function makeRandom(rng) {
  if (typeof rng === 'function') {
    return {
      value: () => rng(),
      range: (min, max) => min + rng() * (max - min),
      pick: (list) => list[Math.floor(rng() * list.length)],
    };
  }
  if (rng && typeof rng.range === 'function') {
    return {
      value: () => (typeof rng.value === 'function' ? rng.value() : Math.random()),
      range: (min, max) => rng.range(min, max),
      pick: (list) => (typeof rng.pick === 'function' ? rng.pick(list) : list[Math.floor(Math.random() * list.length)]),
    };
  }
  return {
    value: () => Math.random(),
    range: (min, max) => min + Math.random() * (max - min),
    pick: (list) => list[Math.floor(Math.random() * list.length)],
  };
}

const CALL_SIGN_WORDS = ['PIER', 'TIDE', 'PALM', 'REEF', 'SAND', 'CORAL', 'BAY', 'SURF'];
const TACTICS = ['RAMMING', 'PURSUIT', 'SPOTLIGHT', 'ROADBLOCK'];

// How many cruisers each star level fields, and how far out they spawn.
const CRUISERS_PER_STAR = [0, 2, 3, 4, 5, 6];
const SPAWN_DISTANCE = configNumber('policeSpawnDistance', 75);
const HELI_MIN_STARS = 3;

// ---------------------------------------------------------------------------
// Low-poly cruiser, built here from the global THREE object.
// (The brief allows building it here instead of borrowing the vehicles
// module's model, which keeps this module free of a cross-module shape
// guess while the other files are still being rewritten.)
// ---------------------------------------------------------------------------

function buildCruiserMesh() {
  const group = new THREE.Group();

  const paint = new THREE.MeshLambertMaterial({ color: 0x1a2436 });
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const red = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0x881111 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x2a5cff, emissive: 0x111188 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.4), paint);
  body.position.y = 0.55;
  group.add(body);

  const doors = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.4, 2.2), white);
  doors.position.set(0, 0.62, 0.2);
  group.add(doors);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.0), glass);
  cabin.position.set(0, 1.05, -0.2);
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.6), paint);
  roof.position.set(0, 1.32, -0.2);
  group.add(roof);

  // Light bar: red on one side, blue on the other.
  const barRed = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.3), red);
  barRed.position.set(-0.35, 1.42, -0.2);
  group.add(barRed);
  const barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.3), blue);
  barBlue.position.set(0.35, 1.42, -0.2);
  group.add(barBlue);

  const headlightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x887733 });
  for (const side of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.1), headlightMat);
    lamp.position.set(side, 0.6, -2.22);
    group.add(lamp);
  }

  const wheelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeometry.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.4], [0.95, 1.4]]) {
    const wheel = new THREE.Mesh(wheelGeometry, tyre);
    wheel.position.set(x, 0.36, z);
    group.add(wheel);
  }

  group.userData.lightBar = { red: barRed, blue: barBlue };
  return group;
}

function buildHelicopterMesh() {
  const group = new THREE.Group();

  const paint = new THREE.MeshLambertMaterial({ color: 0x223344 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3.6), paint);
  group.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.2), glass);
  nose.position.set(0, -0.1, -2.1);
  group.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.2), paint);
  tail.position.set(0, 0.3, 3.6);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.8), paint);
  fin.position.set(0, 0.9, 5.4);
  group.add(fin);

  const rotor = new THREE.Group();
  const bladeGeometry = new THREE.BoxGeometry(7.5, 0.08, 0.5);
  rotor.add(new THREE.Mesh(bladeGeometry, dark));
  const bladeCross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 7.5), dark);
  rotor.add(bladeCross);
  rotor.position.y = 1.0;
  group.add(rotor);
  group.userData.rotor = rotor;

  // Spotlight cone: a translucent cone hanging under the heli, apex at the
  // aircraft, widening towards the ground.
  const coneMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff2b0,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 32, 20, 1, true), coneMaterial);
  cone.position.y = -16;
  cone.rotation.x = Math.PI; // wide end down
  group.add(cone);
  group.userData.spotlight = cone;

  const poolMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff2b0,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 20), poolMaterial);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -31.5;
  group.add(pool);
  group.userData.spotlightPool = pool;

  return group;
}

// ---------------------------------------------------------------------------
// Reading / writing the wanted level on the shared state
// ---------------------------------------------------------------------------

function readWanted(state) {
  if (!state) return 0;
  if (typeof state.wantedLevel === 'number') return state.wantedLevel;
  if (typeof state.wanted === 'number') return state.wanted;
  if (typeof state.stars === 'number') return state.stars;
  const nested = state.world ?? state.game ?? null;
  if (nested) {
    if (typeof nested.wantedLevel === 'number') return nested.wantedLevel;
    if (typeof nested.wanted === 'number') return nested.wanted;
  }
  return 0;
}

function writeWanted(state, level) {
  const clamped = clamp(Math.round(level), 0, 5);
  if (!state) return clamped;
  if (typeof state.wantedLevel === 'number' || 'wantedLevel' in state) {
    state.wantedLevel = clamped;
    return clamped;
  }
  if (typeof state.wanted === 'number' || 'wanted' in state) {
    state.wanted = clamped;
    return clamped;
  }
  const nested = state.world ?? state.game ?? null;
  if (nested) {
    if (typeof nested.wantedLevel === 'number') nested.wantedLevel = clamped;
    else if (typeof nested.wanted === 'number') nested.wanted = clamped;
    else nested.wantedLevel = clamped;
    return clamped;
  }
  state.wantedLevel = clamped;
  return clamped;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPolice(scene, state, rng) {
  const random = makeRandom(rng);
  const units = []; // cruiser units
  let helicopter = null; // { mesh, angle, radius }
  let busted = false;
  let boxedTimer = 0;
  let lastPlayerPosition = { x: 0, z: 0 };
  let nextCallSignNumber = 5;

  function makeCallSign() {
    const word = random.pick(CALL_SIGN_WORDS);
    const number = nextCallSignNumber;
    nextCallSignNumber += 1;
    if (nextCallSignNumber > 9) nextCallSignNumber = 1;
    return `${word} ${number}`;
  }

  function spawnCruiser(position, tactic, callSign) {
    const mesh = buildCruiserMesh();
    mesh.position.set(position.x ?? 0, 0, position.z ?? 0);
    scene.add(mesh);
    const unit = {
      kind: 'cruiser',
      mesh,
      callSign: callSign ?? makeCallSign(),
      tactic: tactic ?? 'PURSUIT',
      speed: 0,
      heading: 0,
      staged: false,
      holdTimer: 0,
    };
    units.push(unit);
    return unit;
  }

  function removeCruiser(unit) {
    scene.remove(unit.mesh);
    const index = units.indexOf(unit);
    if (index >= 0) units.splice(index, 1);
  }

  function spawnHelicopter(position) {
    if (helicopter) return helicopter;
    const mesh = buildHelicopterMesh();
    mesh.position.set(position?.x ?? 0, 34, position?.z ?? -55);
    scene.add(mesh);
    helicopter = { kind: 'helicopter', mesh, angle: 0, radius: 55, callSign: 'AIR ONE', tactic: 'SPOTLIGHT', staged: false };
    return helicopter;
  }

  function removeHelicopter() {
    if (!helicopter) return;
    scene.remove(helicopter.mesh);
    helicopter = null;
  }

  function desiredCruiserCount(wanted) {
    if (wanted <= 0) return 0;
    return CRUISERS_PER_STAR[clamp(wanted, 0, 5)] ?? 2;
  }

  function syncUnits(wanted, playerPosition) {
    const freeUnits = units.filter((unit) => !unit.staged);
    const wantedCount = desiredCruiserCount(wanted);

    // Too many free cruisers: pull the farthest ones off the street.
    while (freeUnits.length > wantedCount) {
      let farthest = freeUnits[0];
      for (const unit of freeUnits) {
        if (distance2D(unit.mesh.position, playerPosition) > distance2D(farthest.mesh.position, playerPosition)) {
          farthest = unit;
        }
      }
      removeCruiser(farthest);
      freeUnits.splice(freeUnits.indexOf(farthest), 1);
    }

    // Too few: spawn fresh ones at a distance from the player.
    while (freeUnits.length < wantedCount) {
      const angle = random.range(0, Math.PI * 2);
      const distance = SPAWN_DISTANCE + random.range(0, 25);
      const position = {
        x: playerPosition.x + Math.cos(angle) * distance,
        z: playerPosition.z + Math.sin(angle) * distance,
      };
      const unit = spawnCruiser(position, 'PURSUIT');
      freeUnits.push(unit);
    }

    // Helicopter only at three stars and up.
    if (wanted >= HELI_MIN_STARS) {
      if (!helicopter) {
        spawnHelicopter({ x: playerPosition.x, z: playerPosition.z - 55 });
      }
    } else if (helicopter && !helicopter.staged) {
      removeHelicopter();
    }
  }

  function assignTactics(wanted, playerPosition, playerSpeed) {
    // Closest cruiser rams; the rest pursue. At four stars and up, one unit
    // peels off to set a roadblock ahead of the player's path.
    const freeUnits = units.filter((unit) => !unit.staged);
    if (freeUnits.length === 0) return;
    const sorted = [...freeUnits].sort(
      (a, b) => distance2D(a.mesh.position, playerPosition) - distance2D(b.mesh.position, playerPosition),
    );
    sorted.forEach((unit, index) => {
      if (index === 0) unit.tactic = 'RAMMING';
      else unit.tactic = 'PURSUIT';
    });
    if (wanted >= 4 && sorted.length >= 3) {
      sorted[sorted.length - 1].tactic = 'ROADBLOCK';
    }
    void playerSpeed;
  }

  function moveCruiser(unit, dt, playerPosition, playerHeading, playerSpeed) {
    if (unit.staged) return;
    const mesh = unit.mesh;
    const position = { x: mesh.position.x, z: mesh.position.z };
    const distance = distance2D(position, playerPosition);

    let target = playerPosition;
    let speed = 0;

    if (unit.tactic === 'ROADBLOCK') {
      // Park ahead of where the player is heading and wait there.
      const ahead = 26;
      const heading = playerHeading ?? 0;
      target = {
        x: playerPosition.x + Math.sin(heading) * ahead,
        z: playerPosition.z + Math.cos(heading) * ahead,
      };
      speed = distance2D(position, target) > 4 ? 16 : 0;
    } else if (unit.tactic === 'RAMMING') {
      target = playerPosition;
      speed = 19 + readWanted(state) * 1.2;
    } else {
      // PURSUIT: trail the player from slightly behind their line of travel.
      target = playerPosition;
      speed = 15 + readWanted(state) * 1.0;
      if (distance < 6) speed = Math.max(6, playerSpeed ?? 0);
    }

    const headingToTarget = angleTo(position, target);
    let headingDiff = headingToTarget - unit.heading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    unit.heading += clamp(headingDiff, -2.4 * dt, 2.4 * dt);
    unit.speed = speed;

    mesh.position.x += Math.sin(unit.heading) * speed * dt;
    mesh.position.z += Math.cos(unit.heading) * speed * dt;
    mesh.rotation.y = unit.heading;

    // Blink the light bar.
    const bar = mesh.userData.lightBar;
    if (bar) {
      const on = Math.floor(performance.now() / 280) % 2 === 0;
      bar.red.material.emissive.setHex(on ? 0xcc1111 : 0x330000);
      bar.blue.material.emissive.setHex(on ? 0x111188 : 0x2222cc);
    }
  }

  function moveHelicopter(dt, playerPosition) {
    if (!helicopter) return;
    if (helicopter.staged) {
      if (helicopter.mesh.userData.rotor) helicopter.mesh.userData.rotor.rotation.y += dt * 14;
      return;
    }
    helicopter.angle += dt * 0.35;
    helicopter.radius = 55;
    helicopter.mesh.position.x = playerPosition.x + Math.cos(helicopter.angle) * helicopter.radius;
    helicopter.mesh.position.z = playerPosition.z + Math.sin(helicopter.angle) * helicopter.radius;
    helicopter.mesh.position.y = 34;
    helicopter.mesh.rotation.y = -helicopter.angle;
    if (helicopter.mesh.userData.rotor) {
      helicopter.mesh.userData.rotor.rotation.y += dt * 16;
    }
    // Keep the spotlight pool on the player below.
    const pool = helicopter.mesh.userData.spotlightPool;
    if (pool) {
      pool.position.x = playerPosition.x - helicopter.mesh.position.x;
      pool.position.z = playerPosition.z - helicopter.mesh.position.z;
      pool.position.y = -33;
    }
  }

  function checkBusted(dt, playerPosition, playerSpeed, onFoot) {
    if (busted) return true;
    for (const unit of units) {
      const distance = distance2D(unit.mesh.position, playerPosition);
      // A cruiser touching the player on foot is an arrest.
      if (onFoot && distance < 2.6) {
        busted = true;
        return true;
      }
    }
    // Boxed in: two or more cruisers pressed against a slow car.
    if (!onFoot) {
      const close = units.filter((unit) => distance2D(unit.mesh.position, playerPosition) < 4.5);
      if (close.length >= 2 && (playerSpeed ?? 0) < 1.5) {
        boxedTimer += dt;
        if (boxedTimer > 2.0) {
          busted = true;
          return true;
        }
      } else {
        boxedTimer = 0;
      }
    }
    return false;
  }

  const module = {
    getWanted() {
      return readWanted(state);
    },

    setWanted(level) {
      return writeWanted(state, level);
    },

    clearWanted() {
      return writeWanted(state, 0);
    },

    // Raise the wanted level for a crime. Shooting and stealing jump a
    // full star; speeding past the police nudges it only if it is already
    // above zero in the caller's judgement — here it adds one as well but
    // never past five.
    reportCrime(type) {
      const current = readWanted(state);
      let gain = 1;
      if (type === 'shooting' || type === 'shoot' || type === 'kill') gain = 1;
      else if (type === 'stealing' || type === 'steal' || type === 'carjack') gain = 1;
      else if (type === 'speeding' || type === 'speed') gain = current > 0 ? 1 : 0;
      else gain = 1;
      if (gain === 0) return current;
      return writeWanted(state, current + gain);
    },

    addWanted(amount) {
      return writeWanted(state, readWanted(state) + (amount ?? 1));
    },

    isBusted() {
      return busted;
    },

    getUnits() {
      return units;
    },

    getHelicopter() {
      return helicopter;
    },

    // The dispatch panel for the HUD: every active unit with its call sign,
    // its distance from the player in metres, and its current tactic.
    getDispatch() {
      const list = units.map((unit) => ({
        callSign: unit.callSign,
        distance: Math.round(distance2D(unit.mesh.position, lastPlayerPosition)),
        tactic: unit.tactic,
      }));
      if (helicopter) {
        list.push({
          callSign: helicopter.callSign,
          distance: Math.round(distance2D(helicopter.mesh.position, lastPlayerPosition)),
          tactic: 'SPOTLIGHT',
        });
      }
      return list;
    },

    // Stage one unit exactly where the caller wants it, with an explicit
    // tactic and call sign. Used by the screenshot runner to set the play
    // scene (for example PIER 5 at 10 metres RAMMING, TIDE 6 at 18 metres
    // PURSUIT, AIR ONE at 55 metres SPOTLIGHT). Staged units hold their
    // spot and are not despawned by the normal sync. Accepts either a
    // position object {x, z} or plain x, z numbers as the first arguments.
    placeUnit(positionOrX, tacticOrZ, callSignOrTactic, maybeCallSign) {
      let position;
      let tactic;
      let callSign;
      if (typeof positionOrX === 'object' && positionOrX !== null) {
        position = positionOrX;
        tactic = tacticOrZ ?? 'PURSUIT';
        callSign = callSignOrTactic ?? makeCallSign();
      } else {
        position = { x: positionOrX ?? 0, z: tacticOrZ ?? 0 };
        tactic = callSignOrTactic ?? 'PURSUIT';
        callSign = maybeCallSign ?? makeCallSign();
      }
      const upperTactic = String(tactic).toUpperCase();
      if (upperTactic === 'SPOTLIGHT') {
        const heli = spawnHelicopter(position);
        heli.callSign = callSign;
        heli.tactic = 'SPOTLIGHT';
        heli.staged = true;
        heli.mesh.position.set(position.x ?? 0, 34, position.z ?? 0);
        return heli;
      }
      const unit = spawnCruiser(position, TACTICS.includes(upperTactic) ? upperTactic : 'PURSUIT', callSign);
      unit.staged = true;
      unit.tactic = TACTICS.includes(upperTactic) ? upperTactic : 'PURSUIT';
      return unit;
    },

    // One frame of police logic. The loop passes the player position and,
    // when it has them, the player's speed, heading and whether they are
    // on foot. Returns { busted, wanted } so the loop can flip state.
    update(dt, playerPosition, playerSpeed, playerHeading, onFoot) {
      const position = playerPosition
        ?? state?.player?.position
        ?? state?.player?.pos
        ?? lastPlayerPosition;
      lastPlayerPosition = { x: position.x ?? 0, z: position.z ?? 0 };

      // A staged screenshot scene: the units were placed by hand and must
      // stay exactly where they are, so skip spawning, chasing and arrests
      // and only keep the helicopter rotor turning.
      if (module._shotStaged) {
        moveHelicopter(dt, lastPlayerPosition);
        return { busted: false, wanted: readWanted(state) };
      }

      const wanted = readWanted(state);
      const speed = typeof playerSpeed === 'number' ? playerSpeed : 0;
      const heading = typeof playerHeading === 'number' ? playerHeading : (state?.player?.heading ?? 0);
      const foot = typeof onFoot === 'boolean' ? onFoot : !(state?.player?.driving ?? state?.player?.inCar ?? false);

      if (wanted <= 0 && !units.some((unit) => unit.staged) && !helicopter?.staged) {
        // No heat and nothing staged: clear the street.
        for (const unit of [...units]) removeCruiser(unit);
        if (helicopter) removeHelicopter();
        boxedTimer = 0;
        return { busted: false, wanted: 0 };
      }

      syncUnits(wanted, lastPlayerPosition);
      assignTactics(wanted, lastPlayerPosition, speed);
      for (const unit of [...units]) {
        moveCruiser(unit, dt, lastPlayerPosition, heading, speed);
      }
      moveHelicopter(dt, lastPlayerPosition);

      const caught = checkBusted(dt, lastPlayerPosition, speed, foot);
      if (caught) {
        if (state) state.busted = true;
        return { busted: true, wanted };
      }
      return { busted: false, wanted };
    },

    reset() {
      for (const unit of [...units]) removeCruiser(unit);
      if (helicopter) removeHelicopter();
      busted = false;
      boxedTimer = 0;
      module._shotStaged = false;
      writeWanted(state, 0);
    },
  };

  return module;
}

export default createPolice;

// Stage a fixed set of units for a screenshot scene, placing each one
// through the module's own placeUnit. `state` is the shared game state
// (state.police is the module instance, state.player carries the position
// and heading to stage around); `units` is a list of { id, distance,
// tactic }. Cruisers are set ahead of the player, fanned left and right
// so they read in the chase camera, and a SPOTLIGHT unit becomes the
// helicopter hovering ahead. Staged units hold their spot, and the
// module's per-frame update leaves a staged scene alone.
export function stagePoliceUnits(state, units) {
  const police = state?.police;
  if (!police || typeof police.placeUnit !== 'function') return [];
  const player = state.player || {};
  const spot = player.position || { x: 0, z: 0 };
  const heading = player.heading || 0;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  const placed = [];
  for (let i = 0; i < (units || []).length; i += 1) {
    const spec = units[i];
    const distance = typeof spec.distance === 'number' ? spec.distance : 20;
    const side = i === 0 ? -1 : i === 1 ? 1 : 0;
    const across = side * Math.min(6, 3 + i * 2);
    const x = (spot.x ?? 0) + forwardX * distance + rightX * across;
    const z = (spot.z ?? 0) + forwardZ * distance + rightZ * across;
    const unit = police.placeUnit(
      { x, z },
      spec.tactic || 'PURSUIT',
      spec.id || spec.callSign,
    );
    if (unit) placed.push(unit);
  }
  police._shotStaged = true;
  return placed;
}
