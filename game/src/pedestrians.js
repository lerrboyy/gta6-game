// Street life for Solmar Bay: ordinary pedestrians strolling the sidewalks
// and the player's crew — Rico, Lena and Marco — hanging around near the
// player. Pedestrians keep to the pavement strips beside the roads, turn
// onto a fresh stretch every so often, and give the player a wide berth
// when he gets too close.
import * as THREE from './three.js';
import { CONFIG } from './config.js';

// The city grid runs nine roads at -214 + i * 52, and each road carries a
// 3-wide sidewalk strip 7.5 units either side of its centre line.
const ROAD_CENTRES = [];
for (let i = 0; i < 9; i++) ROAD_CENTRES.push(-214 + i * 52);
const SIDEWALK_OFFSET = 7.5;
const WALK_LIMIT = 240;
const PED_COUNT = 10;
const AVOID_RADIUS = 4;
const FLEE_SPEED = 2.5;
const CREW_IDLE_TURN = 0.2;

// Where each crew member stands relative to the player when they spawn.
const CREW_SPOTS = [
  { dx: -5, dz: 2 },
  { dx: 0, dz: 6 },
  { dx: 5, dz: 3 },
];

export class PedestrianManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.pedestrians = [];
    this.crew = [];
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

  // Pick a fresh stretch of sidewalk to walk: one road, one side of it,
  // and a direction along it. The facing angle follows the walking direction.
  _pickSidewalkLane(ped) {
    const centre = ROAD_CENTRES[Math.floor(Math.random() * ROAD_CENTRES.length)];
    const side = Math.random() < 0.5 ? -SIDEWALK_OFFSET : SIDEWALK_OFFSET;
    const alongEastWest = Math.random() < 0.5;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const along = (Math.random() * 2 - 1) * WALK_LIMIT;
    if (alongEastWest) {
      ped.lane = { axis: 'x', fixed: centre + side, dir };
      ped.position.set(along, 0, centre + side);
      ped.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      ped.lane = { axis: 'z', fixed: centre + side, dir };
      ped.position.set(centre + side, 0, along);
      ped.angle = dir > 0 ? 0 : Math.PI;
    }
    ped.timer = 3 + Math.random() * 5;
  }

  spawn() {
    for (let i = 0; i < PED_COUNT; i++) {
      const mesh = this.createPedestrianMesh();
      const ped = {
        mesh: mesh,
        position: mesh.position,
        velocity: new THREE.Vector3(),
        speed: 1.0 + Math.random() * 0.8,
        angle: Math.random() * Math.PI * 2,
        timer: Math.random() * 5,
        lane: null,
      };
      ped.baseSpeed = ped.speed;
      this._pickSidewalkLane(ped);
      this.scene.add(mesh);
      this.pedestrians.push(ped);
    }

    this.spawnCrew();
  }

  // The crew gathers in a loose cluster right by the player (who starts at
  // the origin), each in their own colours from CONFIG.CREW.
  spawnCrew(anchor) {
    this.crew = [];
    const home = anchor && anchor.position ? anchor.position : anchor;
    const base = home && typeof home.x === 'number' ? home : new THREE.Vector3(0, 0, 0);
    CONFIG.CREW.forEach((member, index) => {
      const spot = CREW_SPOTS[index % CREW_SPOTS.length];
      const mesh = this.createPedestrianMesh();
      const bodyMat = new THREE.MeshStandardMaterial({ color: member.color, roughness: 0.6 });
      if (mesh.children[0]) {
        mesh.children[0].material = bodyMat;
      }
      mesh.position.set(base.x + spot.dx, 0, base.z + spot.dz);
      this.scene.add(mesh);

      this.crew.push({
        name: member.name,
        role: member.role,
        mesh: mesh,
        position: mesh.position,
        angle: Math.random() * Math.PI * 2,
      });
    });
  }

  update(dt, playerPosition) {
    // The caller passes either the player's position vector or the world
    // object, which carries the player position on its .position field.
    const target = playerPosition && playerPosition.position ? playerPosition.position : playerPosition;

    for (const ped of this.pedestrians) {
      ped.timer -= dt;
      if (ped.timer <= 0) {
        this._pickSidewalkLane(ped);
      }

      // Give the player room: turn away and hurry off when he closes in.
      let hurrying = false;
      if (target && typeof target.x === 'number') {
        const distToPlayer = ped.position.distanceTo(target);
        if (distToPlayer < AVOID_RADIUS) {
          const away = ped.position.clone().sub(target).normalize();
          ped.angle = Math.atan2(away.x, away.z);
          hurrying = true;
        }
      }

      const speed = hurrying ? FLEE_SPEED : ped.baseSpeed;
      const moveDir = new THREE.Vector3(Math.sin(ped.angle), 0, Math.cos(ped.angle));
      ped.position.addScaledVector(moveDir, speed * dt);

      // Stay on the pavement: hold the lane's fixed coordinate, and turn
      // around instead of walking off the end of the strip.
      if (ped.lane) {
        if (ped.lane.axis === 'x') {
          ped.position.z = ped.lane.fixed;
          if (ped.position.x > WALK_LIMIT || ped.position.x < -WALK_LIMIT) {
            ped.lane.dir *= -1;
            ped.angle = ped.lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            ped.position.x = Math.max(-WALK_LIMIT, Math.min(WALK_LIMIT, ped.position.x));
          }
        } else {
          ped.position.x = ped.lane.fixed;
          if (ped.position.z > WALK_LIMIT || ped.position.z < -WALK_LIMIT) {
            ped.lane.dir *= -1;
            ped.angle = ped.lane.dir > 0 ? 0 : Math.PI;
            ped.position.z = Math.max(-WALK_LIMIT, Math.min(WALK_LIMIT, ped.position.z));
          }
        }
      }

      ped.mesh.position.copy(ped.position);
      ped.mesh.rotation.y = ped.angle;
    }

    if (this.crew) {
      for (const member of this.crew) {
        member.angle += dt * CREW_IDLE_TURN; // slow idle turn
        member.mesh.rotation.y = member.angle;
      }
    }
  }
}
