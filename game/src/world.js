import * as THREE from './three.js';
import { CONFIG } from './config.js';
import { VehicleManager } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';

export class WorldManager {
  constructor(scene, cityGenerator) {
    this.scene = scene;
    this.city = cityGenerator;
    
    // Player state
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = 0; // yaw angle
    this.pitch = 0; // camera pitch
    this.health = 100;
    this.cash = 500;
    this.wanted = 0;
    this.isGrounded = false;
    this.isDriving = false;

    // Managers
    this.vehicles = new VehicleManager(scene, this.city);
    this.vehicles.init();
    this.pedestrians = new PedestrianManager(scene, this.city);
    this.pedestrians.spawn();
    this.police = new PoliceManager(scene, this.city);

    // Create Player Mesh (Capsule / Character representation)
    this.playerGroup = new THREE.Group();
    
    // Body / Torso
    const bodyGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.8, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0077be, roughness: 0.5 });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = 0.9;
    this.playerGroup.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf4a460, roughness: 0.6 });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 1.9;
    this.playerGroup.add(headMesh);

    this.scene.add(this.playerGroup);
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.playerGroup.position.copy(this.position);
  }

  toggleCarEnterExit() {
    if (this.isDriving) {
      // Exit car
      if (this.vehicles.drivenCar) {
        this.position.copy(this.vehicles.drivenCar.position).add(new THREE.Vector3(2.5, 0, 0));
        this.playerGroup.position.copy(this.position);
        this.playerGroup.visible = true;
        this.vehicles.drivenCar = null;
      }
      this.isDriving = false;
    } else {
      // Enter nearest car
      const nearest = this.vehicles.getNearestCar(this.position, 5.0);
      if (nearest) {
        this.vehicles.drivenCar = nearest;
        this.isDriving = true;
        this.playerGroup.visible = false;
        this.wanted = Math.min(5, this.wanted + 1); // +1 wanted for stealing car
      }
    }
  }

  update(dt, input, audio) {
    // Always update traffic, pedestrians & police
    this.vehicles.update(dt, input, this);
    this.pedestrians.update(dt, this);
    this.police.update(dt, this);

    if (this.isDriving) {
      // While driving, player follows car position
      if (this.vehicles.drivenCar) {
        this.position.copy(this.vehicles.drivenCar.position);
        this.playerGroup.position.copy(this.position);
      }
      return;
    }

    // Mouse look (camera rotation and player yaw)
    const mouseDelta = input.consumeMouseDelta();
    const sensitivity = 0.003;
    this.rotation -= mouseDelta.dx * sensitivity;
    this.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.pitch - mouseDelta.dy * sensitivity));

    this.playerGroup.rotation.y = this.rotation;

    // Movement direction vector based on keyboard input
    const moveDir = new THREE.Vector3();
    if (input.isPressed('KeyW') || input.isPressed('ArrowUp')) moveDir.z -= 1;
    if (input.isPressed('KeyS') || input.isPressed('ArrowDown')) moveDir.z += 1;
    if (input.isPressed('KeyA') || input.isPressed('ArrowLeft')) moveDir.x -= 1;
    if (input.isPressed('KeyD') || input.isPressed('ArrowRight')) moveDir.x += 1;

    moveDir.normalize();
    moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);

    let speed = CONFIG.PLAYER_SPEED;
    if (input.isPressed('ShiftLeft') || input.isPressed('ShiftRight')) {
      speed *= CONFIG.PLAYER_SPRINT_MULT;
    }

    // Horizontal velocity
    this.velocity.x = moveDir.x * speed;
    this.velocity.z = moveDir.z * speed;

    // Gravity & Jump
    if (this.isGrounded) {
      if (input.isPressed('Space')) {
        this.velocity.y = CONFIG.JUMP_FORCE;
        this.isGrounded = false;
        if (audio) audio.playJump();
      } else {
        this.velocity.y = 0;
      }
    } else {
      this.velocity.y -= CONFIG.GRAVITY * dt;
    }

    // Attempt X movement with collision
    const nextPos = this.position.clone();
    nextPos.x += this.velocity.x * dt;
    if (!this.city.checkCollision(nextPos, 0.6)) {
      this.position.x = nextPos.x;
    }

    // Attempt Z movement with collision
    nextPos.copy(this.position);
    nextPos.z += this.velocity.z * dt;
    if (!this.city.checkCollision(nextPos, 0.6)) {
      this.position.z = nextPos.z;
    }

    // Attempt Y movement (gravity / jump / rooftop landing)
    nextPos.copy(this.position);
    nextPos.y += this.velocity.y * dt;

    // Check ground level (y = 0) or building rooftops
    let rooftopY = 0;
    for (const box of this.city.colliders) {
      if (
        nextPos.x >= box.min.x && nextPos.x <= box.max.x &&
        nextPos.z >= box.min.z && nextPos.z <= box.max.z
      ) {
        if (box.max.y > rooftopY && nextPos.y >= box.max.y - 0.5 && this.position.y >= box.max.y - 1.0) {
          rooftopY = box.max.y;
        }
      }
    }

    const groundLimit = Math.max(0, rooftopY);
    if (nextPos.y <= groundLimit) {
      this.position.y = groundLimit;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.position.y = nextPos.y;
      this.isGrounded = (nextPos.y <= groundLimit + 0.05);
    }

    // Update mesh position
    this.playerGroup.position.copy(this.position);

    // Footstep audio if moving & grounded
    if (this.isGrounded && (moveDir.x !== 0 || moveDir.z !== 0) && Math.random() < 0.15) {
      if (audio) audio.playFootstep();
    }
  }

  updateCamera(camera) {
    let distance = 6;
    let height = 2.5;
    let rot = this.rotation;

    if (this.isDriving && this.vehicles.drivenCar) {
      distance = 9;
      height = 3.5;
      rot = this.vehicles.drivenCar.rotation;
    }

    const offsetX = Math.sin(rot) * distance;
    const offsetZ = Math.cos(rot) * distance;

    camera.position.set(
      this.position.x + offsetX,
      this.position.y + height + Math.sin(this.pitch) * 3,
      this.position.z + offsetZ
    );

    const lookTarget = this.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    camera.lookAt(lookTarget);
  }
}
