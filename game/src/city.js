// Solmar Bay — procedural city builder (Three.js, sunset coastal downtown)
//
// CityGenerator grows the whole map from one seed: a gradient sunset sky,
// a beach and ocean on the west edge, a nine-by-nine road grid, pastel
// towers with lit windows, rooftop clutter, neon signs, palm trees, the
// SOLMAR CUSTOMS garage, the beachfront Malecon and a pink safehouse.
// Everything it builds is also registered as a collision box so the player
// and the cars cannot drive through walls.
import * as THREE from './three.js';
import { SeededRandom } from './random.js';
import { CONFIG } from './config.js';

// Caps for the instanced meshes (one draw call per set, no matter how big
// the city gets) and the palette the towers are painted from.
const MAX_WINDOWS = 30000;
const MAX_DASHES = 1400;
const MAX_STRIPES = 500;
const TOWER_TONES = [
  0xe0e0e0, 0xd2b48c, 0xffe4e1, 0xadd8e6,
  0xfffacd, 0xf5deb3, 0xffb6c1, 0xfaebd7,
];
const NEON_TONES = [0xff2d95, 0x00e5ff, 0xff9f1c, 0x39ff88];

export class CityGenerator {
  constructor(scene, seed = 42) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.buildings = [];
    this.colliders = [];
  }

  // ---------------------------------------------------------------- build

  build() {
    this._paintSky();
    this._layGround();
    this._seedWindowMesh();

    // Roads and the garage/Malecon/safehouse go down before the towers so
    // the building loop can sit on top of a finished street plan.
    this.buildRoads();
    this.addGarageAndMalecon();
    this._raiseTowers();

    // Freeze the window instancing now that every tower has reported in.
    if (this._winMesh) {
      this._winMesh.count = this._winTotal;
      this._winMesh.instanceMatrix.needsUpdate = true;
      if (this._winMesh.instanceColor) this._winMesh.instanceColor.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------- sky & sun

  _paintSky() {
    this.scene.background = new THREE.Color(0x2a1a3a);
    this.scene.fog = new THREE.FogExp2(0xff9e7a, 0.004);

    // A 4-pixel-wide canvas stretched into a vertical sunset gradient,
    // wrapped around an inside-out sphere so it surrounds the whole map.
    const strip = document.createElement('canvas');
    strip.width = 4;
    strip.height = 256;
    const pen = strip.getContext('2d');
    const sunset = pen.createLinearGradient(0, 0, 0, 256);
    sunset.addColorStop(0, '#1c2a5e');
    sunset.addColorStop(0.45, '#7a4a8a');
    sunset.addColorStop(0.68, '#e86a6a');
    sunset.addColorStop(0.8, '#ff9e4a');
    sunset.addColorStop(1, '#ffd27a');
    pen.fillStyle = sunset;
    pen.fillRect(0, 0, 4, 256);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(800, 24, 16),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(strip),
        side: THREE.BackSide,
        fog: false,
      })
    );
    this.scene.add(dome);

    // Pale sun disc low on the western horizon, wrapped in a soft glow.
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
    );
    sunDisc.position.set(-700, 90, 0);
    sunDisc.lookAt(0, 90, 0);
    this.scene.add(sunDisc);

    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(60, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff9e4a, transparent: true, opacity: 0.35, fog: false,
      })
    );
    halo.position.set(-702, 90, 0);
    halo.lookAt(0, 90, 0);
    this.scene.add(halo);

    // Warm wash from the setting sun, plus a low directional light that
    // throws long shadows eastward across the streets.
    this.scene.add(new THREE.AmbientLight(0xffd9c0, 0.55));
    const sunLight = new THREE.DirectionalLight(0xffb347, 1.5);
    sunLight.position.set(-150, 60, 80);
    sunLight.castShadow = true;
    this.scene.add(sunLight);

    // A handful of flat-bottomed clouds, each a short row of squashed
    // spheres drifting high above the towers.
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffd9c0, transparent: true, opacity: 0.8, fog: false,
    });
    for (let i = 0; i < 8; i++) {
      const cx = this.rng.range(-400, 400);
      const cy = this.rng.range(120, 180);
      const cz = this.rng.range(-400, 400);
      const puffs = 3 + Math.floor(this.rng.next() * 3);
      for (let j = 0; j < puffs; j++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(this.rng.range(8, 16), 8, 6),
          cloudMat
        );
        puff.scale.y = 0.45;
        puff.position.set(
          cx + (j - puffs / 2) * 12,
          cy + this.rng.range(-2, 2),
          cz + this.rng.range(-4, 4)
        );
        this.scene.add(puff);
      }
    }
  }

  // ------------------------------------------------------- ground & shore

  _layGround() {
    const span = CONFIG.WORLD_SIZE * 2;

    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 })
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.y = -0.05;
    this.scene.add(asphalt);

    // Sandy strip hugging the west edge of the map.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(80, span),
      new THREE.MeshStandardMaterial({ color: 0xf4a460, roughness: 0.8 })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(-CONFIG.WORLD_SIZE + 40, 0, 0);
    this.scene.add(sand);

    // Open water further west, a touch below street level with a sheen.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(200, span),
      new THREE.MeshStandardMaterial({
        color: 0x0077be, roughness: 0.2, metalness: 0.3,
      })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(-CONFIG.WORLD_SIZE - 60, -0.1, 0);
    this.scene.add(sea);
  }

  // ------------------------------------------------------------ window pool

  _seedWindowMesh() {
    this._winMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.4, 2.0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_WINDOWS
    );
    this._winMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._winTotal = 0;
    this._winPose = new THREE.Object3D();
    this.scene.add(this._winMesh);
  }

  // ---------------------------------------------------------------- towers

  _raiseTowers() {
    const half = CONFIG.WORLD_SIZE;
    const block = CONFIG.BLOCK_SIZE;
    const step = block + CONFIG.ROAD_WIDTH;

    for (let x = -half + 60; x < half - 60; x += step) {
      for (let z = -half + 60; z < half - 60; z += step) {
        // Leave roughly one block in ten empty for a plaza or park.
        if (this.rng.next() < 0.1) continue;

        const w = block - this.rng.range(2, 8);
        const d = block - this.rng.range(2, 8);
        const h = this.rng.range(20, 75);
        const tone = this.rng.choice(TOWER_TONES);

        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({
            color: tone, roughness: 0.6, metalness: 0.1,
          })
        );
        tower.position.set(x, h / 2, z);
        this.scene.add(tower);
        this.buildings.push(tower);

        this.addWindowsForBuilding(x, z, w, h, d);
        this.addRooftopDetails(x, z, w, h, d);
        if (this.rng.next() < 0.15) this.addNeonSign(x, z, w, h, d);

        // The tower's bounding box is what the player and cars collide with.
        this.colliders.push(new THREE.Box3().setFromObject(tower));

        // A street palm beside about two in five towers.
        if (this.rng.next() < 0.4) this.createPalmTree(x + w / 2 + 3, z);
      }
    }
  }

  // Windows on all four faces, one instanced mesh for the whole city.
  // Rows sit ~6 units apart, columns ~5 apart; about a third of the
  // windows glow warm amber, the rest stay dark blue-grey.
  addWindowsForBuilding(x, z, width, height, depth) {
    const rows = Math.max(2, Math.floor(height / 6));
    const sides = [
      { face: width, ox: 0, oz: depth / 2 + 0.06, yaw: 0, runsX: true },
      { face: width, ox: 0, oz: -depth / 2 - 0.06, yaw: Math.PI, runsX: true },
      { face: depth, ox: width / 2 + 0.06, oz: 0, yaw: Math.PI / 2, runsX: false },
      { face: depth, ox: -width / 2 - 0.06, oz: 0, yaw: -Math.PI / 2, runsX: false },
    ];

    for (const side of sides) {
      const cols = Math.max(2, Math.floor(side.face / 5));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (this._winTotal >= MAX_WINDOWS) return;
          const u = (c + 0.5) / cols - 0.5;
          const v = (r + 0.5) / rows;
          const pose = this._winPose;
          pose.position.set(
            x + side.ox + (side.runsX ? u * (side.face - 4) : 0),
            3 + v * (height - 6),
            z + side.oz + (side.runsX ? 0 : u * (side.face - 4))
          );
          pose.rotation.set(0, side.yaw, 0);
          pose.updateMatrix();
          this._winMesh.setMatrixAt(this._winTotal, pose.matrix);
          const lit = this.rng.next() < 0.35;
          this._winMesh.setColorAt(
            this._winTotal,
            lit ? new THREE.Color(0xffc46b) : new THREE.Color(0x2c3a55)
          );
          this._winTotal++;
        }
      }
    }
  }

  // One or two grey AC boxes on the roof, sometimes a thin antenna with a
  // red tip blinking at the corner.
  addRooftopDetails(x, z, width, height, depth) {
    const acGeo = new THREE.BoxGeometry(1.5, 0.8, 1.5);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
    const units = 1 + Math.floor(this.rng.next() * 2);
    for (let i = 0; i < units; i++) {
      const ac = new THREE.Mesh(acGeo, acMat);
      ac.position.set(
        x + (this.rng.next() - 0.5) * (width - 4),
        height + 0.4,
        z + (this.rng.next() - 0.5) * (depth - 4)
      );
      this.scene.add(ac);
    }

    if (this.rng.next() < 0.4) {
      const ax = x + width / 2 - 2;
      const az = z + depth / 2 - 2;
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      mast.position.set(ax, height + 3, az);
      this.scene.add(mast);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      tip.position.set(ax, height + 6.2, az);
      this.scene.add(tip);
    }
  }

  // A tall glowing vertical sign on the tower's front face, in one of the
  // four neon tones, with a shorter base block hanging below it.
  addNeonSign(x, z, width, height, depth) {
    const glow = this.rng.choice(NEON_TONES);
    const mat = new THREE.MeshBasicMaterial({ color: glow });
    const faceZ = z + depth / 2 + 0.15;
    const signX = x + (this.rng.next() - 0.5) * (width - 4);

    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 0.25), mat);
    tube.position.set(signX, height * 0.45, faceZ);
    this.scene.add(tube);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.5, 0.25), mat);
    base.position.set(signX, height * 0.45 - 5, faceZ);
    this.scene.add(base);
  }

  // ---------------------------------------------------------------- roads

  buildRoads() {
    const centres = [];
    for (let i = 0; i < 9; i++) centres.push(-214 + i * 52);

    const tar = new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.95 });
    const pavement = new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.9 });

    for (const c of centres) {
      // One east-west strip and one north-south strip per centre line.
      const eastWest = new THREE.Mesh(new THREE.BoxGeometry(500, 0.06, 12), tar);
      eastWest.position.set(0, 0, c);
      this.scene.add(eastWest);

      const northSouth = new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 500), tar);
      northSouth.position.set(c, 0, 0);
      this.scene.add(northSouth);

      // Lighter sidewalks hugging both edges of each road.
      for (const off of [-7.5, 7.5]) {
        const walkEW = new THREE.Mesh(new THREE.BoxGeometry(500, 0.15, 3), pavement);
        walkEW.position.set(0, 0.05, c + off);
        this.scene.add(walkEW);
        const walkNS = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 500), pavement);
        walkNS.position.set(c + off, 0.05, 0);
        this.scene.add(walkNS);
      }
    }

    this.addLaneDashes(centres);
    this.addCrosswalks(centres);
  }

  // Yellow centre dashes down every road, one instanced mesh for all of them.
  addLaneDashes(roadCentres) {
    const pose = new THREE.Object3D();
    const dashes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.35, 0.02, 2.5),
      new THREE.MeshBasicMaterial({ color: 0xd8c56a }),
      MAX_DASHES
    );
    let placed = 0;
    for (const c of roadCentres) {
      for (let p = -245; p <= 245 && placed < MAX_DASHES; p += 7) {
        pose.position.set(p, 0.05, c);
        pose.rotation.set(0, Math.PI / 2, 0);
        pose.updateMatrix();
        dashes.setMatrixAt(placed++, pose.matrix);
        if (placed >= MAX_DASHES) break;
        pose.position.set(c, 0.05, p);
        pose.rotation.set(0, 0, 0);
        pose.updateMatrix();
        dashes.setMatrixAt(placed++, pose.matrix);
      }
    }
    dashes.count = placed;
    dashes.instanceMatrix.needsUpdate = true;
    this.scene.add(dashes);
  }

  // White zebra stripes at every road crossing, one instanced mesh.
  addCrosswalks(roadCentres) {
    const pose = new THREE.Object3D();
    const stripes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 0.02, 10),
      new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }),
      MAX_STRIPES
    );
    let placed = 0;
    for (const ix of roadCentres) {
      for (const jz of roadCentres) {
        for (let k = -2; k <= 2 && placed < MAX_STRIPES; k++) {
          pose.position.set(ix + k * 1.6, 0.05, jz);
          pose.rotation.set(0, 0, 0);
          pose.updateMatrix();
          stripes.setMatrixAt(placed++, pose.matrix);
        }
      }
    }
    stripes.count = placed;
    stripes.instanceMatrix.needsUpdate = true;
    this.scene.add(stripes);
  }

  // -------------------------------------------------------------- palm tree

  // A brown tapered trunk about 8 tall, crowned by five green cone fronds
  // fanned out in a ring.
  createPalmTree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.6, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
    );
    trunk.position.set(x, 4, z);
    this.scene.add(trunk);

    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57 });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(2, 0.5, 4), frondMat);
      frond.position.set(x + Math.cos(angle) * 1.5, 8, z + Math.sin(angle) * 1.5);
      frond.rotation.z = 0.3;
      frond.rotation.y = angle;
      this.scene.add(frond);
    }
  }

  // ------------------------------------------- garage, Malecon & safehouse

  addGarageAndMalecon() {
    // (a) SOLMAR CUSTOMS garage at (60, 0, 60): teal block, dark doorway
    // on the south face, a glowing pink sign above it and a thin gold ring
    // on the roof front. Its box goes into the colliders.
    this.garagePos = new THREE.Vector3(60, 0, 60);
    const garage = new THREE.Mesh(
      new THREE.BoxGeometry(24, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0x0e7c7b })
    );
    garage.position.set(60, 4, 60);
    this.scene.add(garage);
    this.colliders.push(new THREE.Box3().setFromObject(garage));

    const doorway = new THREE.Mesh(
      new THREE.BoxGeometry(10, 5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    doorway.position.set(60, 2.5, 67.05);
    this.scene.add(doorway);

    const neonSign = new THREE.Mesh(
      new THREE.BoxGeometry(12, 2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2d95 })
    );
    neonSign.position.set(60, 6.5, 67.05);
    this.scene.add(neonSign);

    const goldRing = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.15, 16, 100),
      new THREE.MeshBasicMaterial({ color: 0xffd700 })
    );
    goldRing.position.set(60, 11, 67);
    this.scene.add(goldRing);

    // (b) The Malecon: a coastal road running north-south at x = -218,
    // with its own dashed centre line and palms down its east edge.
    const malecon = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.06, 480),
      new THREE.MeshStandardMaterial({ color: 0x404040 })
    );
    malecon.position.set(-218, 0.03, 0);
    this.scene.add(malecon);

    const dashes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.35, 0.02, 2.5),
      new THREE.MeshBasicMaterial({ color: 0xd8c56a }),
      60
    );
    const pose = new THREE.Object3D();
    for (let i = 0; i < 60; i++) {
      pose.position.set(-218, 0.05, -236 + i * 8);
      pose.updateMatrix();
      dashes.setMatrixAt(i, pose.matrix);
    }
    this.scene.add(dashes);

    for (let z = -220; z <= 220; z += 24) {
      this.createPalmTree(-208, z);
    }

    // (c) Safehouse: a small pink house at (-40, 0, 50) with a dark door
    // and a magenta beacon cylinder on the roof.
    const house = new THREE.Mesh(
      new THREE.BoxGeometry(10, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0xffb6c1 })
    );
    house.position.set(-40, 3, 50);
    this.scene.add(house);

    const houseDoor = new THREE.Mesh(
      new THREE.BoxGeometry(2, 4, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    houseDoor.position.set(-40, 2, 55.1);
    this.scene.add(houseDoor);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0xff00ff })
    );
    beacon.position.set(-40, 10, 50);
    this.scene.add(beacon);
  }

  // -------------------------------------------------------------- collision

  // True when the circle at `position` (radius wide, 2 tall) touches any
  // building/garage box, or when it strays past the world edge minus a
  // 10-unit margin.
  checkCollision(position, radius = 1) {
    const body = new THREE.Box3(
      new THREE.Vector3(position.x - radius, position.y, position.z - radius),
      new THREE.Vector3(position.x + radius, position.y + 2, position.z + radius)
    );

    for (const box of this.colliders) {
      if (box.intersectsBox(body)) return true;
    }

    const edge = CONFIG.WORLD_SIZE - 10;
    if (Math.abs(position.x) > edge || Math.abs(position.z) > edge) return true;
    return false;
  }
}
