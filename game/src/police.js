import * as THREE from './three.js';

export class PoliceManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.policeCars = [];
    this.outOfSightTimer = 0;
    this.bustedTimer = 0;
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

    if (this.bustedOverlayEl) {
      this.bustedOverlayEl.classList.remove('hidden');
    }
    this.bustedTimer = 2.0;
  }
}
