import * as THREE from './three.js';

export class MissionManager {
  constructor(scene, world, saveManager) {
    this.scene = scene;
    this.world = world;
    this.saveManager = saveManager;
    this.currentMission = 1;
    this.missionTimer = 90;
    this.messageTimer = 0;
    this.messageText = '';
    this.lastShotTime = 0;
    this.m3WantedAchieved = false;

    this.rivals = [];
    this.packages = [];
    this.markerMesh = null;
    this.safehouseMesh = null;

    // Create objective div if missing
    let objEl = document.getElementById('mission-objective');
    if (!objEl) {
      objEl = document.createElement('div');
      objEl.id = 'mission-objective';
      objEl.style.position = 'fixed';
      objEl.style.top = '10px';
      objEl.style.left = '50%';
      objEl.style.transform = 'translateX(-50%)';
      objEl.style.background = 'rgba(0, 0, 0, 0.7)';
      objEl.style.color = '#fff';
      objEl.style.padding = '8px 16px';
      objEl.style.fontFamily = 'monospace';
      objEl.style.fontSize = '16px';
      objEl.style.borderRadius = '4px';
      objEl.style.zIndex = '1000';
      document.body.appendChild(objEl);
    }
    this.objEl = objEl;

    // Create crosshair div if missing
    let crossEl = document.getElementById('crosshair');
    if (!crossEl) {
      crossEl = document.createElement('div');
      crossEl.id = 'crosshair';
      crossEl.style.position = 'fixed';
      crossEl.style.top = '50%';
      crossEl.style.left = '50%';
      crossEl.style.transform = 'translate(-50%, -50%)';
      crossEl.style.width = '10px';
      crossEl.style.height = '10px';
      crossEl.style.border = '2px solid rgba(255,255,255,0.7)';
      crossEl.style.borderRadius = '50%';
      crossEl.style.zIndex = '999';
      document.body.appendChild(crossEl);
    }

    this.initMission(1);
  }

  initMission(missionNum) {
    this.currentMission = missionNum;
    this.cleanupCurrentMissionVisuals();

    if (missionNum === 1) {
      this.missionTimer = 90;
      this.m1Target = new THREE.Vector3(30, 0, -5);
      const geom = new THREE.CylinderGeometry(1.5, 1.5, 6, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x0088aa, roughness: 0.3 });
      this.markerMesh = new THREE.Mesh(geom, mat);
      this.markerMesh.position.copy(this.m1Target);
      this.markerMesh.position.y += 3;
      this.scene.add(this.markerMesh);
    } else if (missionNum === 2) {
      this.missionTimer = 0;
      const coords = [
        new THREE.Vector3(20, 0, 30),
        new THREE.Vector3(-10, 0, 45),
        new THREE.Vector3(35, 0, 20),
        new THREE.Vector3(-20, 0, 10),
        new THREE.Vector3(5, 0, -30)
      ];
      this.packages = coords.map(pos => {
        const geom = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff5500, roughness: 0.2 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(pos);
        mesh.position.y += 0.75;
        this.scene.add(mesh);
        return { mesh, pos, collected: false };
      });
    } else if (missionNum === 3) {
      this.missionTimer = 0;
      this.m3WantedAchieved = false;
      const safehousePos = new THREE.Vector3(-40, 0, 50);
      const geom = new THREE.CylinderGeometry(2, 2, 8, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0x880088, roughness: 0.3 });
      this.safehouseMesh = new THREE.Mesh(geom, mat);
      this.safehouseMesh.position.copy(safehousePos);
      this.safehouseMesh.position.y += 4;
      this.scene.add(this.safehouseMesh);

      const rivalOffsets = [
        new THREE.Vector3(-38, 0, 48),
        new THREE.Vector3(-42, 0, 52),
        new THREE.Vector3(-39, 0, 55)
      ];
      this.rivals = rivalOffsets.map(pos => {
        const rGeom = new THREE.BoxGeometry(1, 2, 1);
        const rMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5 });
        const mesh = new THREE.Mesh(rGeom, rMat);
        mesh.position.copy(pos);
        mesh.position.y += 1;
        this.scene.add(mesh);
        return { mesh, hp: 3 };
      });
    }
  }

  cleanupCurrentMissionVisuals() {
    if (this.markerMesh) {
      this.scene.remove(this.markerMesh);
      this.markerMesh = null;
    }
    if (this.safehouseMesh) {
      this.scene.remove(this.safehouseMesh);
      this.safehouseMesh = null;
    }
    if (this.packages && this.packages.length > 0) {
      this.packages.forEach(p => {
        if (p.mesh) this.scene.remove(p.mesh);
      });
      this.packages = [];
    }
    if (this.rivals && this.rivals.length > 0) {
      this.rivals.forEach(r => {
        if (r.mesh) this.scene.remove(r.mesh);
      });
      this.rivals = [];
    }
  }

  completeMission(reward, nextMissionNum) {
    this.world.cash += reward;
    this.saveManager.save(this.world);
    this.messageText = `MISSION COMPLETE +$${reward}!`;
    this.messageTimer = 3.0;

    if (nextMissionNum <= 3) {
      setTimeout(() => {
        this.initMission(nextMissionNum);
      }, 3000);
    } else {
      this.currentMission = 4;
    }
  }

  update(dt, world, input) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
    }

    if (input.isPressed('KeyF')) {
      const now = Date.now();
      if (now - this.lastShotTime > 500) {
        this.lastShotTime = now;
        const facing = new THREE.Vector3(-Math.sin(world.rotation), 0, -Math.cos(world.rotation));
        const playerPos = world.position;

        let nearestRival = null;
        let minDist = 40;

        for (let r of this.rivals) {
          const dist = playerPos.distanceTo(r.mesh.position);
          if (dist <= minDist) {
            const toRival = r.mesh.position.clone().sub(playerPos).normalize();
            const dot = toRival.dot(facing);
            if (dot > 0.5) {
              minDist = dist;
              nearestRival = r;
            }
          }
        }

        if (nearestRival) {
          nearestRival.hp -= 1;
          if (nearestRival.hp <= 0) {
            this.scene.remove(nearestRival.mesh);
            this.rivals = this.rivals.filter(r => r !== nearestRival);
            world.cash += 50;
            this.saveManager.save(this.world);
          }
        }
      }
    }

    if (this.currentMission === 1) {
      this.missionTimer -= dt;
      if (this.missionTimer <= 0) {
        this.missionTimer = 90;
      }
      if (world.position.distanceTo(this.m1Target) < 4) {
        this.completeMission(200, 2);
      }
    } else if (this.currentMission === 2) {
      for (let pkg of this.packages) {
        if (!pkg.collected && world.position.distanceTo(pkg.mesh.position) < 3) {
          pkg.collected = true;
          this.scene.remove(pkg.mesh);
        }
      }
      if (this.packages.every(p => p.collected)) {
        this.completeMission(300, 3);
      }
    } else if (this.currentMission === 3) {
      if (world.wanted >= 1) {
        this.m3WantedAchieved = true;
      }
      const safehousePos = new THREE.Vector3(-40, 0, 50);
      if (this.m3WantedAchieved && world.wanted === 0 && world.position.distanceTo(safehousePos) < 4) {
        this.completeMission(500, 4);
      }
    }

    if (this.messageTimer > 0) {
      this.objEl.innerText = this.messageText;
      return;
    }

    let text = '';
    if (this.currentMission === 1) {
      text = `M1: First Delivery | Reach Marker (30,0,-5) | Time: ${Math.ceil(this.missionTimer)}s | Cash: $${world.cash}`;
    } else if (this.currentMission === 2) {
      const remaining = this.packages.filter(p => !p.collected).length;
      text = `M2: Package Run | Packages Left: ${remaining}/5 | Cash: $${world.cash}`;
    } else if (this.currentMission === 3) {
      if (!this.m3WantedAchieved) {
        text = `M3: Lose the Heat | Step 1: Get Wanted (Steal a Car) | Cash: $${world.cash}`;
      } else if (world.wanted > 0) {
        text = `M3: Lose the Heat | Step 2: Lose the Police (Wanted: ${world.wanted}) | Cash: $${world.cash}`;
      } else {
        text = `M3: Lose the Heat | Step 3: Reach Safehouse at (-40,0,50) | Cash: $${world.cash}`;
      }
    } else {
      text = `All Missions Complete! | Cash: $${world.cash}`;
    }
    this.objEl.innerText = text;
  }
}
