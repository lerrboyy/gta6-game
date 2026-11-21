// Screenshot staging for ?shot=start|street|rooftop|play|end.
// Each shot arranges the player, the camera and (for the chase) the police,
// renders a few frames so the scene settles, then raises
// window.__shotReady so the screenshot harness knows the frame is final.
import * as THREE from './three.js';

// How many frames to render before the shot counts as ready.
const SETTLE_FRAMES = 3;

// The Malecón chase staging: where the hero car starts, and the two
// patrol cars that frame it — one closing in on the right, one blocking
// ahead on the left.
const CHASE_CAR_SPOT = { x: -218, z: -20 };
const CHASE_COPS = [
  { x: -210, z: -14, rot: Math.PI },
  { x: -221, z: -2, rot: 0 },
];
const HELI_SPOT = { x: -218, y: 15, z: -2 };
const CHASE_SPEED = 18;
const CHASE_CAMERA_HEIGHT = 3.2;

function renderUntilReady(scene, camera, renderer) {
  let frames = 0;
  function renderShot() {
    renderer.render(scene, camera);
    frames++;
    if (frames < SETTLE_FRAMES) {
      requestAnimationFrame(renderShot);
    } else {
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(renderShot);
}

export function stageShot(name, scene, camera, world, renderer) {
  if (name === 'start') {
    // Aerial overview of the whole of Solmar Bay.
    camera.position.set(0, 150, 200);
    camera.lookAt(0, 0, 0);
  } else if (name === 'play') {
    // The signature shot: a third-person car chase down the palm-lined
    // coastal Malecón at sunset, police on Rico's tail and a heli overhead.
    const car = world.vehicles.getNearestCar(new THREE.Vector3(-218, 0, 0), 200);
    if (car) {
      car.position.set(CHASE_CAR_SPOT.x, 0, CHASE_CAR_SPOT.z);
      car.rotation = Math.PI;
      car.mesh.position.copy(car.position);
      car.mesh.rotation.y = car.rotation;
      car.speed = CHASE_SPEED;
      world.vehicles.drivenCar = car;
      world.isDriving = true;
      world.playerGroup.visible = false;
      world.setPosition(CHASE_CAR_SPOT.x, 0, CHASE_CAR_SPOT.z);
    }
    world.wanted = 3;
    // Patrol cars in the chase: one closing in on the right beside Rico,
    // one forming a roadblock ahead on the left — both inside the camera's view.
    for (const spot of CHASE_COPS) {
      const cop = world.police.createPoliceCarMesh();
      cop.position.set(spot.x, 0, spot.z);
      cop.rotation.y = spot.rot;
      scene.add(cop);
      world.police.policeCars.push({ mesh: cop, position: cop.position, rotation: spot.rot });
    }
    // The police helicopter hovering above and ahead of the chase.
    const heli = world.police.createHeliMesh();
    heli.position.set(HELI_SPOT.x, HELI_SPOT.y, HELI_SPOT.z);
    scene.add(heli);
    world.police.heli = heli;
    world.rotation = Math.PI;
    world.updateCamera(camera);
    // Drop the camera a touch lower and closer for the chase feel.
    camera.position.y = CHASE_CAMERA_HEIGHT;
  } else if (name === 'street') {
    // Street level action shot.
    world.setPosition(15, 0, 25);
    world.rotation = 0.5;
    world.updateCamera(camera);
  } else if (name === 'rooftop') {
    // Rooftop view shot.
    world.setPosition(0, 50, 0);
    world.rotation = 0;
    world.updateCamera(camera);
  } else if (name === 'end') {
    // Wide street view shot from a different angle.
    world.setPosition(-30, 0, 60);
    world.rotation = 2.2;
    world.updateCamera(camera);
  } else {
    camera.position.set(0, 100, 150);
    camera.lookAt(0, 0, 0);
  }

  renderUntilReady(scene, camera, renderer);
}
