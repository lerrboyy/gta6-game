// Solmar Bay — renderer module.
//
// Builds the Three.js scene for the sunset city: a gradient sky dome, a low
// warm sun, drifting clouds, a shimmering ocean, and the third-person chase
// camera that trails behind Rico (or his car) with smoothing. Everything in
// here uses the global THREE object; this module imports no library itself.

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x4a2c55, 140, 520);

  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    1200
  );
  camera.position.set(0, 9, -16);

  // ---- Sunset sky: a big dome whose shader blends orange at the horizon
  // ---- up through pink into deep purple, with a glow around the sun.
  const skyUniforms = {
    topColour: { value: new THREE.Color(0x3d2560) },
    midColour: { value: new THREE.Color(0xb84a72) },
    lowColour: { value: new THREE.Color(0xff8a3d) },
    sunGlow: { value: new THREE.Color(0xffd28a) },
    sunDir: { value: new THREE.Vector3(-0.62, 0.22, -0.45).normalize() },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  vDir = normalize(position);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform vec3 topColour;',
      'uniform vec3 midColour;',
      'uniform vec3 lowColour;',
      'uniform vec3 sunGlow;',
      'uniform vec3 sunDir;',
      'void main() {',
      '  float h = clamp(vDir.y, 0.0, 1.0);',
      '  vec3 col = mix(lowColour, midColour, smoothstep(0.0, 0.30, h));',
      '  col = mix(col, topColour, smoothstep(0.24, 0.80, h));',
      '  float g = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 16.0);',
      '  col += sunGlow * g * 0.85;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(560, 28, 18), skyMaterial);
  scene.add(sky);

  // ---- Visible sun disc hanging low over the water.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(16, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false })
  );
  sunDisc.position.copy(skyUniforms.sunDir.value).multiplyScalar(520);
  sunDisc.lookAt(camera.position);
  scene.add(sunDisc);

  // ---- Lights: one warm directional sun with shadows, a soft purple
  // ---- ambient fill, and a hemisphere wash so the shadow side is not dead.
  const sun = new THREE.DirectionalLight(0xffb36b, 1.7);
  sun.position.set(-140, 70, -90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0x9a6fc0, 0.55);
  scene.add(ambient);

  const hemisphere = new THREE.HemisphereLight(0x7a5aa8, 0x2e1f22, 0.5);
  scene.add(hemisphere);

  // ---- A handful of flat, stylised clouds that drift slowly overhead.
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd9c4,
    transparent: true,
    opacity: 0.5,
    fog: false,
  });
  const clouds = [];
  const cloudSpots = [
    [-180, 96, -260, 46, 7, 18],
    [40, 110, -300, 60, 8, 22],
    [200, 88, -180, 38, 6, 15],
    [-260, 104, 60, 52, 7, 20],
    [120, 118, 160, 66, 9, 24],
    [-60, 92, 260, 44, 6, 17],
    [280, 100, 40, 48, 7, 19],
  ];
  for (const [x, y, z, w, h, d] of cloudSpots) {
    const puff = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cloudMaterial);
    puff.add(base);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.55, h * 0.9, d * 0.8),
      cloudMaterial
    );
    cap.position.set(w * 0.18, h * 0.5, 0);
    puff.add(cap);
    puff.position.set(x, y, z);
    puff.userData.drift = 1.2 + Math.random() * 1.1;
    scene.add(puff);
    clouds.push(puff);
  }

  // ---- Ocean: a wide plane west of the shoreline (x = -232, where the
  // ---- sand ends), so it meets the beach instead of covering it. Its
  // ---- specular highlight gives a gentle shimmer as the sun catches it.
  const oceanMaterial = new THREE.MeshPhongMaterial({
    color: 0x14425e,
    specular: 0xff9a5c,
    shininess: 140,
    transparent: true,
    opacity: 0.96,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(640, 1100), oceanMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-552, -0.6, 0);
  ocean.receiveShadow = false;
  scene.add(ocean);

  // ---- Chase camera state. The camera eases toward its target instead of
  // ---- snapping, and the look point is smoothed separately so turns feel
  // ---- steady rather than whippy.
  const smoothedPos = new THREE.Vector3(0, 9, -16);
  const smoothedLook = new THREE.Vector3(0, 1.5, 0);
  let elapsed = 0;

  function readTarget(target) {
    const p = target.position || target;
    return {
      x: p.x || 0,
      y: p.y || 0,
      z: p.z || 0,
      heading: target.heading || 0,
    };
  }

  function chaseGoal(target, mode) {
    const t = readTarget(target);
    const distance = mode === 'drive' ? 11.0 : 6.8;
    const height = mode === 'drive' ? 4.4 : 3.1;
    const fx = Math.sin(t.heading);
    const fz = Math.cos(t.heading);
    return {
      pos: new THREE.Vector3(
        t.x - fx * distance,
        t.y + height,
        t.z - fz * distance
      ),
      look: new THREE.Vector3(t.x + fx * 6, t.y + 1.5, t.z + fz * 6),
    };
  }

  function updateChaseCamera(target, dt, mode) {
    const goal = chaseGoal(target, mode || 'foot');
    const posBlend = 1 - Math.exp(-dt * 4.2);
    const lookBlend = 1 - Math.exp(-dt * 7.0);
    smoothedPos.lerp(goal.pos, posBlend);
    if (smoothedPos.y < 1.4) smoothedPos.y = 1.4;
    smoothedLook.lerp(goal.look, lookBlend);
    camera.position.copy(smoothedPos);
    camera.lookAt(smoothedLook);
  }

  function snapChaseCamera(target, mode) {
    const goal = chaseGoal(target, mode || 'foot');
    smoothedPos.copy(goal.pos);
    smoothedLook.copy(goal.look);
    camera.position.copy(smoothedPos);
    camera.lookAt(smoothedLook);
  }

  // ---- Lighting from the clock. The sun rides an arc from dawn (06:00)
  // ---- to dusk (19:00); low sun means long warm light, a pinker sky and
  // ---- thicker haze, which is the golden-hour look the game is built on.
  const warmLow = new THREE.Color(0xff7a33);
  const warmHigh = new THREE.Color(0xffe2b8);
  const hazeLow = new THREE.Color(0x6b3a52);
  const hazeHigh = new THREE.Color(0x4a5a8a);
  const ambLow = new THREE.Color(0x8a5a9a);
  const ambHigh = new THREE.Color(0xbfa8d8);

  function setTimeOfDay(hour) {
    const dayT = THREE.MathUtils.clamp((hour - 6) / 13, 0, 1);
    const elevation = Math.sin(dayT * Math.PI);
    const azimuth = -0.85;
    const elAngle = elevation * 1.05;
    const dir = new THREE.Vector3(
      Math.cos(azimuth) * Math.cos(elAngle),
      Math.sin(elAngle),
      Math.sin(azimuth) * Math.cos(elAngle)
    );
    skyUniforms.sunDir.value.copy(dir);
    sun.position.copy(dir).multiplyScalar(190);
    sun.color.copy(warmLow).lerp(warmHigh, elevation);
    sun.intensity = 0.65 + elevation * 1.25;
    ambient.color.copy(ambLow).lerp(ambHigh, elevation);
    ambient.intensity = 0.34 + elevation * 0.28;
    hemisphere.intensity = 0.3 + elevation * 0.35;
    scene.fog.color.copy(hazeLow).lerp(hazeHigh, elevation);
    sunDisc.position.copy(dir).multiplyScalar(520);
    sunDisc.lookAt(camera.position);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function render(dt) {
    elapsed += dt || 0;
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.drift * (dt || 0);
      if (cloud.position.x > 420) cloud.position.x = -420;
    }
    ocean.position.y = -0.6 + Math.sin(elapsed * 0.55) * 0.06;
    oceanMaterial.color.offsetHSL(0, 0, Math.sin(elapsed * 0.4) * 0.006);
    renderer.render(scene, camera);
  }

  setTimeOfDay(17.5);

  return {
    scene,
    camera,
    updateChaseCamera,
    snapChaseCamera,
    render,
    resize,
    setTimeOfDay,
  };
}
