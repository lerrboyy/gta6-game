import * as THREE from './three.js';
import { CONFIG } from './config.js';

// v3: the wanted system — patrol cars, the helicopter and roadblocks, plus the
// dispatch list the HUD shows while Rico is hot.
export class PoliceManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.policeCars = [];
    this.outOfSightTimer = 0;
    this.bustedTimer = 0;
    this.heli = null;
    this.roadblock = [];
    this.unitNames = ['PIER 5', 'TIDE 6', 'TIDE 37', 'AIR ONE', 'TAC-45', 'K-9 12'];
    // Support structures for police dispatch tracking, aerial helicopter units, and tactical roadblocks
    this.bustedOverlayEl = null;
    
    this.initBustedOverlay();
  }

  initBustedOverlay() {
    let el = document.getElementById('busted-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'busted-overlay';
      el.className = 'overlay hidden';
      el.style.background = 'rgba(180, 0, 0, 0.75)';
      el.innerHTML = '<div class="menu-box"><h1>BUSTED</h1><p class="intro">Busted by Solmar Bay PD! Cash seized, back on the streets.</p></div>';
      document.body.appendChild(el);
    }
    this.bustedOverlayEl = el;
  }

  createPoliceCarMesh() {
    const carGroup = new THREE.Group();

    // White base body
    const bodyGeo = new THREE.BoxGeometry(2.0, 0.7, 4.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    carGroup.add(body);

    // Black hood/sides accent
    const hoodGeo = new THREE.BoxGeometry(2.02, 0.71, 2.0);
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.set(0, 0.6, 1.0);
    carGroup.add(hood);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.6, 2.2);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.15, -0.2);
    carGroup.add(cabin);

    // Light bar on top
    const barGeo = new THREE.BoxGeometry(1.0, 0.2, 0.4);
    const barMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0x0000ff, roughness: 0.1 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(0, 1.6, 0);
    carGroup.add(bar);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const wheelPositions = [
      [-1.05, 0.35, 1.4], [1.05, 0.35, 1.4],
      [-1.05, 0.35, -1.4], [1.05, 0.35, -1.4]
    ];
    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(...pos);
      carGroup.add(wheel);
    }

    return carGroup;
  }

  createHeliMesh() {
    const heliGroup = new THREE.Group();

    // Dark body box (2.2 x 0.8 x 4)
    const bodyGeo = new THREE.BoxGeometry(2.2, 0.8, 4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    body.castShadow = true;
    heliGroup.add(body);

    // Tail box (0.5 x 0.5 x 3) behind it
    const tailGeo = new THREE.BoxGeometry(0.5, 0.5, 3);
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.6 });
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(0, 0.5, -3.5);
    heliGroup.add(tail);

    // Main rotor (thin box 7 x 0.08 x 0.5) on top stored as this.heliRotor
    const rotorGeo = new THREE.BoxGeometry(7, 0.08, 0.5);
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(0, 0.85, 0);
    heliGroup.add(rotor);
    this.heliRotor = rotor;

    // White spotlight cone under it (cone mesh pointing down, semi-transparent)
    const coneGeo = new THREE.ConeGeometry(4, 12, 16);
    coneGeo.translate(0, -6, 0);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    heliGroup.add(cone);

    return heliGroup;
  }

  getDispatch(world) {
    const list = [];
    for (let i = 0; i < this.policeCars.length; i++) {
      const pCar = this.policeCars[i];
      const rawDist = pCar.position.distanceTo(world.position);
      const dist = Math.round(rawDist) + 'M';
      const tactic = rawDist < 15 ? 'RAMMING' : 'PURSUIT';
      list.push({
        name: this.unitNames[i % this.unitNames.length],
        dist: dist,
        tactic: tactic
      });
    }
    if (this.heli) {
      list.push({ name: 'AIR ONE', dist: '55M', tactic: 'SPOTLIGHT' });
    }
    if (this.roadblock.length > 0) {
      list.push({ name: 'TAC-45', dist: '120M', tactic: 'ROADBLOCK' });
    }
    return list.slice(0, 5);
  }

  getWantedName(world) {
    return CONFIG.WANTED_NAMES[Math.min(5, Math.max(0, world.wanted))];
  }

  update(dt, world) {
    const targetWanted = Math.min(5, Math.max(0, world.wanted));
    
    // Manage number of police cars (1 per star, max 5)
    while (this.policeCars.length < targetWanted && this.policeCars.length < 5) {
      this.spawnPoliceCar(world.position);
    }
    while (this.policeCars.length > targetWanted) {
      const pCar = this.policeCars.pop();
      if (pCar && pCar.mesh) this.scene.remove(pCar.mesh);
    }

    let nearestPoliceDist = 999;

    for (const pCar of this.policeCars) {
      const toPlayer = world.position.clone().sub(pCar.position);
      const dist = toPlayer.length();
      if (dist < nearestPoliceDist) {
        nearestPoliceDist = dist;
      }

      if (dist > 1.5) {
        toPlayer.normalize();
        pCar.rotation = Math.atan2(toPlayer.x, toPlayer.z);
        pCar.mesh.rotation.y = pCar.rotation;
        
        const speed = 18 + targetWanted * 3;
        const nextPos = pCar.position.clone().addScaledVector(toPlayer, speed * dt);
        
        if (!this.city.checkCollision(nextPos, 1.5)) {
          pCar.position.copy(nextPos);
        } else {
          // Nudge around obstacle
          pCar.position.x += toPlayer.z * speed * dt * 0.6;
          pCar.position.z -= toPlayer.x * speed * dt * 0.6;
        }
      }

      pCar.mesh.position.copy(pCar.position);

      // Check BUSTED or ramming
      if (dist < 3.5) {
        if (world.isDriving && world.vehicles.drivenCar) {
          // Ram car: slow down driven car
          world.vehicles.drivenCar.speed *= 0.75;
        } else if (!world.isDriving && dist < 2.5) {
          this.triggerBusted(world);
          return;
        }
      }
    }

    // Helicopter support (wanted >= 3)
    if (targetWanted >= 3 && !this.heli) {
      this.heli = this.createHeliMesh();
      this.heli.position.copy(world.position).add(new THREE.Vector3(0, 25, 0));
      this.scene.add(this.heli);
    } else if (targetWanted < 3 && this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
      this.heliRotor = null;
    }
    if (this.heli) {
      this.heli.position.copy(world.position).add(new THREE.Vector3(0, 25, 0));
      if (this.heliRotor) {
        this.heliRotor.rotation.y += dt * 20;
      }
    }

    // Roadblock support (wanted >= 4)
    if (targetWanted >= 4 && this.roadblock.length === 0) {
      const isDriving = world.isDriving && world.vehicles.drivenCar;
      const dir = isDriving
        ? new THREE.Vector3(Math.sin(world.vehicles.drivenCar.rotation), 0, Math.cos(world.vehicles.drivenCar.rotation))
        : new THREE.Vector3(-Math.sin(world.rotation), 0, -Math.cos(world.rotation));
      const aheadDist = isDriving ? 40 : 30;
      const basePos = isDriving ? world.vehicles.drivenCar.position : world.position;
      const ahead = basePos.clone().addScaledVector(dir, aheadDist);
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);

      const posLeft = ahead.clone().addScaledVector(perp, 4);
      const posRight = ahead.clone().addScaledVector(perp, -4);

      const carLeft = this.createPoliceCarMesh();
      carLeft.position.copy(posLeft);
      const rot = Math.atan2(dir.x, dir.z);
      carLeft.rotation.y = rot;
      this.scene.add(carLeft);

      const carRight = this.createPoliceCarMesh();
      carRight.position.copy(posRight);
      carRight.rotation.y = rot;
      this.scene.add(carRight);

      this.roadblock = [carLeft, carRight];
    } else if (targetWanted < 4 && this.roadblock.length > 0) {
      for (const rbCar of this.roadblock) {
        if (rbCar) this.scene.remove(rbCar);
      }
      this.roadblock = [];
    }

    // Wanted decay: no police car within ~40 units for 10 seconds -> -1 star
    if (targetWanted > 0) {
      if (nearestPoliceDist > 40) {
        this.outOfSightTimer += dt;
        if (this.outOfSightTimer >= 10.0) {
          world.wanted = Math.max(0, world.wanted - 1);
          this.outOfSightTimer = 0;
        }
      } else {
        this.outOfSightTimer = 0;
      }
    }

    // Handle BUSTED overlay timer
    if (this.bustedTimer > 0) {
      this.bustedTimer -= dt;
      if (this.bustedTimer <= 0 && this.bustedOverlayEl) {
        this.bustedOverlayEl.classList.add('hidden');
      }
    }
  }

  spawnPoliceCar(playerPos) {
    const mesh = this.createPoliceCarMesh();
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 30;
    const x = playerPos.x + Math.sin(angle) * dist;
    const z = playerPos.z + Math.cos(angle) * dist;
    
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);

    this.policeCars.push({
      mesh: mesh,
      position: mesh.position,
      rotation: 0
    });
  }

  triggerBusted(world) {
    world.wanted = 0;
    world.cash = Math.max(0, Math.floor(world.cash * 0.9)); // Lose 10% cash
    world.health = 100;
    
    if (world.isDriving && world.vehicles.drivenCar) {
      world.vehicles.drivenCar = null;
      world.isDriving = false;
      if (world.playerGroup) world.playerGroup.visible = true;
    }

    world.setPosition(15, 0, 25);

    for (const pCar of this.policeCars) {
      if (pCar && pCar.mesh) this.scene.remove(pCar.mesh);
    }
    this.policeCars = [];

    if (this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
      this.heliRotor = null;
    }
    for (const rbCar of this.roadblock) {
      if (rbCar) this.scene.remove(rbCar);
    }
    this.roadblock = [];

    if (this.bustedOverlayEl) {
      this.bustedOverlayEl.classList.remove('hidden');
    }
    this.bustedTimer = 2.0;
  }
}
