// Screenshot staging helper for ?shot=start|street|rooftop|play|end

export function stageShot(name, scene, camera, world, renderer) {
  if (name === 'start') {
    // Aerial overview shot of Solmar Bay
    camera.position.set(0, 150, 200);
    camera.lookAt(0, 0, 0);
  } else if (name === 'street' || name === 'play') {
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
