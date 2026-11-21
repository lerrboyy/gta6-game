import * as THREE from './three.js';
import { SeededRandom } from './random.js';
import { CONFIG } from './config.js';

const WINDOW_CAPACITY = 30000;
const DASH_CAPACITY = 1400;
const CROSSWALK_CAPACITY = 500;

const BUILDING_PALETTE = [
  0xe0e0e0, 0xd2b48c, 0xffe4e1, 0xadd8e6,
  0xfffacd, 0xf5deb3, 0xffb6c1, 0xfaebd7,
];

const NEON_PALETTE = [0xff2d95, 0x00e5ff, 0xff9f1c, 0x39ff88];

export class CityGenerator {
  constructor(scene, seed = 42) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.buildings = [];
    this.colliders = [];
    this.garagePos = null;
    this._windowMesh = null;
    this._windowCount = 0;
    this._transformMatrixHelper = new THREE.Object3D();
  }

  build() {
    this._setupEnvironment();
    this._setupGroundAndWater();
    this._initializeWindowInstances();

    this.buildRoads();
    this.addGarageAndMalecon();
    this._generateBuildings();

    if (this._windowMesh) {
      this._windowMesh.count = this._windowCount;
      this._windowMesh.instanceMatrix.needsUpdate = true;
      if (this._windowMesh.instanceColor) {
        this._windowMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  _setupEnvironment() {
    this.scene.background = new THREE.Color(0x2a1a3a);
    this.scene.fog = new THREE.FogExp2(0xff9e7a, 0.004);

    const gradientCanvas = document.createElement('canvas');
    gradientCanvas.width = 4;
    gradientCanvas.height = 256;
    const ctx = gradientCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1c2a5e');
    grad.addColorStop(0.45, '#7a4a8a');
    grad.addColorStop(0.68, '#e86a6a');
    grad.addColorStop(0.8, '#ff9e4a');
    grad.addColorStop(1, '#ffd27a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(800, 24, 16),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(gradientCanvas),
        side: THREE.BackSide,
        fog: false,
      })
    );
    this.scene.add(skyDome);

    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
    );
    sunDisc.position.set(-700, 90, 0);
    sunDisc.lookAt(0, 90, 0);
    this.scene.add(sunDisc);

    const sunGlow = new THREE.Mesh(
      new THREE.CircleGeometry(60, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff9e4a,
        transparent: true,
        opacity: 0.35,
        fog: false,
      })
    );
    sunGlow.position.set(-702, 90, 0);
    sunGlow.lookAt(0, 90, 0);
    this.scene.add(sunGlow);

    this.scene.add(new THREE.AmbientLight(0xffd9c0, 0.55));
    const dirLight = new THREE.DirectionalLight(0xffb347, 1.5);
    dirLight.position.set(-150, 60, 80);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd9c0,
      transparent: true,
      opacity: 0.8,
      fog: false,
    });

    for (let i = 0; i < 8; i++) {
      const cx = this.rng.range(-400, 400);
      const cy = this.rng.range(120, 180);
      const cz = this.rng.range(-400, 400);
      const puffCount = 3 + Math.floor(this.rng.next() * 3);
      for (let j = 0; j < puffCount; j++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(this.rng.range(8, 16), 8, 6),
          cloudMaterial
        );
        puff.scale.y = 0.45;
        puff.position.set(
          cx + (j - puffCount / 2) * 12,
          cy + this.rng.range(-2, 2),
          cz + this.rng.range(-4, 4)
        );
        this.scene.add(puff);
      }
    }
  }

  _setupGroundAndWater() {
    const worldLimit = CONFIG.WORLD_SIZE * 2;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(worldLimit, worldLimit),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);

    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(80, worldLimit),
      new THREE.MeshStandardMaterial({ color: 0xf4a460, roughness: 0.8 })
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(-CONFIG.WORLD_SIZE + 40, 0, 0);
    this.scene.add(beach);

    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(200, worldLimit),
      new THREE.MeshStandardMaterial({
        color: 0x0077be,
        roughness: 0.2,
        metalness: 0.3,
      })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(-CONFIG.WORLD_SIZE - 60, -0.1, 0);
    this.scene.add(ocean);
  }

  _initializeWindowInstances() {
    this._windowMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.4, 2.0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      WINDOW_CAPACITY
    );
    this._windowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._windowCount = 0;
    this.scene.add(this._windowMesh);
  }

  _generateBuildings() {
    const limit = CONFIG.WORLD_SIZE;
    const bSize = CONFIG.BLOCK_SIZE;
    const step = bSize + CONFIG.ROAD_WIDTH;

    for (let x = -limit + 60; x < limit - 60; x += step) {
      for (let z = -limit + 60; z < limit - 60; z += step) {
        if (this.rng.next() < 0.1) continue;

        const w = bSize - this.rng.range(2, 8);
        const d = bSize - this.rng.range(2, 8);
        const h = this.rng.range(20, 75);
        const color = this.rng.choice(BUILDING_PALETTE);

        const building = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.6,
            metalness: 0.1,
          })
        );
        building.position.set(x, h / 2, z);
        this.scene.add(building);
        this.buildings.push(building);

        this.addWindowsForBuilding(x, z, w, h, d);
        this.addRooftopDetails(x, z, w, h, d);

        if (this.rng.next() < 0.15) {
          this.addNeonSign(x, z, w, h, d);
        }

        this.colliders.push(new THREE.Box3().setFromObject(building));

        if (this.rng.next() < 0.4) {
          this.createPalmTree(x + w / 2 + 3, z);
        }
      }
    }
  }

  addWindowsForBuilding(x, z, width, height, depth) {
    const rows = Math.max(2, Math.floor(height / 6));
    const faces = [
      { span: width, ox: 0, oz: depth / 2 + 0.06, rot: 0, isX: true },
      { span: width, ox: 0, oz: -depth / 2 - 0.06, rot: Math.PI, isX: true },
      { span: depth, ox: width / 2 + 0.06, oz: 0, rot: Math.PI / 2, isX: false },
      { span: depth, ox: -width / 2 - 0.06, oz: 0, rot: -Math.PI / 2, isX: false },
    ];

    for (const f of faces) {
      const cols = Math.max(2, Math.floor(f.span / 5));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (this._windowCount >= WINDOW_CAPACITY) return;
          const u = (c + 0.5) / cols - 0.5;
          const v = (r + 0.5) / rows;
          const holder = this._transformMatrixHelper;
          holder.position.set(
            x + f.ox + (f.isX ? u * (f.span - 4) : 0),
            3 + v * (height - 6),
            z + f.oz + (f.isX ? 0 : u * (f.span - 4))
          );
          holder.rotation.set(0, f.rot, 0);
          holder.updateMatrix();
          this._windowMesh.setMatrixAt(this._windowCount, holder.matrix);

          const lit = this.rng.next() < 0.35;
          this._windowMesh.setColorAt(
            this._windowCount,
            lit ? new THREE.Color(0xffc46b) : new THREE.Color(0x2c3a55)
          );
          this._windowCount++;
        }
      }
    }
  }

  addRooftopDetails(x, z, width, height, depth) {
    const acGeom = new THREE.BoxGeometry(1.5, 0.8, 1.5);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
    const count = 1 + Math.floor(this.rng.next() * 2);

    for (let i = 0; i < count; i++) {
      const ac = new THREE.Mesh(acGeom, acMat);
      ac.position.set(
        x + (this.rng.next() - 0.5) * (width - 4),
        height + 0.4,
        z + (this.rng.next() - 0.5) * (depth - 4)
      );
      this.scene.add(ac);
    }

    if (this.rng.next() < 0.4) {
      const px = x + width / 2 - 2;
      const pz = z + depth / 2 - 2;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      pole.position.set(px, height + 3, pz);
      this.scene.add(pole);

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      tip.position.set(px, height + 6.2, pz);
      this.scene.add(tip);
    }
  }

  addNeonSign(x, z, width, height, depth) {
    const neonColor = this.rng.choice(NEON_PALETTE);
    const mat = new THREE.MeshBasicMaterial({ color: neonColor });
    const faceZ = z + depth / 2 + 0.15;
    const sx = x + (this.rng.next() - 0.5) * (width - 4);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 0.25), mat);
    bar.position.set(sx, height * 0.45, faceZ);
    this.scene.add(bar);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.5, 0.25), mat);
    base.position.set(sx, height * 0.45 - 5, faceZ);
    this.scene.add(base);
  }

  buildRoads() {
    const centres = [];
    for (let i = 0; i < 9; i++) {
      centres.push(-214 + i * 52);
    }

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.95 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.9 });

    for (const c of centres) {
      const roadEW = new THREE.Mesh(new THREE.BoxGeometry(500, 0.06, 12), roadMat);
      roadEW.position.set(0, 0, c);
      this.scene.add(roadEW);

      const roadNS = new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 500), roadMat);
      roadNS.position.set(c, 0, 0);
      this.scene.add(roadNS);

      for (const off of [-7.5, 7.5]) {
        const sideEW = new THREE.Mesh(new THREE.BoxGeometry(500, 0.15, 3), sideMat);
        sideEW.position.set(0, 0.05, c + off);
        this.scene.add(sideEW);

        const sideNS = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 500), sideMat);
        sideNS.position.set(c + off, 0.05, 0);
        this.scene.add(sideNS);
      }
    }

    this.addLaneDashes(centres);
    this.addCrosswalks(centres);
  }

  addLaneDashes(roadCentres) {
    const holder = this._transformMatrixHelper;
    const dashesMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.35, 0.02, 2.5),
      new THREE.MeshBasicMaterial({ color: 0xd8c56a }),
      DASH_CAPACITY
    );
    let index = 0;

    for (const c of roadCentres) {
      for (let p = -245; p <= 245 && index < DASH_CAPACITY; p += 7) {
        holder.position.set(p, 0.05, c);
        holder.rotation.set(0, Math.PI / 2, 0);
        holder.updateMatrix();
        dashesMesh.setMatrixAt(index++, holder.matrix);

        if (index >= DASH_CAPACITY) break;

        holder.position.set(c, 0.05, p);
        holder.rotation.set(0, 0, 0);
        holder.updateMatrix();
        dashesMesh.setMatrixAt(index++, holder.matrix);
      }
    }
    dashesMesh.count = index;
    dashesMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(dashesMesh);
  }

  addCrosswalks(roadCentres) {
    const holder = this._transformMatrixHelper;
    const stripesMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 0.02, 10),
      new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }),
      CROSSWALK_CAPACITY
    );
    let index = 0;

    for (const rx of roadCentres) {
      for (const rz of roadCentres) {
        for (let k = -2; k <= 2 && index < CROSSWALK_CAPACITY; k++) {
          holder.position.set(rx + k * 1.6, 0.05, rz);
          holder.rotation.set(0, 0, 0);
          holder.updateMatrix();
          stripesMesh.setMatrixAt(index++, holder.matrix);
        }
      }
    }
    stripesMesh.count = index;
    stripesMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(stripesMesh);
  }

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

  addGarageAndMalecon() {
    this.garagePos = new THREE.Vector3(60, 0, 60);

    const garageBuilding = new THREE.Mesh(
      new THREE.BoxGeometry(24, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0x0e7c7b })
    );
    garageBuilding.position.set(60, 4, 60);
    this.scene.add(garageBuilding);
    this.colliders.push(new THREE.Box3().setFromObject(garageBuilding));

    const garageDoor = new THREE.Mesh(
      new THREE.BoxGeometry(10, 5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    garageDoor.position.set(60, 2.5, 67.05);
    this.scene.add(garageDoor);

    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(12, 2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2d95 })
    );
    signBoard.position.set(60, 6.5, 67.05);
    this.scene.add(signBoard);

    const goldRing = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.15, 16, 100),
      new THREE.MeshBasicMaterial({ color: 0xffd700 })
    );
    goldRing.position.set(60, 11, 67);
    this.scene.add(goldRing);

    const maleconRoad = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.06, 480),
      new THREE.MeshStandardMaterial({ color: 0x404040 })
    );
    maleconRoad.position.set(-218, 0.03, 0);
    this.scene.add(maleconRoad);

    const maleconDashes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.35, 0.02, 2.5),
      new THREE.MeshBasicMaterial({ color: 0xd8c56a }),
      60
    );
    const holder = this._transformMatrixHelper;
    for (let i = 0; i < 60; i++) {
      holder.position.set(-218, 0.05, -236 + i * 8);
      holder.updateMatrix();
      maleconDashes.setMatrixAt(i, holder.matrix);
    }
    this.scene.add(maleconDashes);

    for (let z = -220; z <= 220; z += 24) {
      this.createPalmTree(-208, z);
    }

    const safehouse = new THREE.Mesh(
      new THREE.BoxGeometry(10, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0xffb6c1 })
    );
    safehouse.position.set(-40, 3, 50);
    this.scene.add(safehouse);

    const safehouseDoor = new THREE.Mesh(
      new THREE.BoxGeometry(2, 4, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    safehouseDoor.position.set(-40, 2, 55.1);
    this.scene.add(safehouseDoor);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0xff00ff })
    );
    beacon.position.set(-40, 10, 50);
    this.scene.add(beacon);
  }

  checkCollision(position, radius = 1) {
    const boundingBox = new THREE.Box3(
      new THREE.Vector3(position.x - radius, position.y, position.z - radius),
      new THREE.Vector3(position.x + radius, position.y + 2, position.z + radius)
    );

    for (const box of this.colliders) {
      if (box.intersectsBox(boundingBox)) return true;
    }

    const marginLimit = CONFIG.WORLD_SIZE - 10;
    if (Math.abs(position.x) > marginLimit || Math.abs(position.z) > marginLimit) {
      return true;
    }

    return false;
  }
}
