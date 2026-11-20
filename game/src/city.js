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
    this.scene.background = new THREE.Color(0x87ceeb); // Sunny coastal sky blue
    this.scene.fog = new THREE.FogExp2(0xffd1a9, 0.003); // Warm coastal sunset/golden hour fog

    const ambientLight = new THREE.AmbientLight(0xfff5ee, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    dirLight.position.set(100, 200, 100);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

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

    const buildingColors = [0xe0e0e0, 0xd2b48c, 0xffe4e1, 0xadd8e6, 0xfffacd, 0xf5deb3, 0xffb6c1, 0xfaebd7];

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

        // Store bounding box for simple collision
        const box = new THREE.Box3().setFromObject(mesh);
        this.colliders.push(box);

        // Add some palm trees along the streets
        if (this.rng.next() < 0.4) {
          this.createPalmTree(x + bWidth / 2 + 3, z);
        }
      }
    }
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
