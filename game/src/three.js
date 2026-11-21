// A thin doorway into the vendored Three.js build.
//
// The library itself is loaded from game/vendor/three.min.js, which puts
// the whole API on the global THREE object. This module pulls the pieces
// the rest of the game uses off that object and hands them on as named
// exports, so the other modules can import from here instead of touching
// the global directly. Nothing is wrapped or renamed — each name below is
// exactly the Three.js class or constant of the same name.

import '../vendor/three.min.js';

// Grab the global the vendor script created, whichever global scope it
// ended up on in this browser.
const T = window.THREE || self.THREE;

// Core scene pieces, maths helpers and the render loop clock.
const {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Vector3,
  Vector2,
  Matrix4,
  Quaternion,
  Euler,
  Color,
  Box3,
  Sphere,
  Raycaster,
  Clock,
} = T;

// Meshes, groups and the geometry / attribute types they are built from.
const {
  Mesh,
  Group,
  Object3D,
  BufferGeometry,
  BufferAttribute,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  Int32BufferAttribute,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  CylinderGeometry,
  ConeGeometry,
  TorusGeometry,
  CircleGeometry,
  RingGeometry,
} = T;

// Materials, from flat colours through lit surfaces to custom shaders.
const {
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  PointsMaterial,
  LineBasicMaterial,
  ShaderMaterial,
  RawShaderMaterial,
} = T;

// Lights, loaders, audio, fog and animation pieces.
const {
  DirectionalLight,
  PointLight,
  SpotLight,
  AmbientLight,
  HemisphereLight,
  TextureLoader,
  ImageLoader,
  AudioListener,
  Audio,
  AudioLoader,
  Fog,
  FogExp2,
  AnimationMixer,
  KeyframeTrack,
  VectorKeyframeTrack,
  QuaternionKeyframeTrack,
} = T;

// Textures, instancing and the remaining render constants.
const {
  CanvasTexture,
  InstancedMesh,
  DynamicDrawUsage,
  BackSide,
} = T;

export {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Vector3,
  Vector2,
  Matrix4,
  Quaternion,
  Euler,
  Color,
  Box3,
  Sphere,
  Raycaster,
  Clock,
  Mesh,
  Group,
  Object3D,
  BufferGeometry,
  BufferAttribute,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  Int32BufferAttribute,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  CylinderGeometry,
  ConeGeometry,
  TorusGeometry,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  PointsMaterial,
  LineBasicMaterial,
  ShaderMaterial,
  RawShaderMaterial,
  DirectionalLight,
  PointLight,
  SpotLight,
  AmbientLight,
  HemisphereLight,
  TextureLoader,
  ImageLoader,
  AudioListener,
  Audio,
  AudioLoader,
  Fog,
  FogExp2,
  AnimationMixer,
  KeyframeTrack,
  VectorKeyframeTrack,
  QuaternionKeyframeTrack,
  CircleGeometry,
  RingGeometry,
  CanvasTexture,
  InstancedMesh,
  DynamicDrawUsage,
  BackSide,
};
