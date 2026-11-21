// Solmar Bay — the world around Rico: the player himself, his stats and
// weapons, the day clock, and the chase camera.
//
// WorldManager builds Rico as a small humanoid with swinging limbs, owns
// his health, cash, wanted level, armour and respect, and keeps the three
// city systems ticking: vehicles, pedestrians and police. On foot he
// walks, sprints and jumps through the streets; in a car he rides along
// and the camera pulls back behind the vehicle.
import * as THREE from './three.js';
import { CONFIG } from './config.js';
import { VehicleManager } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';

// Chase-camera framing: on foot the camera trails 6 back and 2.5 up;
// behind the wheel it pulls out to 10.5 back and 3 up, and it always
// looks at a point 1.2 above Rico.
const ON_FOOT_DIST = 6;
const ON_FOOT_HEIGHT = 2.5;
const DRIVING_DIST = 10.5;
const DRIVING_HEIGHT = 3.0;
const LOOK_ABOVE = 1.2;
const LOOK_SENS = 0.003;
const PITCH_CAP = Math.PI / 3;

export class WorldManager {
  constructor(scene, cityGenerator) {
    this.scene = scene;
    this.city = cityGenerator;

    // Rico at the start of a fresh game.
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = 0;
    this.pitch = 0;
    this.health = 100;
    this.cash = 500;
    this.wanted = 0;
    this.armor = 0;
    this.respect = 0;
    this.day = 1;
    this.clockMinutes = 9 * 60 + 31;
    this.weaponSlot = 1;
    this.ownedWeapons = [0, 1];
    this.isGrounded = false;
    this.isDriving = false;
    this.walkPhase = 0;

    // The systems that keep the city alive around him.
    this.vehicles = new VehicleManager(scene, this.city);
    this.vehicles.init();
    this.pedestrians = new PedestrianManager(scene, this.city);
    this.pedestrians.spawn();
    this.police = new PoliceManager(scene, this.city);

    this._assembleRico();
  }

  // Build Rico: navy legs and a teal jacket on pivot groups so the walk
  // cycle can swing them, a dark belt, teal arms, a skin-tone head with
  // flattened dark hair, and a black cap with a brim.
  _assembleRico() {
    this.playerGroup = new THREE.Group();
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x0e7c7b, roughness: 0.6 });
    const denimMat = new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.7 });

    const legShape = new THREE.BoxGeometry(0.22, 0.8, 0.28);
    this.legL = this._swingLimb(-0.18, 0.8, legShape, denimMat, -0.4);
    this.legR = this._swingLimb(0.18, 0.8, legShape, denimMat, -0.4);

    this.bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.75, 0.4), jacketMat);
    this.bodyMesh.position.y = 1.18;
    this.bodyMesh.castShadow = true;
    this.playerGroup.add(this.bodyMesh);

    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.1, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 })
    );
    belt.position.y = 0.82;
    belt.castShadow = true;
    this.playerGroup.add(belt);

    const armShape = new THREE.BoxGeometry(0.18, 0.65, 0.22);
    this.armL = this._swingLimb(-0.46, 1.5, armShape, jacketMat, -0.32);
    this.armR = this._swingLimb(0.46, 1.5, armShape, jacketMat, -0.32);

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.6 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), skinMat);
    head.position.y = 1.78;
    head.castShadow = true;
    this.playerGroup.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.8 })
    );
    hair.position.y = 1.86;
    hair.scale.set(1, 0.7, 1);
    this.playerGroup.add(hair);

    const capMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 8), capMat);
    cap.position.y = 1.95;
    this.playerGroup.add(cap);

    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.25), capMat);
    brim.position.set(0, 1.93, 0.3);
    this.playerGroup.add(brim);

    this.scene.add(this.playerGroup);
  }

  // A limb that swings from a pivot: the pivot sits at (px, py) and the
  // box hangs `drop` below it, so rotating the pivot swings the limb.
  _swingLimb(px, py, shape, material, drop) {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const limb = new THREE.Mesh(shape, material);
    limb.position.y = drop;
    limb.castShadow = true;
    pivot.add(limb);
    this.playerGroup.add(pivot);
    return pivot;
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.playerGroup.position.copy(this.position);
  }

  // Climb into the nearest car within 5 units — stealing it earns a
  // wanted star — or step back out 2.5 to the side of the driven car.
  toggleCarEnterExit() {
    if (this.isDriving) {
      if (this.vehicles.drivenCar) {
        this.position.copy(this.vehicles.drivenCar.position)
          .add(new THREE.Vector3(2.5, 0, 0));
        this.playerGroup.position.copy(this.position);
        this.playerGroup.visible = true;
        this.vehicles.drivenCar = null;
      }
      this.isDriving = false;
      return;
    }

    const nearby = this.vehicles.getNearestCar(this.position, 5.0);
    if (nearby) {
      this.vehicles.drivenCar = nearby;
      this.isDriving = true;
      this.playerGroup.visible = false;
      this.wanted = Math.min(5, this.wanted + 1);
    }
  }

  // Draw a weapon Rico already owns; unknown or unowned slots refuse.
  switchWeapon(slot) {
    if (CONFIG.WEAPONS[slot] && this.ownedWeapons.includes(slot)) {
      this.weaponSlot = slot;
      return true;
    }
    return false;
  }

  // Buy a weapon: it must exist, not be owned yet, and be affordable.
  // Success spends the cash, adds the slot and draws the new weapon.
  buyWeapon(slot) {
    const weapon = CONFIG.WEAPONS[slot];
    if (!weapon) return false;
    if (this.ownedWeapons.includes(slot)) return false;
    if (this.cash < weapon.price) return false;
    this.cash -= weapon.price;
    this.ownedWeapons.push(slot);
    this.weaponSlot = slot;
    return true;
  }

  currentWeapon() {
    return CONFIG.WEAPONS[this.weaponSlot];
  }

  // A hit first eats into armour — up to half the damage, rounded down —
  // and the rest comes off health, which never drops below zero.
  takeDamage(amount) {
    const absorbed = Math.min(this.armor, Math.floor(amount / 2));
    this.armor -= absorbed;
    this.health = Math.max(0, this.health - (amount - absorbed));
    return this.health;
  }

  // Bank respect points and report the highest rank title reached.
  addRespect(points) {
    this.respect += points;
    let title = CONFIG.RESPECT_LEVELS[0].name;
    for (const rank of CONFIG.RESPECT_LEVELS) {
      if (this.respect >= rank.threshold) title = rank.name;
    }
    return title;
  }

  // "DAY 1 09:31": the day number, then the zero-padded 24-hour time.
  clockText() {
    const hours = Math.floor(this.clockMinutes / 60);
    const minutes = Math.floor(this.clockMinutes % 60);
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `DAY ${this.day} ${hh}:${mm}`;
  }

  update(dt, input, audio) {
    // A full in-game day passes in CONFIG.CLOCK.dayLengthMin minutes of
    // play; past midnight the clock wraps and the day ticks over.
    this.clockMinutes += dt * (24 * 60 / (CONFIG.CLOCK.dayLengthMin * 60));
    if (this.clockMinutes >= 24 * 60) {
      this.clockMinutes -= 24 * 60;
      this.day += 1;
    }

    // Traffic, pedestrians and police always tick, driving or not.
    this.vehicles.update(dt, input, this);
    this.pedestrians.update(dt, this);
    this.police.update(dt, this);

    // Behind the wheel Rico just rides along with the car.
    if (this.isDriving) {
      if (this.vehicles.drivenCar) {
        this.position.copy(this.vehicles.drivenCar.position);
        this.playerGroup.position.copy(this.position);
      }
      return;
    }

    this._turnWithMouse(input);
    const onTheMove = this._walk(dt, input, audio);
    this._swingLimbs(dt, onTheMove, audio);
  }

  // Mouse look: yaw turns Rico, pitch tilts the camera, capped at sixty
  // degrees either way.
  _turnWithMouse(input) {
    const delta = input.consumeMouseDelta();
    this.rotation -= delta.dx * LOOK_SENS;
    this.pitch = Math.max(
      -PITCH_CAP,
      Math.min(PITCH_CAP, this.pitch - delta.dy * LOOK_SENS)
    );
    this.playerGroup.rotation.y = this.rotation;
  }

  // On-foot movement: WASD or arrows rotated by the facing yaw, sprint
  // with either Shift, Space to jump, gravity in the air, axis-by-axis
  // collision against the city, and landing on the street or the highest
  // rooftop underfoot. Returns true while Rico is actually moving.
  _walk(dt, input, audio) {
    const dir = new THREE.Vector3();
    if (input.isPressed('KeyW') || input.isPressed('ArrowUp')) dir.z -= 1;
    if (input.isPressed('KeyS') || input.isPressed('ArrowDown')) dir.z += 1;
    if (input.isPressed('KeyA') || input.isPressed('ArrowLeft')) dir.x -= 1;
    if (input.isPressed('KeyD') || input.isPressed('ArrowRight')) dir.x += 1;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);

    let pace = CONFIG.PLAYER_SPEED;
    if (input.isPressed('ShiftLeft') || input.isPressed('ShiftRight')) {
      pace *= CONFIG.PLAYER_SPRINT_MULT;
    }
    this.velocity.x = dir.x * pace;
    this.velocity.z = dir.z * pace;

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

    // Step X first, then Z; each axis only moves when the city says the
    // landing spot is clear of buildings.
    const probe = this.position.clone();
    probe.x += this.velocity.x * dt;
    if (!this.city.checkCollision(probe, 0.6)) this.position.x = probe.x;

    probe.copy(this.position);
    probe.z += this.velocity.z * dt;
    if (!this.city.checkCollision(probe, 0.6)) this.position.z = probe.z;

    // Vertical: fall or jump, coming down on the street (y 0) or the
    // highest rooftop close enough underfoot to stand on.
    probe.copy(this.position);
    probe.y += this.velocity.y * dt;

    let roofTop = 0;
    for (const box of this.city.colliders) {
      const overhead =
        probe.x >= box.min.x && probe.x <= box.max.x &&
        probe.z >= box.min.z && probe.z <= box.max.z;
      const landable =
        box.max.y > roofTop &&
        probe.y >= box.max.y - 0.5 &&
        this.position.y >= box.max.y - 1.0;
      if (overhead && landable) roofTop = box.max.y;
    }

    const floor = Math.max(0, roofTop);
    if (probe.y <= floor) {
      this.position.y = floor;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.position.y = probe.y;
      this.isGrounded = probe.y <= floor + 0.05;
    }

    this.playerGroup.position.copy(this.position);
    return dir.x !== 0 || dir.z !== 0;
  }

  // Walk cycle: legs and arms swing in opposite sine waves while Rico
  // moves on the ground; idle, the limbs ease back to neutral. A
  // footstep sound fires now and then while he is walking.
  _swingLimbs(dt, moving, audio) {
    if (!this.legL || !this.legR || !this.armL || !this.armR) return;

    if (this.isGrounded && moving) {
      this.walkPhase += dt * 10;
      const swing = Math.sin(this.walkPhase);
      this.legL.rotation.x = swing * 0.5;
      this.legR.rotation.x = -swing * 0.5;
      this.armL.rotation.x = -swing * 0.4;
      this.armR.rotation.x = swing * 0.4;

      if (Math.random() < 0.15 && audio) audio.playFootstep();
    } else {
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
      this.armL.rotation.x *= 0.8;
      this.armR.rotation.x *= 0.8;
    }
  }

  // Third-person chase camera: behind Rico on foot, further back and
  // higher behind the car while driving, rising a little with the pitch,
  // always looking at a point just above his head.
  updateCamera(camera) {
    let distance = ON_FOOT_DIST;
    let height = ON_FOOT_HEIGHT;
    let heading = this.rotation;

    if (this.isDriving && this.vehicles.drivenCar) {
      distance = DRIVING_DIST;
      height = DRIVING_HEIGHT;
      heading = this.vehicles.drivenCar.rotation;
    }

    camera.position.set(
      this.position.x + Math.sin(heading) * distance,
      this.position.y + height + Math.sin(this.pitch) * 3,
      this.position.z + Math.cos(heading) * distance
    );

    const target = this.position.clone().add(new THREE.Vector3(0, LOOK_ABOVE, 0));
    camera.lookAt(target);
  }
}
