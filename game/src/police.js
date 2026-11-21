// Solmar Bay — the wanted system.
//
// PoliceManager runs the heat: patrol cruisers that chase Rico down, the
// spotlight helicopter that joins at three stars, the roadblock that
// forms at four, the dispatch list the HUD reads, the slow wanted decay
// when Rico slips out of sight, and the BUSTED sequence when a cruiser
// catches him on foot.
import * as THREE from './three.js';
import { CONFIG } from './config.js';

// One cruiser per wanted star (capped at five), each chasing a little
// faster as the heat rises.
const MAX_CRUISERS = 5;
const CRUISER_BASE_SPEED = 18;
const CRUISER_SPEED_PER_STAR = 3;
const HELI_STARS = 3;
const HELI_HEIGHT = 25;
const ROADBLOCK_STARS = 4;
const DECAY_RANGE = 40;
const DECAY_SECONDS = 10;
const BUSTED_SECONDS = 2.0;

export class PoliceManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.policeCars = [];
    this.outOfSightTimer = 0;
    this.bustedTimer = 0;
    this.heli = null;
    this.heliRotor = null;
    this.roadblock = [];
    this.unitNames = ['PIER 5', 'TIDE 6', 'TIDE 37', 'AIR ONE', 'TAC-45', 'K-9 12'];
    this.bustedOverlayEl = null;

    this.initBustedOverlay();
  }

  // The red BUSTED screen. Reuse the one from the page when it exists;
  // otherwise build it once and pin it to the document body.
  initBustedOverlay() {
    let overlay = document.getElementById('busted-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'busted-overlay';
      overlay.className = 'overlay hidden';
      overlay.style.background = 'rgba(180, 0, 0, 0.75)';
      overlay.innerHTML =
        '<div class="menu-box"><h1>BUSTED</h1>' +
        '<p class="intro">Busted by Solmar Bay PD! Cash seized, back on the streets.</p></div>';
      document.body.appendChild(overlay);
    }
    this.bustedOverlayEl = overlay;
  }

  // A white patrol car: black hood, dark cabin, red-and-blue light bar,
  // four wheels. Faces +Z, like the traffic cars.
  createPoliceCarMesh() {
    const cruiser = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.7, 4.2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 })
    );
    body.position.y = 0.6;
    body.castShadow = true;
    cruiser.add(body);

    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.71, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })
    );
    hood.position.set(0, 0.6, 1.0);
    cruiser.add(hood);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 })
    );
    cabin.position.set(0, 1.15, -0.2);
    cruiser.add(cabin);

    const lightBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.2, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0x0000ff, roughness: 0.1 })
    );
    lightBar.position.set(0, 1.6, 0);
    cruiser.add(lightBar);

    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const corners = [
      [-1.05, 0.35, 1.4], [1.05, 0.35, 1.4],
      [-1.05, 0.35, -1.4], [1.05, 0.35, -1.4],
    ];
    for (const corner of corners) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(corner[0], corner[1], corner[2]);
      cruiser.add(wheel);
    }

    return cruiser;
  }

  // The police helicopter: dark body and tail, a long main rotor on top
  // (kept as this.heliRotor so update() can spin it), and a pale
  // spotlight cone hanging underneath.
  createHeliMesh() {
    const heli = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, roughness: 0.3, metalness: 0.6,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 4), hullMat);
    body.position.y = 0.4;
    body.castShadow = true;
    heli.add(body);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3), hullMat);
    tail.position.set(0, 0.5, -3.5);
    heli.add(tail);

    const rotor = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })
    );
    rotor.position.set(0, 0.85, 0);
    heli.add(rotor);
    this.heliRotor = rotor;

    const coneGeo = new THREE.ConeGeometry(4, 12, 16);
    coneGeo.translate(0, -6, 0);
    const cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
      })
    );
    heli.add(cone);

    return heli;
  }

  // What the HUD dispatch panel shows: one row per cruiser (RAMMING up
  // close, PURSUIT further out), then the heli and the roadblock when
  // they are active. At most five rows.
  getDispatch(world) {
    const rows = [];
    for (let i = 0; i < this.policeCars.length; i++) {
      const cruiser = this.policeCars[i];
      const gap = cruiser.position.distanceTo(world.position);
      rows.push({
        name: this.unitNames[i % this.unitNames.length],
        dist: Math.round(gap) + 'M',
        tactic: gap < 15 ? 'RAMMING' : 'PURSUIT',
      });
    }
    if (this.heli) {
      rows.push({ name: 'AIR ONE', dist: '55M', tactic: 'SPOTLIGHT' });
    }
    if (this.roadblock.length > 0) {
      rows.push({ name: 'TAC-45', dist: '120M', tactic: 'ROADBLOCK' });
    }
    return rows.slice(0, 5);
  }

  // The wanted-level label for the dispatch heading, clamped to 0-5.
  getWantedName(world) {
    const level = Math.min(5, Math.max(0, world.wanted));
    return CONFIG.WANTED_NAMES[level];
  }

  update(dt, world) {
    const wanted = Math.min(5, Math.max(0, world.wanted));

    // Keep one cruiser per star, up to the cap; shed the extras when
    // the heat drops.
    while (this.policeCars.length < wanted && this.policeCars.length < MAX_CRUISERS) {
      this.spawnPoliceCar(world.position);
    }
    while (this.policeCars.length > wanted) {
      const extra = this.policeCars.pop();
      if (extra && extra.mesh) this.scene.remove(extra.mesh);
    }

    let closest = 999;

    for (const cruiser of this.policeCars) {
      const toRico = world.position.clone().sub(cruiser.position);
      const gap = toRico.length();
      if (gap < closest) closest = gap;

      if (gap > 1.5) {
        toRico.normalize();
        cruiser.rotation = Math.atan2(toRico.x, toRico.z);
        cruiser.mesh.rotation.y = cruiser.rotation;

        const speed = CRUISER_BASE_SPEED + wanted * CRUISER_SPEED_PER_STAR;
        const step = cruiser.position.clone().addScaledVector(toRico, speed * dt);

        if (!this.city.checkCollision(step, 1.5)) {
          cruiser.position.copy(step);
        } else {
          // Blocked by a building: slide sideways around it.
          cruiser.position.x += toRico.z * speed * dt * 0.6;
          cruiser.position.z -= toRico.x * speed * dt * 0.6;
        }
      }

      cruiser.mesh.position.copy(cruiser.position);

      // Contact: ram Rico's car to slow it, or bust him on foot.
      if (gap < 3.5) {
        if (world.isDriving && world.vehicles.drivenCar) {
          world.vehicles.drivenCar.speed *= 0.75;
        } else if (!world.isDriving && gap < 2.5) {
          this.triggerBusted(world);
          return;
        }
      }
    }

    // The helicopter joins at three stars and hovers over Rico; it
    // leaves, rotor and all, when the heat falls below three.
    if (wanted >= HELI_STARS && !this.heli) {
      this.heli = this.createHeliMesh();
      this.heli.position.copy(world.position).add(new THREE.Vector3(0, HELI_HEIGHT, 0));
      this.scene.add(this.heli);
    } else if (wanted < HELI_STARS && this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
      this.heliRotor = null;
    }
    if (this.heli) {
      this.heli.position.copy(world.position).add(new THREE.Vector3(0, HELI_HEIGHT, 0));
      if (this.heliRotor) this.heliRotor.rotation.y += dt * 20;
    }

    // At four stars a roadblock forms ahead of Rico: two cruisers parked
    // side by side across his path, 40 ahead while driving, 30 on foot.
    if (wanted >= ROADBLOCK_STARS && this.roadblock.length === 0) {
      const driving = world.isDriving && world.vehicles.drivenCar;
      const heading = driving
        ? new THREE.Vector3(
            Math.sin(world.vehicles.drivenCar.rotation), 0,
            Math.cos(world.vehicles.drivenCar.rotation)
          )
        : new THREE.Vector3(-Math.sin(world.rotation), 0, -Math.cos(world.rotation));
      const aheadBy = driving ? 40 : 30;
      const origin = driving ? world.vehicles.drivenCar.position : world.position;
      const ahead = origin.clone().addScaledVector(heading, aheadBy);
      const sideways = new THREE.Vector3(-heading.z, 0, heading.x);
      const facing = Math.atan2(heading.x, heading.z);

      const leftCar = this.createPoliceCarMesh();
      leftCar.position.copy(ahead.clone().addScaledVector(sideways, 4));
      leftCar.rotation.y = facing;
      this.scene.add(leftCar);

      const rightCar = this.createPoliceCarMesh();
      rightCar.position.copy(ahead.clone().addScaledVector(sideways, -4));
      rightCar.rotation.y = facing;
      this.scene.add(rightCar);

      this.roadblock = [leftCar, rightCar];
    } else if (wanted < ROADBLOCK_STARS && this.roadblock.length > 0) {
      for (const blocker of this.roadblock) {
        if (blocker) this.scene.remove(blocker);
      }
      this.roadblock = [];
    }

    // Out of sight: no cruiser within range for ten seconds, lose a star.
    if (wanted > 0) {
      if (closest > DECAY_RANGE) {
        this.outOfSightTimer += dt;
        if (this.outOfSightTimer >= DECAY_SECONDS) {
          world.wanted = Math.max(0, world.wanted - 1);
          this.outOfSightTimer = 0;
        }
      } else {
        this.outOfSightTimer = 0;
      }
    }

    // Hide the BUSTED overlay once its timer runs out.
    if (this.bustedTimer > 0) {
      this.bustedTimer -= dt;
      if (this.bustedTimer <= 0 && this.bustedOverlayEl) {
        this.bustedOverlayEl.classList.add('hidden');
      }
    }
  }

  // Drop a fresh cruiser 70-100 units out, in a random direction around
  // the player. The angle is drawn first, then the distance, matching
  // the original spawn order.
  spawnPoliceCar(playerPos) {
    const mesh = this.createPoliceCarMesh();
    const angle = Math.random() * Math.PI * 2;
    const distance = 70 + Math.random() * 30;
    const x = playerPos.x + Math.sin(angle) * distance;
    const z = playerPos.z + Math.cos(angle) * distance;

    mesh.position.set(x, 0, z);
    this.scene.add(mesh);

    this.policeCars.push({
      mesh: mesh,
      position: mesh.position,
      rotation: 0,
    });
  }

  // Caught: heat cleared, 10% of the cash seized, health restored, Rico
  // dumped back at the precinct corner (15, 0, 25) on foot, every unit
  // stood down, and the BUSTED overlay shown for two seconds.
  triggerBusted(world) {
    world.wanted = 0;
    world.cash = Math.max(0, Math.floor(world.cash * 0.9));
    world.health = 100;

    if (world.isDriving && world.vehicles.drivenCar) {
      world.vehicles.drivenCar = null;
      world.isDriving = false;
      if (world.playerGroup) world.playerGroup.visible = true;
    }

    world.setPosition(15, 0, 25);

    for (const cruiser of this.policeCars) {
      if (cruiser && cruiser.mesh) this.scene.remove(cruiser.mesh);
    }
    this.policeCars = [];

    if (this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
      this.heliRotor = null;
    }
    for (const blocker of this.roadblock) {
      if (blocker) this.scene.remove(blocker);
    }
    this.roadblock = [];

    if (this.bustedOverlayEl) {
      this.bustedOverlayEl.classList.remove('hidden');
    }
    this.bustedTimer = BUSTED_SECONDS;
  }
}
