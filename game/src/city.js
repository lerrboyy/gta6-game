// city.js — Solmar Bay city builder (round 8 fresh rewrite).
//
// Builds the whole coastal city into a THREE scene from a seeded
// generator, so the layout is identical on every load: an 8x8 street
// grid of low-poly blocks with glowing windows, rooftop clutter and
// neon shop signs, the palm-lined Malecón boulevard along the sea, a
// sandy beach, a pier, a safehouse and the SOLMAR CUSTOMS garage.
//
// The module only talks to the outside world through buildCity, which
// returns the building colliders, the road network and the landmark
// positions the other modules need. Colours, the seed and the palette
// come from the config module; the dice come from the seeded random
// factory. All geometry uses the global THREE object — nothing here
// imports the three.js library itself.

import * as configModule from './config.js';
import * as randomModule from './random.js';

// ---------------------------------------------------------------------------
// Config values, with local fallbacks so the city still builds if a key
// is missing or named differently in the config module.
// ---------------------------------------------------------------------------

const FALLBACK_COLORS = {
  ground: 0x35313c,
  road: 0x232028,
  sidewalk: 0x8d8578,
  sand: 0xe0c184,
  foam: 0xf5f2e8,
  planted: 0x5d7046,
  buildingPalette: [
    0xd9a066, 0xc97e5a, 0xe8c98f, 0x9fb4c7,
    0xb98a7a, 0x7fa88f, 0xd97b6c, 0xa89cc0,
  ],
  roof: 0x5a5460,
  neonPink: 0xff4fa3,
  neonCyan: 0x37e6e6,
  palmTrunk: 0x8a6a4a,
  palmLeaf: 0x3f9e4d,
  lampPole: 0x2c2c34,
  lampGlow: 0xffc46b,
  pierWood: 0x7a5a3c,
  wall: 0xcfc4a8,
  safehouse: 0xe8963f,
  garage: 0x4a6b8a,
  awning: 0xe0566e,
  umbrellas: [0xe0566e, 0x37b6c9, 0xf2a541, 0x7fb069, 0xff8c42],
};

// The config module may export a CONFIG object, a default object, or
// bare named constants — accept any of those shapes.
const CONFIG = configModule.CONFIG ?? configModule.default ?? configModule;
const CONFIG_COLORS = (CONFIG && CONFIG.COLORS) || {};
const COLORS = { ...FALLBACK_COLORS, ...CONFIG_COLORS };
const SEED =
  (CONFIG && (CONFIG.SEED ?? CONFIG.seed ?? CONFIG.CITY_SEED)) ?? 20261121;

// ---------------------------------------------------------------------------
// Layout constants. x runs west (-) to east (+), z runs north (-) to
// south (+), y is up and the ground is y = 0. The sea is to the west.
// ---------------------------------------------------------------------------

const PITCH = 38; // road centreline to road centreline
const ROAD_WIDTH = 12;
const BLOCK = PITCH - ROAD_WIDTH; // 26 m of buildable block
const GRID = 8; // 8 x 8 blocks
const HALF = (GRID * PITCH) / 2; // 152 — city spans -152..152
const ROAD_Y = 0.02;
const WALK_Y = 0.05;
const MARK_Y = 0.08;

const MALECON_X = -HALF - 26; // -178, centreline of the waterfront road
const PROMENADE_X = -HALF - 12; // -164, pedestrian strip by the road
const PALM_STRIP_X = -HALF - 39; // -191, planted strip with the palm row
const SEA_WALL_X = -HALF - 44; // -196, low wall between strip and sand
const BEACH_X = -HALF - 62; // -214, centre of the sand
const SHORE_X = -HALF - 80; // -232, waterline where the sand ends

const SAFEHOUSE_BLOCK = { i: 1, j: 5 }; // safehouse lives in this block
const GARAGE_BLOCK = { i: 4, j: 2 }; // SOLMAR CUSTOMS lives in this block

const SHOP_SIGNS = [
  'TACOS', 'BAR', 'HOTEL', 'CAFÉ', 'CLUB', 'PIZZA',
  'MOTEL', 'CANTINA', 'FARMACIA', 'LICOR', 'POLLO', 'SURF',
];

// ---------------------------------------------------------------------------
// Seeded dice. Accepts whatever the caller passes — a factory-made
// generator object, a bare next() function, or nothing at all (then a
// generator is built from the config seed here). A tiny local
// mulberry-style fallback is kept so the city never fails to build.
// ---------------------------------------------------------------------------

function mulberryFallback(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeDice(source) {
  let base = source ?? null;
  if (!base) {
    const factory =
      randomModule.createSeededRandom ??
      randomModule.createRng ??
      randomModule.mulberry32 ??
      randomModule.default ??
      null;
    base = typeof factory === 'function' ? factory(SEED) : null;
  }
  if (!base) base = mulberryFallback(SEED);

  const next = typeof base === 'function' ? base : base.next.bind(base);
  const range =
    typeof base.range === 'function'
      ? base.range.bind(base)
      : (lo, hi) => lo + next() * (hi - lo);
  const int =
    typeof base.int === 'function'
      ? base.int.bind(base)
      : (lo, hi) => Math.floor(range(lo, hi + 1));
  const pick =
    typeof base.pick === 'function'
      ? base.pick.bind(base)
      : (list) => list[Math.floor(next() * list.length)];
  return { next, range, int, pick };
}

// ---------------------------------------------------------------------------
// Canvas textures. Windows and signs are drawn once on offscreen
// canvases and reused; the window grid tiles across a facade by
// scaling the plane's UVs, so one texture serves every building.
// ---------------------------------------------------------------------------

function makeWindowTexture(next) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  const cols = 8;
  const rows = 10;
  const cw = 256 / cols;
  const ch = 256 / rows;
  const litTints = ['#ffd27a', '#ffbe55', '#ffe6a3'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = next() < 0.55;
      const x = c * cw + 5;
      const y = r * ch + 6;
      const w = cw - 10;
      const h = ch - 12;
      if (lit) {
        ctx.fillStyle = litTints[Math.floor(next() * litTints.length)];
        ctx.globalAlpha = 0.75 + next() * 0.25;
      } else {
        ctx.fillStyle = '#232838';
        ctx.globalAlpha = 0.9;
      }
      ctx.fillRect(x, y, w, h);
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeSignTexture(text, hex) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  const css = '#' + hex.toString(16).padStart(6, '0');
  const size = Math.min(64, Math.floor(470 / (text.length * 0.62)));
  ctx.font = 'bold ' + size + 'px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = css;
  ctx.shadowBlur = 24;
  ctx.fillStyle = css;
  ctx.fillText(text, 256, 66);
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 66);
  return new THREE.CanvasTexture(canvas);
}

function makeDashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 16, 128);
  ctx.fillStyle = '#e8d06a';
  ctx.fillRect(5, 18, 6, 92);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeCrosswalkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = '#f2efe4';
  for (let i = 0; i < 6; i++) ctx.fillRect(12 + i * 42, 8, 24, 112);
  return new THREE.CanvasTexture(canvas);
}

// Scales a plane's UVs so a repeating texture tiles instead of
// stretching across the whole face.
function scaleUvs(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return geo;
}

// ---------------------------------------------------------------------------
// The city builder.
// ---------------------------------------------------------------------------

export function buildCity(scene, rng) {
  const { next, range, int, pick } = normalizeDice(rng);
  const colliders = [];
  const roads = [];

  // --- shared textures and materials -------------------------------------

  const windowMats = [
    makeWindowTexture(next),
    makeWindowTexture(next),
    makeWindowTexture(next),
  ].map((tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true }));

  const matDash = new THREE.MeshBasicMaterial({
    map: makeDashTexture(),
    transparent: true,
  });
  const matCross = new THREE.MeshBasicMaterial({
    map: makeCrosswalkTexture(),
    transparent: true,
  });

  const matGround = new THREE.MeshLambertMaterial({
    color: COLORS.ground,
    flatShading: true,
  });
  const matRoad = new THREE.MeshLambertMaterial({
    color: COLORS.road,
    flatShading: true,
  });
  const matSidewalk = new THREE.MeshLambertMaterial({
    color: COLORS.sidewalk,
    flatShading: true,
  });
  const matSand = new THREE.MeshLambertMaterial({
    color: COLORS.sand,
    flatShading: true,
  });
  const matFoam = new THREE.MeshBasicMaterial({ color: COLORS.foam });
  const matPlanted = new THREE.MeshLambertMaterial({
    color: COLORS.planted,
    flatShading: true,
  });
  const matRoof = new THREE.MeshLambertMaterial({
    color: COLORS.roof,
    flatShading: true,
  });
  const matPalmTrunk = new THREE.MeshLambertMaterial({
    color: COLORS.palmTrunk,
    flatShading: true,
  });
  const matPalmLeaf = new THREE.MeshLambertMaterial({
    color: COLORS.palmLeaf,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const matLampPole = new THREE.MeshLambertMaterial({
    color: COLORS.lampPole,
    flatShading: true,
  });
  const matLampGlow = new THREE.MeshBasicMaterial({ color: COLORS.lampGlow });
  const matPierWood = new THREE.MeshLambertMaterial({
    color: COLORS.pierWood,
    flatShading: true,
  });
  const matWall = new THREE.MeshLambertMaterial({
    color: COLORS.wall,
    flatShading: true,
  });
  const matAC = new THREE.MeshLambertMaterial({
    color: 0x9a9aa2,
    flatShading: true,
  });
  const matTank = new THREE.MeshLambertMaterial({
    color: 0x4a5a6a,
    flatShading: true,
  });
  const matAntenna = new THREE.MeshLambertMaterial({
    color: 0x3a3a42,
    flatShading: true,
  });
  const matAwning = new THREE.MeshLambertMaterial({
    color: COLORS.awning,
    flatShading: true,
  });
  const matShack = new THREE.MeshLambertMaterial({
    color: 0xa9743f,
    flatShading: true,
  });
  const matBoatHull = new THREE.MeshLambertMaterial({
    color: 0xf0ede4,
    flatShading: true,
  });
  const matBoatCabin = new THREE.MeshLambertMaterial({
    color: 0x4a7fa5,
    flatShading: true,
  });

  // Cached per-colour facade materials and per-text neon sign materials.
  const facadeMats = new Map();
  const signMats = new Map();
  function facadeMat(hex) {
    let mat = facadeMats.get(hex);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
      facadeMats.set(hex, mat);
    }
    return mat;
  }
  function signMat(text, hex) {
    const key = text + '|' + hex;
    let mat = signMats.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        map: makeSignTexture(text, hex),
        transparent: true,
      });
      signMats.set(key, mat);
    }
    return mat;
  }

  // --- shared geometries ---------------------------------------------------

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.26, 1, 6);
  const nutGeo = new THREE.SphereGeometry(0.32, 6, 5);
  const frondGeo = new THREE.PlaneGeometry(0.55, 2.6);
  frondGeo.translate(0, 1.3, 0);
  const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6);
  const lampArmGeo = new THREE.BoxGeometry(1.2, 0.1, 0.1);
  const lampHeadGeo = new THREE.BoxGeometry(0.55, 0.2, 0.3);
  const glowGeo = new THREE.SphereGeometry(0.17, 8, 6);
  const acGeo = new THREE.BoxGeometry(1.4, 0.7, 1.2);
  const tankGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.7, 8);
  const tankLidGeo = new THREE.ConeGeometry(1.0, 0.7, 8);
  const antennaGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 5);
  const crossbarGeo = new THREE.BoxGeometry(1.2, 0.08, 0.08);
  const pierPostGeo = new THREE.CylinderGeometry(0.28, 0.28, 2.4, 6);

  // --- small helpers -------------------------------------------------------

  function flatPlane(w, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }

  function blockBounds(i, j) {
    const x0 = -HALF + i * PITCH + ROAD_WIDTH / 2;
    const z0 = -HALF + j * PITCH + ROAD_WIDTH / 2;
    return { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK };
  }

  // Splits one block into one, two or four building lots.
  function lotsForBlock() {
    const inset = 2.2;
    const span = BLOCK - inset * 2; // 21.6 m of lot per side
    const roll = next();
    if (roll < 0.35) {
      return [{ dx: 0, dz: 0, w: span, d: span }];
    }
    const half = span / 2 - 0.9;
    const off = span / 4 + 0.45;
    if (roll < 0.75) {
      if (next() < 0.5) {
        return [
          { dx: -off, dz: 0, w: half, d: span },
          { dx: off, dz: 0, w: half, d: span },
        ];
      }
      return [
        { dx: 0, dz: -off, w: span, d: half },
        { dx: 0, dz: off, w: span, d: half },
      ];
    }
    return [
      { dx: -off, dz: -off, w: half, d: half },
      { dx: off, dz: -off, w: half, d: half },
      { dx: -off, dz: off, w: half, d: half },
      { dx: off, dz: off, w: half, d: half },
    ];
  }

  // Glowing window grids on all four faces of a building.
  function addWindowWalls(cx, cz, w, d, h) {
    const mat = windowMats[Math.floor(next() * windowMats.length)];
    const sv = Math.max(1, Math.round(h / 9));
    const faces = [
      { len: w, x: cx, z: cz + d / 2 + 0.07, ry: 0 },
      { len: w, x: cx, z: cz - d / 2 - 0.07, ry: Math.PI },
      { len: d, x: cx + w / 2 + 0.07, z: cz, ry: Math.PI / 2 },
      { len: d, x: cx - w / 2 - 0.07, z: cz, ry: -Math.PI / 2 },
    ];
    for (const f of faces) {
      const geo = new THREE.PlaneGeometry(f.len, h);
      scaleUvs(geo, Math.max(1, Math.round(f.len / 9)), sv);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(f.x, h / 2, f.z);
      mesh.rotation.y = f.ry;
      scene.add(mesh);
    }
  }

  // Parapet cap plus a random scatter of AC units, water tanks and
  // antennas so the rooflines read as lived-in, not flat slabs.
  function addRoofDetails(cx, cz, w, d, h) {
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4),
      matRoof
    );
    cap.position.set(cx, h + 0.2, cz);
    scene.add(cap);

    const count = 1 + int(0, 2);
    for (let k = 0; k < count; k++) {
      const rx = cx + range(-w / 2 + 1.8, w / 2 - 1.8);
      const rz = cz + range(-d / 2 + 1.8, d / 2 - 1.8);
      const kind = next();
      if (kind < 0.4) {
        const ac = new THREE.Mesh(acGeo, matAC);
        ac.position.set(rx, h + 0.75, rz);
        ac.rotation.y = range(0, Math.PI);
        scene.add(ac);
      } else if (kind < 0.7) {
        const tank = new THREE.Mesh(tankGeo, matTank);
        tank.position.set(rx, h + 1.25, rz);
        scene.add(tank);
        const lid = new THREE.Mesh(tankLidGeo, matTank);
        lid.position.set(rx, h + 2.45, rz);
        scene.add(lid);
      } else {
        const ant = new THREE.Mesh(antennaGeo, matAntenna);
        ant.position.set(rx, h + 2.4, rz);
        scene.add(ant);
        const bar = new THREE.Mesh(crossbarGeo, matAntenna);
        bar.position.set(rx, h + 3.9, rz);
        bar.rotation.y = range(0, Math.PI);
        scene.add(bar);
      }
      // A few taller roofs get a stair bulkhead hut as well.
      if (h > 20 && next() < 0.4) {
        const hut = new THREE.Mesh(
          new THREE.BoxGeometry(3, 2.2, 2.5),
          matRoof
        );
        hut.position.set(
          cx + range(-w / 2 + 2.5, w / 2 - 2.5),
          h + 1.5,
          cz + range(-d / 2 + 2.5, d / 2 - 2.5)
        );
        scene.add(hut);
      }
    }
  }

  // Neon shop sign plus a striped-colour awning on one face.
  function addShopFront(cx, cz, w, d, side) {
    const text = pick(SHOP_SIGNS);
    const hex = next() < 0.5 ? COLORS.neonPink : COLORS.neonCyan;
    const signW = Math.min(w * 0.72, 8);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(signW, 1.7),
      signMat(text, hex)
    );
    const y = 3.6;
    let awn;
    if (side === 'west') {
      mesh.position.set(cx - w / 2 - 0.14, y, cz);
      mesh.rotation.y = -Math.PI / 2;
      awn = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.16, signW * 0.85),
        matAwning
      );
      awn.position.set(cx - w / 2 - 0.85, 2.9, cz);
      awn.rotation.z = 0.28;
    } else if (side === 'east') {
      mesh.position.set(cx + w / 2 + 0.14, y, cz);
      mesh.rotation.y = Math.PI / 2;
      awn = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.16, signW * 0.85),
        matAwning
      );
      awn.position.set(cx + w / 2 + 0.85, 2.9, cz);
      awn.rotation.z = -0.28;
    } else if (side === 'north') {
      mesh.position.set(cx, y, cz - d / 2 - 0.14);
      mesh.rotation.y = Math.PI;
      awn = new THREE.Mesh(
        new THREE.BoxGeometry(signW * 0.85, 0.16, 1.5),
        matAwning
      );
      awn.position.set(cx, 2.9, cz - d / 2 - 0.85);
      awn.rotation.x = -0.28;
    } else {
      mesh.position.set(cx, y, cz + d / 2 + 0.14);
      awn = new THREE.Mesh(
        new THREE.BoxGeometry(signW * 0.85, 0.16, 1.5),
        matAwning
      );
      awn.position.set(cx, 2.9, cz + d / 2 + 0.85);
      awn.rotation.x = 0.28;
    }
    scene.add(mesh);
    scene.add(awn);
  }

  // One building: body, window grids, roof clutter, optional shop
  // front, and its collider footprint.
  function addBuilding(cx, cz, w, d, floors, signSide) {
    const h = floors * 3.4;
    const mat = facadeMat(pick(COLORS.buildingPalette));
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.set(cx, h / 2, cz);
    scene.add(body);
    addWindowWalls(cx, cz, w, d, h);
    addRoofDetails(cx, cz, w, d, h);
    colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    });
    if (signSide) addShopFront(cx, cz, w, d, signSide);
  }

  function addPalm(x, z) {
    const h = range(5, 7.5);
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, matPalmTrunk);
    trunk.scale.y = h;
    trunk.position.y = h / 2;
    trunk.rotation.z = range(-0.05, 0.05);
    group.add(trunk);
    const nut = new THREE.Mesh(nutGeo, matPalmTrunk);
    nut.position.y = h + 0.1;
    group.add(nut);
    const fronds = 7;
    for (let k = 0; k < fronds; k++) {
      const pivot = new THREE.Group();
      pivot.position.y = h;
      pivot.rotation.y = (k / fronds) * Math.PI * 2 + range(-0.25, 0.25);
      const frond = new THREE.Mesh(frondGeo, matPalmLeaf);
      frond.rotation.x = range(1.9, 2.2);
      pivot.add(frond);
      group.add(pivot);
    }
    group.position.set(x, 0, z);
    scene.add(group);
  }

  function addLamp(x, z, armEast) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(lampPoleGeo, matLampPole);
    pole.position.y = 2.75;
    group.add(pole);
    const arm = new THREE.Mesh(lampArmGeo, matLampPole);
    arm.position.set(armEast ? 0.55 : -0.55, 5.45, 0);
    group.add(arm);
    const head = new THREE.Mesh(lampHeadGeo, matLampPole);
    head.position.set(armEast ? 1.05 : -1.05, 5.35, 0);
    group.add(head);
    const glow = new THREE.Mesh(glowGeo, matLampGlow);
    glow.position.set(armEast ? 1.05 : -1.05, 5.2, 0);
    group.add(glow);
    group.position.set(x, 0, z);
    scene.add(group);
  }

  function addTrafficLight(x, z) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 4.6, 6),
      matLampPole
    );
    pole.position.y = 2.3;
    group.add(pole);
    const headBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 1.15, 0.45),
      matLampPole
    );
    headBox.position.y = 4.6;
    group.add(headBox);
    const lit = int(0, 2);
    const cols = [0xff3b30, 0xffc21a, 0x2fd35f];
    for (let k = 0; k < 3; k++) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshBasicMaterial({
          color: k === lit ? cols[k] : 0x222222,
        })
      );
      lamp.position.set(0, 4.95 - k * 0.36, -0.26);
      group.add(lamp);
    }
    group.position.set(x, 0, z);
    scene.add(group);
  }

  // --- ground, roads, sidewalks, markings ---------------------------------

  // Big ground slab under the whole city; the ocean plane itself is
  // owned by the renderer module and starts at the shoreline.
  flatPlane(402, 340, matGround, -31, 0, 0);

  // Vertical and horizontal roads, one plane per road.
  for (let k = 0; k <= GRID; k++) {
    const c = -HALF + k * PITCH;
    flatPlane(ROAD_WIDTH, 2 * HALF, matRoad, c, ROAD_Y, 0);
    flatPlane(2 * HALF, ROAD_WIDTH, matRoad, 0, ROAD_Y, c);
  }

  // Centre dashed lines down every road.
  for (let k = 0; k <= GRID; k++) {
    const c = -HALF + k * PITCH;
    const vGeo = scaleUvs(
      new THREE.PlaneGeometry(0.4, 2 * HALF),
      1,
      Math.round((2 * HALF) / 8)
    );
    const vDash = new THREE.Mesh(vGeo, matDash);
    vDash.rotation.x = -Math.PI / 2;
    vDash.position.set(c, MARK_Y, 0);
    scene.add(vDash);
    const hGeo = scaleUvs(
      new THREE.PlaneGeometry(2 * HALF, 0.4),
      Math.round((2 * HALF) / 8),
      1
    );
    const hDash = new THREE.Mesh(hGeo, matDash);
    hDash.rotation.x = -Math.PI / 2;
    hDash.position.set(0, MARK_Y, c);
    scene.add(hDash);
  }

  // Zebra crossings on the two central avenues.
  const crossGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 5);
  crossGeo.rotateX(-Math.PI / 2);
  const crossGeoR = new THREE.PlaneGeometry(ROAD_WIDTH, 5);
  crossGeoR.rotateX(-Math.PI / 2);
  crossGeoR.rotateY(Math.PI / 2);
  for (let k = 0; k <= GRID; k++) {
    const c = -HALF + k * PITCH;
    const a = new THREE.Mesh(crossGeo, matCross);
    a.position.set(0, MARK_Y, c);
    scene.add(a);
    const b = new THREE.Mesh(crossGeoR, matCross);
    b.position.set(c, MARK_Y, 0);
    scene.add(b);
  }

  // --- the Malecón, the beach and the sea edge -----------------------------

  // Wide waterfront boulevard — one long straight run for chases.
  flatPlane(16, 2 * HALF + 16, matRoad, MALECON_X, ROAD_Y, 0);
  const mGeo = scaleUvs(
    new THREE.PlaneGeometry(0.4, 2 * HALF + 16),
    1,
    Math.round((2 * HALF + 16) / 8)
  );
  const mDash = new THREE.Mesh(mGeo, matDash);
  mDash.rotation.x = -Math.PI / 2;
  mDash.position.set(MALECON_X, MARK_Y, 0);
  scene.add(mDash);
  // Crossings from the city onto the Malecón.
  const maleconCrossGeo = new THREE.PlaneGeometry(16, 5);
  maleconCrossGeo.rotateX(-Math.PI / 2);
  for (const z of [-76, 0, 76]) {
    const cross = new THREE.Mesh(maleconCrossGeo, matCross);
    cross.position.set(MALECON_X, MARK_Y, z);
    scene.add(cross);
  }

  // Promenade walkway between the city road and the Malecón.
  flatPlane(12, 2 * HALF + 16, matSidewalk, PROMENADE_X, WALK_Y, 0);
  // Planted strip carrying the palm row.
  flatPlane(10, 2 * HALF + 16, matPlanted, PALM_STRIP_X, WALK_Y, 0);
  // Sandy beach, then a pale foam line at the waterline.
  flatPlane(36, 320, matSand, BEACH_X, 0.04, 0);
  flatPlane(2.5, 320, matFoam, SHORE_X - 0.5, 0.06, 0);

  // Low sea wall with gaps so the player can reach the sand.
  const wallGaps = [
    [-152, -80],
    [-72, -4],
    [4, 72],
    [80, 152],
  ];
  for (const [z0, z1] of wallGaps) {
    const len = z1 - z0;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.1, len),
      matWall
    );
    wall.position.set(SEA_WALL_X, 0.55, (z0 + z1) / 2);
    scene.add(wall);
    colliders.push({
      minX: SEA_WALL_X - 0.45,
      maxX: SEA_WALL_X + 0.45,
      minZ: z0,
      maxZ: z1,
    });
  }

  // --- the pier --------------------------------------------------------------

  const pierX = -221;
  const pierLen = 52;
  const deckY = 1.0;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(pierLen, 0.7, 8),
    matPierWood
  );
  deck.position.set(pierX, deckY, 0);
  scene.add(deck);
  for (let x = -198; x >= -244; x -= 6) {
    for (const dz of [-3.2, 3.2]) {
      const post = new THREE.Mesh(pierPostGeo, matPierWood);
      post.position.set(x, 0.1, dz);
      scene.add(post);
    }
  }
  for (const dz of [-3.8, 3.8]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(pierLen, 0.12, 0.12),
      matPierWood
    );
    rail.position.set(pierX, 2.05, dz);
    scene.add(rail);
    for (let x = -198; x >= -244; x -= 11.5) {
      const railPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.7, 0.12),
        matPierWood
      );
      railPost.position.set(x, 1.7, dz);
      scene.add(railPost);
    }
  }
  // Lamp posts down the pier, alternating sides, plus a bait shack
  // with a pyramid roof at the far end.
  [-206, -218, -230, -242].forEach((lx, li) => {
    const lz = li % 2 === 0 ? -3 : 3;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 3.0, 6),
      matLampPole
    );
    pole.position.set(lx, deckY + 0.35 + 1.5, lz);
    scene.add(pole);
    const glow = new THREE.Mesh(glowGeo, matLampGlow);
    glow.position.set(lx, deckY + 0.35 + 3.1, lz);
    scene.add(glow);
  });
  const shack = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3, 4), matShack);
  shack.position.set(-242, deckY + 0.35 + 1.5, 0);
  scene.add(shack);
  const shackRoof = new THREE.Mesh(
    new THREE.ConeGeometry(3.6, 1.8, 4),
    matRoof
  );
  shackRoof.position.set(-242, deckY + 0.35 + 3 + 0.9, 0);
  shackRoof.rotation.y = Math.PI / 4;
  scene.add(shackRoof);
  colliders.push({ minX: -244.3, maxX: -239.7, minZ: -2, maxZ: 2 });
  // A few crates stacked near the shack.
  for (const [cx, cy, cz] of [
    [-238, deckY + 0.7, 2.4],
    [-238, deckY + 0.7, 1.2],
    [-238, deckY + 1.7, 1.8],
  ]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matPierWood);
    crate.position.set(cx, cy, cz);
    scene.add(crate);
  }

  // --- boats and beach life --------------------------------------------------

  function addBoat(x, z, ry) {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 2.4), matBoatHull);
    hull.position.y = 0.4;
    group.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.9, 1.6),
      matBoatCabin
    );
    cabin.position.set(-0.6, 1.35, 0);
    group.add(cabin);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 4.5, 5),
      matAntenna
    );
    mast.position.set(0.8, 3.0, 0);
    group.add(mast);
    group.position.set(x, 0, z);
    group.rotation.y = ry;
    scene.add(group);
  }
  addBoat(-252, 30, 0.5);
  addBoat(-258, -42, -0.9);

  for (let k = 0; k < 5; k++) {
    const ux = range(-228, -202);
    const uz = range(-130, 130);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5),
      matLampPole
    );
    pole.position.set(ux, 1.15, uz);
    scene.add(pole);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 0.9, 8),
      new THREE.MeshLambertMaterial({
        color: pick(COLORS.umbrellas),
        flatShading: true,
      })
    );
    shade.position.set(ux, 2.6, uz);
    scene.add(shade);
    const towel = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.07, 0.9),
      new THREE.MeshLambertMaterial({
        color: pick(COLORS.umbrellas),
        flatShading: true,
      })
    );
    towel.position.set(ux + 1.8, 0.1, uz + 0.8);
    towel.rotation.y = range(0, Math.PI);
    scene.add(towel);
  }

  // --- the building blocks ---------------------------------------------------

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const b = blockBounds(i, j);
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;

      // Sidewalk slab around the block, slightly proud of the roads.
      flatPlane(BLOCK + 6, BLOCK + 6, matSidewalk, cx, WALK_Y, cz);

      // The safehouse and garage blocks are built specially below.
      if (
        (i === SAFEHOUSE_BLOCK.i && j === SAFEHOUSE_BLOCK.j) ||
        (i === GARAGE_BLOCK.i && j === GARAGE_BLOCK.j)
      ) {
        continue;
      }

      for (const lot of lotsForBlock()) {
        let floors = 2 + int(0, 3);
        if (next() < 0.16) floors += int(2, 5);
        // Taller skyline toward the city centre.
        if (Math.hypot(cx, cz) < 80 && next() < 0.35) floors += int(1, 3);
        floors = Math.min(floors, 12);

        let signSide = null;
        const shopRoll = i === 0 ? 0.55 : 0.3;
        if (next() < shopRoll) {
          signSide =
            i === 0
              ? 'west' // face the Malecón
              : pick(['north', 'south', 'east', 'west']);
        }
        addBuilding(cx + lot.dx, cz + lot.dz, lot.w, lot.d, floors, signSide);
      }
    }
  }

  // --- the safehouse ---------------------------------------------------------

  const safehouse = { x: -95, z: 57 };
  {
    const w = 10;
    const d = 9;
    const h = 6.8;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({
        color: COLORS.safehouse,
        flatShading: true,
      })
    );
    body.position.set(safehouse.x, h / 2, safehouse.z);
    scene.add(body);
    addWindowWalls(safehouse.x, safehouse.z, w, d, h);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(7.6, 3.2, 4),
      matRoof
    );
    roof.position.set(safehouse.x, h + 1.6, safehouse.z);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);
    // Front door on the south face, with a warm porch light.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 2.6, 0.15),
      matLampPole
    );
    door.position.set(safehouse.x, 1.3, safehouse.z + d / 2 + 0.05);
    scene.add(door);
    const porch = new THREE.Mesh(glowGeo, matLampGlow);
    porch.position.set(safehouse.x + 1.4, 3.1, safehouse.z + d / 2 + 0.15);
    scene.add(porch);
    // Low hedges flanking the door.
    for (const hx of [-3.6, 3.6]) {
      const hedge = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.9, 0.8),
        matPlanted
      );
      hedge.position.set(safehouse.x + hx, 0.45, safehouse.z + d / 2 + 1.6);
      scene.add(hedge);
    }
    colliders.push({
      minX: safehouse.x - w / 2,
      maxX: safehouse.x + w / 2,
      minZ: safehouse.z - d / 2,
      maxZ: safehouse.z + d / 2,
    });
  }

  // --- SOLMAR CUSTOMS garage ---------------------------------------------------

  const garage = { x: 19, z: -57 };
  {
    const w = 22;
    const d = 10;
    const h = 6;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({
        color: COLORS.garage,
        flatShading: true,
      })
    );
    body.position.set(garage.x, h / 2, garage.z);
    scene.add(body);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6),
      matRoof
    );
    slab.position.set(garage.x, h + 0.2, garage.z);
    scene.add(slab);
    // Roller door on the south face.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(8, 4.6, 0.25),
      matLampPole
    );
    door.position.set(garage.x, 2.3, garage.z + d / 2 + 0.1);
    scene.add(door);
    // Big cyan neon sign above the door.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 1.6),
      signMat('SOLMAR CUSTOMS', COLORS.neonCyan)
    );
    sign.position.set(garage.x, 5.2, garage.z + d / 2 + 0.16);
    scene.add(sign);
    // Tyre stacks and oil drums on the forecourt.
    const tyreGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.4, 10);
    const matTyre = new THREE.MeshLambertMaterial({
      color: 0x1c1c20,
      flatShading: true,
    });
    for (let s = 0; s < 3; s++) {
      for (let t = 0; t < 3; t++) {
        const tyre = new THREE.Mesh(tyreGeo, matTyre);
        tyre.position.set(garage.x - 9 + s * 1.6, 0.2 + t * 0.4, garage.z + d / 2 + 1.4);
        scene.add(tyre);
      }
    }
    const drumGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 8);
    for (const dx of [-1.2, 0]) {
      const drum = new THREE.Mesh(drumGeo, matTank);
      drum.position.set(garage.x + 9, 0.55, garage.z + d / 2 + 1.2 + dx);
      scene.add(drum);
    }
    colliders.push({
      minX: garage.x - w / 2,
      maxX: garage.x + w / 2,
      minZ: garage.z - d / 2,
      maxZ: garage.z + d / 2,
    });
  }

  // --- palms, lamps and traffic lights ---------------------------------------

  // The Malecón palm row, one palm every 14 m.
  for (let z = -147; z <= 147; z += 14) {
    addPalm(PALM_STRIP_X, z);
  }
  // A few palms scattered on the beach.
  for (let k = 0; k < 8; k++) {
    addPalm(range(-228, -203), range(-140, 140));
  }
  // A few palms in block corners around the city.
  for (let k = 0; k < 6; k++) {
    const b = blockBounds(int(0, GRID - 1), int(0, GRID - 1));
    addPalm(b.x0 + 1.2, b.z0 + 1.2);
  }

  // Street lamps down the Malecón, arms reaching over the road.
  for (let z = -144; z <= 144; z += 24) {
    addLamp(-187.5, z, true);
  }
  // Lamps and traffic lights at the main intersections.
  const junctions = [
    [0, 0],
    [76, 0],
    [-76, 0],
    [0, 76],
    [0, -76],
  ];
  for (const [jx, jz] of junctions) {
    addLamp(jx + 7, jz + 7, false);
    addLamp(jx - 7, jz - 7, true);
    addTrafficLight(jx + 7, jz - 7);
  }

  // --- the road network (for traffic, missions and the minimap) -------------

  for (let k = 0; k <= GRID; k++) {
    const c = -HALF + k * PITCH;
    for (let j = 0; j < GRID; j++) {
      const z0 = -HALF + j * PITCH;
      roads.push({
        start: { x: c, z: z0 },
        end: { x: c, z: z0 + PITCH },
        dir: { x: 0, z: 1 },
      });
    }
    for (let i = 0; i < GRID; i++) {
      const x0 = -HALF + i * PITCH;
      roads.push({
        start: { x: x0, z: c },
        end: { x: x0 + PITCH, z: c },
        dir: { x: 1, z: 0 },
      });
    }
  }
  // The Malecón as four long straight runs — the chase road.
  for (let s = 0; s < 4; s++) {
    const z0 = -HALF + s * ((2 * HALF) / 4);
    roads.push({
      start: { x: MALECON_X, z: z0 },
      end: { x: MALECON_X, z: z0 + (2 * HALF) / 4 },
      dir: { x: 0, z: 1 },
    });
  }

  return {
    colliders,
    roads,
    landmarks: {
      safehouse: { x: safehouse.x, z: safehouse.z },
      garage: { x: garage.x, z: garage.z },
      pier: { x: -242, z: 0 },
      beach: { x: BEACH_X, z: 20 },
      malecon: { x: MALECON_X, z: 0 },
    },
    bounds: { minX: SHORE_X, maxX: HALF, minZ: -HALF, maxZ: HALF },
    seed: SEED,
  };
}
