// Screenshot staging helper for ?shot=start|street|rooftop|play|end
import * as THREE from './three.js';

export function stageShot(name, scene, camera, world, renderer) {
  if (name === 'start') {
    // Aerial overview shot of Solmar Bay
    camera.position.set(0, 150, 200);
    camera.lookAt(0, 0, 0);
  } else if (name === 'play') {
    // The signature shot: a third-person car chase down the palm-lined
    // coastal Malecón at sunset, police on Rico's tail and a heli overhead.
    const car = world.vehicles.getNearestCar(new THREE.Vector3(-218, 0, 0), 200);
    if (car) {
      car.position.set(-218, 0, -20);
      car.rotation = Math.PI;
      car.mesh.position.copy(car.position);
      car.mesh.rotation.y = car.rotation;
      car.speed = 18;
      world.vehicles.drivenCar = car;
      world.isDriving = true;
      world.playerGroup.visible = false;
      world.setPosition(-218, 0, -20);
    }
    world.wanted = 3;
    // Patrol cars in the chase: one closing in on the right beside Rico,
    // one forming a roadblock ahead on the left — both inside the camera's view.
    const chaseSpots = [
      { x: -210, z: -14, rot: Math.PI },
      { x: -221, z: -2, rot: 0 },
    ];
    for (const spot of chaseSpots) {
      const cop = world.police.createPoliceCarMesh();
      cop.position.set(spot.x, 0, spot.z);
      cop.rotation.y = spot.rot;
      scene.add(cop);
      world.police.policeCars.push({ mesh: cop, position: cop.position, rotation: spot.rot });
    }
    // The police helicopter hovering above and ahead of the chase.
    const heli = world.police.createHeliMesh();
    heli.position.set(-218, 15, -2);
    scene.add(heli);
    world.police.heli = heli;
    world.rotation = Math.PI;
    world.updateCamera(camera);
    // Drop the camera a touch lower and closer for the chase feel.
    camera.position.y = 3.2;
  } else if (name === 'street') {
    // Street level action shot
    world.setPosition(15, 0, 25);
    world.rotation = 0.5;
    world.updateCamera(camera);
  } else if (name === 'rooftop') {
    // Rooftop view shot
    world.setPosition(0, 50, 0);
    world.rotation = 0;
    world.updateCamera(camera);
  } else if (name === 'end') {
    // Wide street view shot from a different angle
    world.setPosition(-30, 0, 60);
    world.rotation = 2.2;
    world.updateCamera(camera);
  } else {
    camera.position.set(0, 100, 150);
    camera.lookAt(0, 0, 0);
  }

  // Render a few frames and flag ready
  let frames = 0;
  function renderShot() {
    renderer.render(scene, camera);
    frames++;
    if (frames < 3) {
      requestAnimationFrame(renderShot);
    } else {
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(renderShot);
}
