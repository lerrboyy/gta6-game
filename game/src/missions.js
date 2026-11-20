import * as THREE from './three.js';

const JOBS = [
  { num: 1, name: "FIRST DELIVERY", stages: 1, reward: 200, intro: ["LENA", "Rico, get that package across town before the timer runs out."] },
  { num: 2, name: "PACKAGE RUN", stages: 5, reward: 300, intro: ["MARCO", "We need those drops secured across the district, speed is key."] },
  { num: 3, name: "LOSE THE HEAT", stages: 3, reward: 500, intro: ["LENA", "The cops are on your tail, shake them and head to the safehouse."] },
  { num: 4, name: "FIRST WHEELS", stages: 2, reward: 400, intro: ["MARCO", "Swipe a ride off the street and park it in our garage."] },
  { num: 5, name: "DRIVE-BY", stages: 3, reward: 600, intro: ["LENA", "Clear out those rival drivers while cruising down the boulevard."] },
  { num: 6, name: "HEAT WAVE", stages: 2, reward: 800, intro: ["LENA", "Kick up a storm, get wanted level 3 and survive the pressure."] },
  { num: 7, name: "NIGHT RUN", stages: 6, reward: 1000, intro: ["MARCO", "Midnight run, collect all six moonlight drops before dawn."] },
  { num: 8, name: "GOLDEN HOUR", stages: 2, reward: 1500, intro: ["LENA", "Four stars? Time to make your final run for the beach and legend status."] }
];

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
    this.m4CarStolen = false;
    this.m6WantedAchieved = false;
    this.m8WantedAchieved = false;
    this.m8Escaped = false;

    this.rivals = [];
    this.rivalCars = [];
    this.packages = [];
    this.markerMesh = null;
    this.safehouseMesh = null;
    this.garageMesh = null;
    this.beachMesh = null;

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

  showDialogue(speaker, text) {
    let box = document.getElementById('dialogue-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dialogue-box';
      box.style.position = 'fixed';
      box.style.bottom = '30px';
      box.style.left = '50%';
      box.style.transform = 'translateX(-50%)';
      box.style.background = 'rgba(0, 0, 0, 0.85)';
      box.style.color = '#fff';
      box.style.padding = '12px 20px';
      box.style.fontFamily = 'monospace';
      box.style.fontSize = '15px';
      box.style.borderRadius = '6px';
      box.style.zIndex = '1001';
      box.style.border = '1px solid #ffd700';
      box.style.display = 'none';
      document.body.appendChild(box);
    }
    box.innerHTML = `<span style="color: #ffd700; font-weight: bold;">${speaker}:</span> ${text}`;
    box.style.display = 'block';

    if (this.dialogueTimer) {
      clearTimeout(this.dialogueTimer);
    }
    this.dialogueTimer = setTimeout(() => {
      box.style.display = 'none';
    }, 3500);
  }

  sayLines(lines) {
    if (!lines || lines.length === 0) return;
    let index = 0;
    const next = () => {
      if (index < lines.length) {
        const [speaker, text] = lines[index++];
        this.showDialogue(speaker, text);
        this.dialogueQueueTimer = setTimeout(next, 3800);
      }
    };
    next();
  }

  initMission(missionNum) {
    this.currentMission = missionNum;
    this.cleanupCurrentMissionVisuals();

    const job = JOBS.find(j => j.num === missionNum);
    if (job && job.intro) {
      this.sayLines([job.intro]);
    }

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
    } else if (missionNum === 4) {
      this.missionTimer = 0;
      this.m4CarStolen = false;
      const garagePos = new THREE.Vector3(60, 0, 60);
      const geom = new THREE.CylinderGeometry(2.5, 2.5, 6, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xaa8800, roughness: 0.3 });
      this.garageMesh = new THREE.Mesh(geom, mat);
      this.garageMesh.position.copy(garagePos);
      this.garageMesh.position.y += 3;
      this.scene.add(this.garageMesh);
    } else if (missionNum === 5) {
      this.missionTimer = 0;
      const rivalCoords = [
        new THREE.Vector3(25, 0, 25),
        new THREE.Vector3(-25, 0, 35),
        new THREE.Vector3(40, 0, -30)
      ];
      this.rivalCars = rivalCoords.map(pos => {
        const mesh = this.world.vehicles.createCarMesh(0xff9500);
        mesh.position.copy(pos);
        this.scene.add(mesh);
        return { mesh, hp: 2 };
      });
    } else if (missionNum === 6) {
      this.missionTimer = 30;
      this.m6WantedAchieved = false;
    } else if (missionNum === 7) {
      this.missionTimer = 0;
      const coords = [
        new THREE.Vector3(-50, 0, -50),
        new THREE.Vector3(50, 0, 50),
        new THREE.Vector3(-30, 0, 60),
        new THREE.Vector3(40, 0, -40),
        new THREE.Vector3(0, 0, -70),
        new THREE.Vector3(-70, 0, 0)
      ];
      this.packages = coords.map(pos => {
        const geom = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x005555, roughness: 0.2 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(pos);
        mesh.position.y += 0.75;
        this.scene.add(mesh);
        return { mesh, pos, collected: false };
      });
    } else if (missionNum === 8) {
      this.missionTimer = 0;
      this.m8WantedAchieved = false;
      this.m8Escaped = false;
      const beachPos = new THREE.Vector3(-200, 0, 0);
      const geom = new THREE.CylinderGeometry(3, 3, 8, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x008888, roughness: 0.3 });
      this.beachMesh = new THREE.Mesh(geom, mat);
      this.beachMesh.position.copy(beachPos);
      this.beachMesh.position.y += 4;
      this.scene.add(this.beachMesh);
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
    if (this.garageMesh) {
      this.scene.remove(this.garageMesh);
      this.garageMesh = null;
    }
    if (this.beachMesh) {
      this.scene.remove(this.beachMesh);
      this.beachMesh = null;
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
    if (this.rivalCars && this.rivalCars.length > 0) {
      this.rivalCars.forEach(rc => {
        if (rc.mesh) this.scene.remove(rc.mesh);
      });
      this.rivalCars = [];
    }
  }

  completeMission(reward, nextMissionNum) {
    this.world.cash += reward;
    this.world.respect = (this.world.respect || 0) + (50 * this.currentMission);
    this.saveManager.save(this.world);
    this.messageText = `MISSION COMPLETE +$${reward}!`;
    this.messageTimer = 3.0;

    if (nextMissionNum <= 8) {
      setTimeout(() => {
        this.initMission(nextMissionNum);
      }, 3000);
    } else {
      this.currentMission = 9;
      this.messageText = "SOLMAR LEGEND — ALL 8 JOBS DONE!";
      this.messageTimer = 5.0;
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

        if (this.currentMission === 5 && world.isDriving) {
          let nearestRivalCar = null;
          let minDist = 40;
          for (let rc of this.rivalCars) {
            const dist = playerPos.distanceTo(rc.mesh.position);
            if (dist <= minDist) {
              const toCar = rc.mesh.position.clone().sub(playerPos).normalize();
              const dot = toCar.dot(facing);
              if (dot > -0.5) {
                minDist = dist;
                nearestRivalCar = rc;
              }
            }
          }
          if (nearestRivalCar) {
            nearestRivalCar.hp -= 1;
            if (nearestRivalCar.hp <= 0) {
              this.scene.remove(nearestRivalCar.mesh);
              this.rivalCars = this.rivalCars.filter(rc => rc !== nearestRivalCar);
              world.cash += 50;
              this.saveManager.save(this.world);
            }
          }
        } else {
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
    } else if (this.currentMission === 4) {
      if (world.isDriving) {
        this.m4CarStolen = true;
      }
      const garagePos = new THREE.Vector3(60, 0, 60);
      if (this.m4CarStolen && world.position.distanceTo(garagePos) < 5) {
        this.completeMission(400, 5);
      }
    } else if (this.currentMission === 5) {
      if (this.rivalCars.length === 0) {
        this.completeMission(600, 6);
      }
    } else if (this.currentMission === 6) {
      if (world.wanted >= 3) {
        this.m6WantedAchieved = true;
      }
      if (this.m6WantedAchieved) {
        this.missionTimer -= dt;
        if (this.missionTimer <= 0) {
          this.completeMission(800, 7);
        }
      }
    } else if (this.currentMission === 7) {
      for (let pkg of this.packages) {
        if (!pkg.collected && world.position.distanceTo(pkg.mesh.position) < 3) {
          pkg.collected = true;
          this.scene.remove(pkg.mesh);
        }
      }
      if (this.packages.every(p => p.collected)) {
        this.completeMission(1000, 8);
      }
    } else if (this.currentMission === 8) {
      if (world.wanted >= 4) {
        this.m8WantedAchieved = true;
      }
      if (this.m8WantedAchieved && world.wanted === 0) {
        this.m8Escaped = true;
      }
      const beachPos = new THREE.Vector3(-200, 0, 0);
      if (this.m8Escaped && world.position.distanceTo(beachPos) < 5) {
        this.completeMission(1500, 9);
      }
    }

    if (this.messageTimer > 0) {
      this.objEl.innerText = this.messageText;
      return;
    }

    let text = '';
    if (this.currentMission === 1) {
      text = `JOB 1/8 FIRST DELIVERY — STAGE 1/1 | Reach Marker (30,0,-5) | Time: ${Math.ceil(this.missionTimer)}s | Cash: $${world.cash}`;
    } else if (this.currentMission === 2) {
      const remaining = this.packages.filter(p => !p.collected).length;
      text = `JOB 2/8 PACKAGE RUN — STAGE ${5 - remaining}/5 | Packages Left: ${remaining}/5 | Cash: $${world.cash}`;
    } else if (this.currentMission === 3) {
      if (!this.m3WantedAchieved) {
        text = `JOB 3/8 LOSE THE HEAT — STAGE 1/3 | Get Wanted (Steal a Car) | Cash: $${world.cash}`;
      } else if (world.wanted > 0) {
        text = `JOB 3/8 LOSE THE HEAT — STAGE 2/3 | Lose Police (Wanted: ${world.wanted}) | Cash: $${world.cash}`;
      } else {
        text = `JOB 3/8 LOSE THE HEAT — STAGE 3/3 | Reach Safehouse (-40,0,50) | Cash: $${world.cash}`;
      }
    } else if (this.currentMission === 4) {
      if (!this.m4CarStolen) {
        text = `JOB 4/8 FIRST WHEELS — STAGE 1/2 | Steal a Car (Press E) | Cash: $${world.cash}`;
      } else {
        text = `JOB 4/8 FIRST WHEELS — STAGE 2/2 | Drive to Garage (60,0,60) | Cash: $${world.cash}`;
      }
    } else if (this.currentMission === 5) {
      const killed = 3 - this.rivalCars.length;
      text = `JOB 5/8 DRIVE-BY — STAGE ${killed + 1}/3 | Shoot Rival Cars (${killed}/3) | Cash: $${world.cash}`;
    } else if (this.currentMission === 6) {
      if (!this.m6WantedAchieved) {
        text = `JOB 6/8 HEAT WAVE — STAGE 1/2 | Reach Wanted Level 3 | Cash: $${world.cash}`;
      } else {
        text = `JOB 6/8 HEAT WAVE — STAGE 2/2 | Survive Pressure | Time: ${Math.ceil(this.missionTimer)}s | Cash: $${world.cash}`;
      }
    } else if (this.currentMission === 7) {
      const remaining = this.packages.filter(p => !p.collected).length;
      text = `JOB 7/8 NIGHT RUN — STAGE ${6 - remaining}/6 | Packages Left: ${remaining}/6 | Cash: $${world.cash}`;
    } else if (this.currentMission === 8) {
      if (!this.m8WantedAchieved) {
        text = `JOB 8/8 GOLDEN HOUR — STAGE 1/2 | Reach Wanted 4 | Cash: $${world.cash}`;
      } else if (!this.m8Escaped) {
        text = `JOB 8/8 GOLDEN HOUR — STAGE 1.5/2 | Escape Wanted (Wanted: ${world.wanted}) | Cash: $${world.cash}`;
      } else {
        text = `JOB 8/8 GOLDEN HOUR — STAGE 2/2 | Reach Beach (-200,0,0) | Cash: $${world.cash}`;
      }
    } else {
      text = `ALL 8 JOBS DONE — SOLMAR IS YOURS! | Cash: $${world.cash}`;
    }
    this.objEl.innerText = text;
  }
}
