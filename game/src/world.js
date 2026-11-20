// Solmar Bay — world state: Rico himself, his stats and weapons, and the
// third-person chase camera.
//
// WorldManager owns the player character (a humanoid figure with swinging
// limbs), his health/cash/wanted/armor/respect, the day clock, the weapon
// slots he owns, and the three sub-managers that keep the city alive:
// vehicles, pedestrians and police. On foot Rico walks, sprints and jumps
// through the streets; in a car he rides along with the driven vehicle
// and the camera pulls back into a chase view.
import * as THREE from './three.js';
import { CONFIG } from './config.js';
import { VehicleManager } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';

// Camera geometry: on foot the camera hangs 6 back and 2.5 up; driving it
// pulls out to 10.5 back and 3 up. It always looks 1.2 above Rico.
const FOOT_DISTANCE = 6;
const FOOT_HEIGHT = 2.5;
const DRIVE_DISTANCE = 10.5;
const DRIVE_HEIGHT = 3.0;
const LOOK_HEIGHT = 1.2;
const MOUSE_SENSITIVITY = 0.003;
const PITCH_LIMIT = Math.PI / 3;

export class WorldManager {
  constructor(scene, cityGenerator) {
    this.scene = scene;
    this.city = cityGenerator;

    // Rico's state at the start of a new game.
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = 0; // facing yaw
    this.pitch = 0; // camera pitch
    this.health = 100;
    this.cash = 500;
    this.wanted = 0;
    this.armor = 0;
    this.respect = 0;
    this.day = 1;
    this.clockMinutes = 9 * 60 + 31; // 09:31 on day one
    this.weaponSlot = 1; // pistol drawn
    this.ownedWeapons = [0, 1]; // fists and pistol
    this.isGrounded = false;
    this.isDriving = false;
    this.walkPhase = 0;

    // The three systems that fill the city around him.
    this.vehicles = new VehicleManager(scene, this.city);
    this.vehicles.init();
    this.pedestrians = new PedestrianManager(scene, this.city);
    this.pedestrians.spawn();
    this.police = new PoliceManager(scene, this.city);

    this._buildPlayerMesh();
  }

  // ---------------------------------------------------------- player figure

  // Rico as a small humanoid: navy legs and teal jacket on swinging pivot
  // groups (so the walk cycle can rotate them), a dark belt, teal arms,
  // a skin-tone head with flat dark hair, and a black cap with a brim.
  _buildPlayerMesh() {
    this.playerGroup = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0x0e7c7b, roughness: 0.6 });

    // Legs hang from hip pivots so they can swing while walking.
    const legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.28);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.7 });
    this.legL = this._limb(-0.18, 0.8, legGeo, legMat, -0.4);
    this.legR = this._limb(0.18, 0.8, legGeo, legMat, -0.4);

    // Torso: teal jacket with a thin dark belt just below it.
    this.bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.75, 0.4), jacket);
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

    // Arms hang from shoulder pivots, same swinging trick as the legs.
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.22);
    this.armL = this._limb(-0.46, 1.5, armGeo, jacket, -0.32);
    this.armR = this._limb(0.46, 1.5, armGeo, jacket, -0.32);

    // Head, flattened hair, cap and brim.
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.6 })
    );
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

  // One swinging limb: a pivot group at (px, py) holding a box dropped
  // `drop` below the pivot, so rotating the pivot swings the limb.
  _limb(px, py, geo, mat, drop) {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = drop;
    mesh.castShadow = true;
    pivot.add(mesh);
    this.playerGroup.add(pivot);
    return pivot;
  }

  // ------------------------------------------------------------- placement

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.playerGroup.position.copy(this.position);
  }

  // E: step out of the car (Rico appears 2.5 to its side) or climb into
  // the nearest car within 5 units — stealing it earns one wanted star.
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

    const nearest = this.vehicles.getNearestCar(this.position, 5.0);
    if (nearest) {
      this.vehicles.drivenCar = nearest;
      this.isDriving = true;
      this.playerGroup.visible = false;
      this.wanted = Math.min(5, this.wanted + 1);
    }
  }

  // -------------------------------------------------------------- weapons

  // Draw a weapon Rico owns. Unknown slots and unowned weapons refuse.
  switchWeapon(slot) {
    if (CONFIG.WEAPONS[slot] && this.ownedWeapons.includes(slot)) {
      this.weaponSlot = slot;
      return true;
    }
    return false;
  }

  // Buy a weapon: it must exist, not be owned yet, and be affordable.
  // On success the cash is spent, the slot joins the owned list and the
  // new weapon is drawn.
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

  // ------------------------------------------------------------ damage etc

  // Armor soaks up to half the hit (rounded down) before health takes
  // the rest. Health never drops below zero; returns what is left.
  takeDamage(amount) {
    const soaked = Math.min(this.armor, Math.floor(amount / 2));
    this.armor -= soaked;
    this.health = Math.max(0, this.health - (amount - soaked));
    return this.health;
  }

  // Add respect and report the title of the highest rank reached.
  addRespect(points) {
    this.respect += points;
    let title = CONFIG.RESPECT_LEVELS[0].name;
    for (const level of CONFIG.RESPECT_LEVELS) {
      if (this.respect >= level.threshold) title = level.name;
    }
    return title;
  }

  // "DAY 1 09:31" — day number, then zero-padded 24-hour time.
  clockText() {
    const hours = Math.floor(this.clockMinutes / 60);
    const minutes = Math.floor(this.clockMinutes % 60);
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `DAY ${this.day} ${hh}:${mm}`;
  }

  // -------------------------------------------------------------- per-frame

  update(dt, input, audio) {
    // The clock runs a full in-game day in CONFIG.CLOCK.dayLengthMin
    // minutes of play; past midnight it wraps and the day ticks over.
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

    this._lookAround(input);
    const moving = this._moveOnFoot(dt, input, audio);
    this._animateWalk(dt, moving, audio);
  }

  // Mouse look: yaw turns Rico, pitch tilts the camera (clamped to
  // sixty degrees either way).
  _lookAround(input) {
    const delta = input.consumeMouseDelta();
    this.rotation -= delta.dx * MOUSE_SENSITIVITY;
    this.pitch = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, this.pitch - delta.dy * MOUSE_SENSITIVITY)
    );
    this.playerGroup.rotation.y = this.rotation;
  }

  // On-foot movement: WASD/arrows rotated by the facing yaw, sprint with
  // either Shift, Space to jump, gravity while airborne, axis-by-axis
  // collision against the city, and landing on the street or the highest
  // rooftop underfoot. Returns true while Rico is actually moving.
  _moveOnFoot(dt, input, audio) {
    const dir = new THREE.Vector3();
    if (input.isPressed('KeyW') || input.isPressed('ArrowUp')) dir.z -= 1;
    if (input.isPressed('KeyS') || input.isPressed('ArrowDown')) dir.z += 1;
    if (input.isPressed('KeyA') || input.isPressed('ArrowLeft')) dir.x -= 1;
    if (input.isPressed('KeyD') || input.isPressed('ArrowRight')) dir.x += 1;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);

    let speed = CONFIG.PLAYER_SPEED;
    if (input.isPressed('ShiftLeft') || input.isPressed('ShiftRight')) {
      speed *= CONFIG.PLAYER_SPRINT_MULT;
    }
    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.z * speed;

    // Jump from the ground, gravity in the air.
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

    // Walk X first, then Z; each axis only moves when the city says the
    // landing spot is clear of buildings.
    const probe = this.position.clone();
    probe.x += this.velocity.x * dt;
    if (!this.city.checkCollision(probe, 0.6)) this.position.x = probe.x;

    probe.copy(this.position);
    probe.z += this.velocity.z * dt;
    if (!this.city.checkCollision(probe, 0.6)) this.position.z = probe.z;

    // Vertical: fall or jump, landing on the street (y 0) or the highest
    // rooftop close enough underfoot to stand on.
    probe.copy(this.position);
    probe.y += this.velocity.y * dt;

    let rooftopY = 0;
    for (const box of this.city.colliders) {
      const underfoot =
        probe.x >= box.min.x && probe.x <= box.max.x &&
        probe.z >= box.min.z && probe.z <= box.max.z;
      const reachable =
        box.max.y > rooftopY &&
        probe.y >= box.max.y - 0.5 &&
        this.position.y >= box.max.y - 1.0;
      if (underfoot && reachable) rooftopY = box.max.y;
    }

    const floorY = Math.max(0, rooftopY);
    if (probe.y <= floorY) {
      this.position.y = floorY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.position.y = probe.y;
      this.isGrounded = probe.y <= floorY + 0.05;
    }

    this.playerGroup.position.copy(this.position);
    return dir.x !== 0 || dir.z !== 0;
  }

  // Walk cycle: legs and arms swing in opposite sine waves while Rico
  // moves on the ground; idle, the limbs ease back to neutral. A
  // footstep sound fires now and then while he is walking.
  _animateWalk(dt, moving, audio) {
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

  // --------------------------------------------------------------- camera

  // Third-person chase camera: behind Rico on foot, further back and
  // higher behind the car while driving, rising a little with the pitch,
  // always looking at a point just above his head.
  updateCamera(camera) {
    let distance = FOOT_DISTANCE;
    let height = FOOT_HEIGHT;
    let heading = this.rotation;

    if (this.isDriving && this.vehicles.drivenCar) {
      distance = DRIVE_DISTANCE;
      height = DRIVE_HEIGHT;
      heading = this.vehicles.drivenCar.rotation;
    }

    camera.position.set(
      this.position.x + Math.sin(heading) * distance,
      this.position.y + height + Math.sin(this.pitch) * 3,
      this.position.z + Math.cos(heading) * distance
    );

    const target = this.position.clone().add(new THREE.Vector3(0, LOOK_HEIGHT, 0));
    camera.lookAt(target);
  }
}
