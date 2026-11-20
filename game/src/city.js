// Procedural City Generator for Solmar Bay (Three.js)
import * as THREE from './three.js';
import { SeededRandom } from './random.js';
import { CONFIG } from './config.js';

export class CityGenerator {
  constructor(scene, seed = 42) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.buildings = [];
    this.colliders = [];
  }

  build() {
    // Sky, Fog & Lighting
    this.scene.background = new THREE.Color(0x2a1a3a);
    this.scene.fog = new THREE.FogExp2(0xff9e7a, 0.004);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4; skyCanvas.height = 256;
    const sctx = skyCanvas.getContext('2d');
    const grad = sctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1c2a5e');
    grad.addColorStop(0.45, '#7a4a8a');
    grad.addColorStop(0.68, '#e86a6a');
    grad.addColorStop(0.8, '#ff9e4a');
    grad.addColorStop(1, '#ffd27a');
    sctx.fillStyle = grad; sctx.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
    this.scene.add(skyDome);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(32, 32), new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }));
    sun.position.set(-700, 90, 0);
    sun.lookAt(0, 90, 0);
    this.scene.add(sun);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: 0xff9e4a, transparent: true, opacity: 0.35, fog: false }));
    glow.position.set(-702, 90, 0);
    glow.lookAt(0, 90, 0);
    this.scene.add(glow);

    const ambientLight = new THREE.AmbientLight(0xffd9c0, 0.55);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffb347, 1.5);
    dirLight.position.set(-150, 60, 80);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffd9c0, transparent: true, opacity: 0.8, fog: false });
    for (let i = 0; i < 8; i++) {
      const cx = this.rng.range(-400, 400);
      const cy = this.rng.range(120, 180);
      const cz = this.rng.range(-400, 400);
      const puffs = 3 + Math.floor(this.rng.next() * 3);
      for (let j = 0; j < puffs; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(this.rng.range(8, 16), 8, 6), cloudMat);
        puff.scale.y = 0.45;
        puff.position.set(cx + (j - puffs / 2) * 12, cy + this.rng.range(-2, 2), cz + this.rng.range(-4, 4));
        this.scene.add(puff);
      }
    }

    // Ground / Ocean & Beach
    const groundGeo = new THREE.PlaneGeometry(CONFIG.WORLD_SIZE * 2, CONFIG.WORLD_SIZE * 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);

    // Beach on the West side
    const beachGeo = new THREE.PlaneGeometry(80, CONFIG.WORLD_SIZE * 2);
    const beachMat = new THREE.MeshStandardMaterial({ color: 0xf4a460, roughness: 0.8 });
    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(-CONFIG.WORLD_SIZE + 40, 0, 0);
    this.scene.add(beach);

    // Ocean on the far West
    const oceanGeo = new THREE.PlaneGeometry(200, CONFIG.WORLD_SIZE * 2);
    const oceanMat = new THREE.MeshStandardMaterial({ color: 0x0077be, roughness: 0.2, metalness: 0.3 });
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(-CONFIG.WORLD_SIZE - 60, -0.1, 0);
    this.scene.add(ocean);

    // City Grid Blocks & Buildings
    const halfWorld = CONFIG.WORLD_SIZE;
    const blockSize = CONFIG.BLOCK_SIZE;
    const roadWidth = CONFIG.ROAD_WIDTH;
    const step = blockSize + roadWidth;

    const windowGeo = new THREE.PlaneGeometry(1.4, 2.0);
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this._windowMesh = new THREE.InstancedMesh(windowGeo, windowMat, 30000);
    this._windowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._windowCount = 0;
    this._winDummy = new THREE.Object3D();
    this.scene.add(this._windowMesh);

    const buildingColors = [0xe0e0e0, 0xd2b48c, 0xffe4e1, 0xadd8e6, 0xfffacd, 0xf5deb3, 0xffb6c1, 0xfaebd7];
    this.buildRoads();

    for (let x = -halfWorld + 60; x < halfWorld - 60; x += step) {
      for (let z = -halfWorld + 60; z < halfWorld - 60; z += step) {
        // Skip some for parks/plazas or variety
        if (this.rng.next() < 0.1) continue;

        const bWidth = blockSize - this.rng.range(2, 8);
        const bDepth = blockSize - this.rng.range(2, 8);
        const bHeight = this.rng.range(20, 75);

        const color = this.rng.choice(buildingColors);
        const geo = new THREE.BoxGeometry(bWidth, bHeight, bDepth);
        const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.6, metalness: 0.1 });
        const mesh = new THREE.Mesh(geo, mat);

        mesh.position.set(x, bHeight / 2, z);
        this.scene.add(mesh);
        this.buildings.push(mesh);
        this.addWindowsForBuilding(x, z, bWidth, bHeight, bDepth);
        this.addRooftopDetails(x, z, bWidth, bHeight, bDepth);
        if (this.rng.next() < 0.15) this.addNeonSign(x, z, bWidth, bHeight, bDepth);

        // Store bounding box for simple collision
        const box = new THREE.Box3().setFromObject(mesh);
        this.colliders.push(box);

        // Add some palm trees along the streets
        if (this.rng.next() < 0.4) {
          this.createPalmTree(x + bWidth / 2 + 3, z);
        }
      }
    }

    if (this._windowMesh) { this._windowMesh.count = this._windowCount; this._windowMesh.instanceMatrix.needsUpdate = true; if (this._windowMesh.instanceColor) this._windowMesh.instanceColor.needsUpdate = true; }
  }

  addWindowsForBuilding(x, z, bWidth, bHeight, bDepth) {
    const rows = Math.max(2, Math.floor(bHeight / 6));
    const faces = [
      { w: bWidth, dx: 0, dz: bDepth / 2 + 0.06, rot: 0, alongX: true },
      { w: bWidth, dx: 0, dz: -bDepth / 2 - 0.06, rot: Math.PI, alongX: true },
      { w: bDepth, dx: bWidth / 2 + 0.06, dz: 0, rot: Math.PI / 2, alongX: false },
      { w: bDepth, dx: -bWidth / 2 - 0.06, dz: 0, rot: -Math.PI / 2, alongX: false },
    ];
    for (const f of faces) {
      const cols = Math.max(2, Math.floor(f.w / 5));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (this._windowCount >= 30000) return;
          const u = (c + 0.5) / cols - 0.5;
          const v = (r + 0.5) / rows;
          const d = this._winDummy;
          d.position.set(
            x + f.dx + (f.alongX ? u * (f.w - 4) : 0),
            3 + v * (bHeight - 6),
            z + f.dz + (f.alongX ? 0 : u * (f.w - 4))
          );
          d.rotation.set(0, f.rot, 0);
          d.updateMatrix();
          this._windowMesh.setMatrixAt(this._windowCount, d.matrix);
          const lit = this.rng.next() < 0.35;
          this._windowMesh.setColorAt(this._windowCount, lit ? new THREE.Color(0xffc46b) : new THREE.Color(0x2c3a55));
          this._windowCount++;
        }
      }
    }
  }

  addRooftopDetails(x, z, bWidth, bHeight, bDepth) {
    const acGeo = new THREE.BoxGeometry(1.5, 0.8, 1.5);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
    const n = 1 + Math.floor(this.rng.next() * 2);
    for (let i = 0; i < n; i++) {
      const ac = new THREE.Mesh(acGeo, acMat);
      ac.position.set(x + (this.rng.next() - 0.5) * (bWidth - 4), bHeight + 0.4, z + (this.rng.next() - 0.5) * (bDepth - 4));
      this.scene.add(ac);
    }
    if (this.rng.next() < 0.4) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      ant.position.set(x + bWidth / 2 - 2, bHeight + 3, z + bDepth / 2 - 2);
      this.scene.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
      tip.position.set(x + bWidth / 2 - 2, bHeight + 6.2, z + bDepth / 2 - 2);
      this.scene.add(tip);
    }
  }

  addNeonSign(x, z, bWidth, bHeight, bDepth) {
    const neon = this.rng.choice([0xff2d95, 0x00e5ff, 0xff9f1c, 0x39ff88]);
    const mat = new THREE.MeshBasicMaterial({ color: neon });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 0.25), mat);
    sign.position.set(x + (this.rng.next() - 0.5) * (bWidth - 4), bHeight * 0.45, z + bDepth / 2 + 0.15);
    this.scene.add(sign);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.5, 0.25), mat);
    base.position.set(sign.position.x, bHeight * 0.45 - 5, z + bDepth / 2 + 0.15);
    this.scene.add(base);
  }

  buildRoads() {
    const roadCentres = [];
    for (let i = 0; i < 9; i++) roadCentres.push(-214 + i * 52);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.95 });
    const walkMat = new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.9 });
    for (const c of roadCentres) {
      const roadX = new THREE.Mesh(new THREE.BoxGeometry(500, 0.06, 12), roadMat);
      roadX.position.set(0, 0, c);
      this.scene.add(roadX);
      const roadZ = new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 500), roadMat);
      roadZ.position.set(c, 0, 0);
      this.scene.add(roadZ);
      for (const off of [-7.5, 7.5]) {
        const walkX = new THREE.Mesh(new THREE.BoxGeometry(500, 0.15, 3), walkMat);
        walkX.position.set(0, 0.05, c + off);
        this.scene.add(walkX);
        const walkZ = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 500), walkMat);
        walkZ.position.set(c + off, 0.05, 0);
        this.scene.add(walkZ);
      }
    }
    this.addLaneDashes(roadCentres);
    this.addCrosswalks(roadCentres);
  }

  addLaneDashes(roadCentres) {
    const dummy = new THREE.Object3D();
    const dashGeo = new THREE.BoxGeometry(0.35, 0.02, 2.5);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c56a });
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, 1400);
    let di = 0;
    for (const c of roadCentres) {
      for (let p = -245; p <= 245 && di < 1400; p += 7) {
        dummy.position.set(p, 0.05, c);
        dummy.rotation.set(0, Math.PI / 2, 0);
        dummy.updateMatrix();
        dashes.setMatrixAt(di++, dummy.matrix);
        if (di >= 1400) break;
        dummy.position.set(c, 0.05, p);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        dashes.setMatrixAt(di++, dummy.matrix);
      }
    }
    dashes.count = di;
    dashes.instanceMatrix.needsUpdate = true;
    this.scene.add(dashes);
  }

  addCrosswalks(roadCentres) {
    const dummy = new THREE.Object3D();
    const stripeGeo = new THREE.BoxGeometry(0.7, 0.02, 10);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
    const stripes = new THREE.InstancedMesh(stripeGeo, stripeMat, 500);
    let si = 0;
    for (const ix of roadCentres) {
      for (const jz of roadCentres) {
        for (let k = -2; k <= 2 && si < 500; k++) {
          dummy.position.set(ix + k * 1.6, 0.05, jz);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          stripes.setMatrixAt(si++, dummy.matrix);
        }
      }
    }
    stripes.count = si;
    stripes.instanceMatrix.needsUpdate = true;
    this.scene.add(stripes);
  }

  createPalmTree(x, z) {
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 8, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 4, z);
    this.scene.add(trunk);

    // Fronds
    for (let i = 0; i < 5; i++) {
      const frondGeo = new THREE.ConeGeometry(2, 0.5, 4);
      const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57 });
      const frond = new THREE.Mesh(frondGeo, frondMat);
      const angle = (i / 5) * Math.PI * 2;
      frond.position.set(x + Math.cos(angle) * 1.5, 8, z + Math.sin(angle) * 1.5);
      frond.rotation.z = 0.3;
      frond.rotation.y = angle;
      this.scene.add(frond);
    }
  }

  checkCollision(position, radius = 1) {
    const playerBox = new THREE.Box3(
      new THREE.Vector3(position.x - radius, position.y, position.z - radius),
      new THREE.Vector3(position.x + radius, position.y + 2, position.z + radius)
    );

    for (const box of this.colliders) {
      if (box.intersectsBox(playerBox)) {
        return true;
      }
    }
    // World bounds
    if (Math.abs(position.x) > CONFIG.WORLD_SIZE - 10 || Math.abs(position.z) > CONFIG.WORLD_SIZE - 10) {
      return true;
    }
    return false;
  }
}
