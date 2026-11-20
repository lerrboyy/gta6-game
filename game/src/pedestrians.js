import * as THREE from './three.js';

export class PedestrianManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.pedestrians = [];
    this.shirtColors = [0xff3b30, 0x0077be, 0x4cd964, 0xffcc00, 0xff9500, 0x8e8e93, 0xffffff, 0x9c27b0, 0xe91e63];
  }

  createPedestrianMesh() {
    const group = new THREE.Group();
    const color = this.shirtColors[Math.floor(Math.random() * this.shirtColors.length)];

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.4, 6);
    const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.2, 6, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf4a460, roughness: 0.6 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55;
    group.add(head);

    return group;
  }

  spawn() {
    // 10 pedestrians
    for (let i = 0; i < 10; i++) {
      const mesh = this.createPedestrianMesh();
      const x = (Math.random() - 0.5) * 200;
      const z = (Math.random() - 0.5) * 200;
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);

      this.pedestrians.push({
        mesh: mesh,
        position: mesh.position,
        velocity: new THREE.Vector3(),
        speed: 1.0 + Math.random() * 0.8,
        angle: Math.random() * Math.PI * 2,
        timer: Math.random() * 5
      });
    }
  }

  update(dt, playerPosition) {
    for (const ped of this.pedestrians) {
      ped.timer -= dt;
      if (ped.timer <= 0) {
        ped.angle = Math.random() * Math.PI * 2;
        ped.timer = 3 + Math.random() * 5;
      }

      // Check distance to player for avoidance
      const distToPlayer = ped.position.distanceTo(playerPosition);
      if (distToPlayer < 4.0) {
        // Move away from player
        const away = ped.position.clone().sub(playerPosition).normalize();
        ped.angle = Math.atan2(away.x, away.z);
        ped.speed = 2.5; // Walk faster when avoiding
      } else {
        ped.speed = 1.0 + Math.random() * 0.5;
      }

      const moveDir = new THREE.Vector3(Math.sin(ped.angle), 0, Math.cos(ped.angle));
      ped.position.addScaledVector(moveDir, ped.speed * dt);

      // Keep within world bounds
      ped.position.x = Math.max(-140, Math.min(140, ped.position.x));
      ped.position.z = Math.max(-140, Math.min(140, ped.position.z));

      ped.mesh.position.copy(ped.position);
      ped.mesh.rotation.y = ped.angle;
    }
  }
}
