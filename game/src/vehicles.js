import * as THREE from './three.js';

export class VehicleManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.vehicles = []; // Both AI traffic and parked/drivable cars
    this.drivenCar = null;
    
    this.carColors = [0xff3b30, 0x0077be, 0x4cd964, 0xffcc00, 0xff9500, 0x8e8e93, 0xffffff, 0x111111];
  }

  createCarMesh(color) {
    const carGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(2.0, 0.7, 4.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    body.receiveShadow = true;
    carGroup.add(body);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.6, 2.2);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.15, -0.2);
    cabin.castShadow = true;
    carGroup.add(cabin);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    const wheelPositions = [
      [-1.05, 0.35, 1.4],
      [1.05, 0.35, 1.4],
      [-1.05, 0.35, -1.4],
      [1.05, 0.35, -1.4]
    ];

    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(...pos);
      carGroup.add(wheel);
    }

    return carGroup;
  }

  spawnParkedCars() {
    // 4-6 parked cars near player start (around x=15, z=25)
    const parkedCoords = [
      { x: 15, z: 18, rot: 0 },
      { x: 22, z: 25, rot: Math.PI / 2 },
      { x: 10, z: 32, rot: Math.PI },
      { x: 28, z: 28, rot: -Math.PI / 2 },
      { x: 8, z: 22, rot: Math.PI / 4 }
    ];

    for (const coord of parkedCoords) {
      const color = this.carColors[Math.floor(Math.random() * this.carColors.length)];
      const mesh = this.createCarMesh(color);
      mesh.position.set(coord.x, 0, coord.z);
      mesh.rotation.y = coord.rot;
      this.scene.add(mesh);

      this.vehicles.push({
        mesh: mesh,
        position: mesh.position,
        rotation: coord.rot,
        speed: 0,
        maxSpeed: 25,
        isAI: false,
        aiDir: new THREE.Vector3(0, 0, 1)
      });
    }
  }

  spawnTraffic() {
    // 8 AI cars driving along roads
    const trafficCoords = [
      { x: -50, z: -50, dir: new THREE.Vector3(1, 0, 0) },
      { x: 50, z: 0, dir: new THREE.Vector3(-1, 0, 0) },
      { x: 0, z: 80, dir: new THREE.Vector3(0, 0, -1) },
      { x: -80, z: -20, dir: new THREE.Vector3(0, 0, 1) },
      { x: 30, z: -90, dir: new THREE.Vector3(0, 0, 1) },
      { x: -30, z: 50, dir: new THREE.Vector3(1, 0, 0) },
      { x: 90, z: 30, dir: new THREE.Vector3(-1, 0, 0) },
      { x: -90, z: -80, dir: new THREE.Vector3(0, 0, 1) }
    ];

    for (const t of trafficCoords) {
      const color = this.carColors[Math.floor(Math.random() * this.carColors.length)];
      const mesh = this.createCarMesh(color);
      mesh.position.set(t.x, 0, t.z);
      
      let rot = 0;
      if (t.dir.x === 1) rot = Math.PI / 2;
      else if (t.dir.x === -1) rot = -Math.PI / 2;
      else if (t.dir.z === 1) rot = Math.PI;
      else if (t.dir.z === -1) rot = 0;
      
      mesh.rotation.y = rot;
      this.scene.add(mesh);

      this.vehicles.push({
        mesh: mesh,
        position: mesh.position,
        rotation: rot,
        speed: 12 + Math.random() * 6,
        maxSpeed: 20,
        isAI: true,
        aiDir: t.dir.clone()
      });
    }
  }

  init() {
    this.spawnParkedCars();
    this.spawnTraffic();
  }

  update(dt, input, world) {
    for (const car of this.vehicles) {
      if (car === this.drivenCar) {
        // Controlled by player
        let throttle = 0;
        let steering = 0;

        if (input.isPressed('KeyW') || input.isPressed('ArrowUp')) throttle = 1;
        if (input.isPressed('KeyS') || input.isPressed('ArrowDown')) throttle = -1;
        if (input.isPressed('KeyA') || input.isPressed('ArrowLeft')) steering = 1;
        if (input.isPressed('KeyD') || input.isPressed('ArrowRight')) steering = -1;

        if (throttle !== 0) {
          car.speed += throttle * 15 * dt;
          car.speed = Math.max(-10, Math.min(car.maxSpeed, car.speed));
        } else {
          // Natural deceleration / drag
          car.speed *= 0.95;
          if (Math.abs(car.speed) < 0.1) car.speed = 0;
        }

        // Handbrake
        if (input.isPressed('Space')) {
          car.speed *= 0.85;
        }

        if (steering !== 0 && Math.abs(car.speed) > 0.5) {
          car.rotation += steering * (car.speed / car.maxSpeed) * 2.0 * dt;
          car.mesh.rotation.y = car.rotation;
        }

        const moveDir = new THREE.Vector3(Math.sin(car.rotation), 0, Math.cos(car.rotation));
        car.position.addScaledVector(moveDir, car.speed * dt);

        // Check traffic collisions for wanted increase
        if (Math.abs(car.speed) > 5) {
          for (const other of this.vehicles) {
            if (other !== car && other.isAI) {
              if (car.position.distanceTo(other.position) < 3.5 && Math.random() < 0.1) {
                world.wanted = Math.min(5, world.wanted + 1);
              }
            }
          }
        }

        // Keep within world bounds
        car.position.x = Math.max(-130, Math.min(130, car.position.x));
        car.position.z = Math.max(-130, Math.min(130, car.position.z));

        car.mesh.position.copy(car.position);
        world.position.copy(car.position); // Player follows car position

      } else if (car.isAI) {
        // AI Traffic movement (loops around world)
        car.position.addScaledVector(car.aiDir, car.speed * dt);

        if (Math.abs(car.position.x) > 130 || Math.abs(car.position.z) > 130) {
          // Loop back to opposite side
          car.position.x = -car.position.x;
          car.position.z = -car.position.z;
        }

        car.mesh.position.copy(car.position);
      }
    }
  }

  getNearestCar(pos, maxDist = 4.0) {
    let nearest = null;
    let minDist = maxDist;
    for (const car of this.vehicles) {
      const dist = car.position.distanceTo(pos);
      if (dist < minDist) {
        minDist = dist;
        nearest = car;
      }
    }
    return nearest;
  }
}
