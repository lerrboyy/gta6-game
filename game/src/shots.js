// shots.js — screenshot scenario runner for Solmar Bay.
//
// When the page loads with a query string like `?shot=play&seed=7`, the
// game loop calls stageShot(state) once at boot. This module stages one of
// four scenes by setting up the shared state — world values, player pose,
// police units, camera mode — and returns which shot was staged (or null
// when no shot was requested). It never captures an image itself: a
// headless browser driver loads the page and screenshots the canvas.
//
// The four shot names:
//   start   — the title screen
//   play    — third-person chase behind the car on the Malecón at sunset,
//             police in pursuit, dispatch panel, round minimap, $18,450,
//             3 wanted stars, SOLMAR FM 98.6, DAY 1 09:31, 61 MPH
//   end     — Rico on foot, close third-person shot
//   rooftop — a high view over the city from a rooftop
//
// Shared-state shape this module assumes (created by the loop module):
//   state.mode         'title' | 'playing' | 'paused' | ...
//   state.cameraMode   'title' | 'chase' | 'close' | 'rooftop'
//   state.world        { day, hour, minute, money, respect, armour,
//                        health, wanted, radioStation }
//   state.player       { position: {x, z}, heading, driving, vehicle,
//                        speed (m/s), weaponSlots, activeWeaponSlot }
//   state.police       { units: [{ id, distance, tactic }] }
//   state.mission      { title, objective, markerDistance }
//   state.audio        the audio engine (optional), for the radio station
//
// The police units are staged through the police module's staging
// function; the unit list is also written into state.police.units so the
// dispatch panel can render even if the police module has not spawned
// the 3D units yet.
//
// NOTE: the staging call is a dynamic import on purpose. The police
// module's staging function is expected to be named stagePoliceUnits and
// take (state, units); if a fresh rewrite of police.js names it
// differently, the dynamic import fails silently and the scene still
// stages from state.police.units — a static import would instead break
// the whole module load. Integration should confirm the name and may
// switch this to a static import once it is verified.

export const SHOT_NAMES = ['start', 'play', 'end', 'rooftop'];

// 61 MPH in metres per second — the speed the HUD shows for the play shot.
const PLAY_SPEED_MS = 61 / 2.23694;

// Where the Malecón chase happens: on the waterfront boulevard the city
// module builds (centreline x=-178, running north-south), heading south
// down the palm row with the sea on the right.
const MALECON_SPOT = { x: -178, z: 0 };
const MALECON_HEADING = 0; // driving south along the boulevard

// A promenade spot just off the boulevard for the on-foot shot.
const SIDEWALK_SPOT = { x: -164, z: 10 };
const SIDEWALK_HEADING = Math.PI; // facing back north up the Malecón

// A street intersection with open sky above it, for the high city view.
const ROOFTOP_SPOT = { x: 38, z: 38 };

// Five weapon slots, the same set the HUD draws at the bottom left.
const DEFAULT_WEAPON_SLOTS = [
  { name: 'Fists' },
  { name: 'Pistol' },
  { name: 'SMG' },
  { name: 'Shotgun' },
  { name: 'Rifle' },
];

// The police units visible in the play shot: id, distance in metres,
// current tactic — exactly what the dispatch panel lists.
const PLAY_POLICE_UNITS = [
  { id: 'PIER 5', distance: 10, tactic: 'RAMMING' },
  { id: 'TIDE 6', distance: 18, tactic: 'PURSUIT' },
  { id: 'AIR ONE', distance: 55, tactic: 'SPOTLIGHT' },
];

function ensureWorld(state) {
  if (!state.world) state.world = {};
  return state.world;
}

function ensurePlayer(state) {
  if (!state.player) state.player = {};
  if (!state.player.position) state.player.position = { x: 0, z: 0 };
  return state.player;
}

function ensurePolice(state) {
  if (!state.police) state.police = {};
  if (!Array.isArray(state.police.units)) state.police.units = [];
  return state.police;
}

function setClock(world, day, hour, minute) {
  world.day = day;
  world.hour = hour;
  world.minute = minute;
}

function setRadio(state, stationName) {
  const world = ensureWorld(state);
  world.radioStation = stationName;
  // If the audio engine is already up, switch it to the matching
  // station so the HUD name and the sound agree.
  if (state.audio && typeof state.audio.setStation === 'function') {
    if (stationName.startsWith('SOLMAR')) {
      state.audio.setStation(0);
    } else if (typeof state.audio.nextStation === 'function') {
      state.audio.setStation(1);
    }
  }
}

function stageTitle(state) {
  const world = ensureWorld(state);
  const player = ensurePlayer(state);
  state.mode = 'title';
  state.cameraMode = 'title';
  setClock(world, 1, 9, 0);
  world.money = 0;
  world.respect = 0;
  world.armour = 0;
  world.health = 100;
  world.wanted = 0;
  player.driving = false;
  player.speed = 0;
  player.position.x = MALECON_SPOT.x;
  player.position.z = MALECON_SPOT.z;
  player.heading = MALECON_HEADING;
}

function stagePlay(state) {
  const world = ensureWorld(state);
  const player = ensurePlayer(state);
  const police = ensurePolice(state);

  state.mode = 'playing';
  state.cameraMode = 'chase';

  // The exact world values the play screenshot must show.
  setClock(world, 1, 9, 31);
  world.money = 18450;
  world.respect = 65;
  world.armour = 100;
  world.health = 100;
  world.wanted = 3;

  // Rico driving a car down the Malecón at 61 MPH. The loop / vehicles
  // module owns the car itself: if no vehicle is attached yet it should
  // spawn one at the player's position when it sees driving === true.
  player.driving = true;
  player.speed = PLAY_SPEED_MS;
  player.position.x = MALECON_SPOT.x;
  player.position.z = MALECON_SPOT.z;
  player.heading = MALECON_HEADING;
  player.weaponSlots = DEFAULT_WEAPON_SLOTS.map((slot) => ({ ...slot }));
  player.activeWeaponSlot = 1;

  // A job is mid-flight so the top-left objective line has something to
  // show: outrun the heat and reach the drop-off.
  state.mission = {
    title: 'Heat on the Malecón',
    objective: 'Lose the cops and reach the drop-off',
    markerDistance: 420,
  };

  setRadio(state, 'SOLMAR FM 98.6');

  // Stage the three police units through the police module so their 3D
  // cars and the heli appear in the scene, and record the same list on
  // the shared state for the dispatch panel.
  police.units = PLAY_POLICE_UNITS.map((unit) => ({ ...unit }));
  import('./police.js')
    .then((policeModule) => {
      if (typeof policeModule.stagePoliceUnits === 'function') {
        policeModule.stagePoliceUnits(state, PLAY_POLICE_UNITS);
      }
    })
    .catch(() => {
      // No staging function available; the state list above still drives
      // the dispatch panel and the loop can spawn from it.
    });
}

function stageOnFoot(state) {
  const world = ensureWorld(state);
  const player = ensurePlayer(state);
  ensurePolice(state);

  state.mode = 'playing';
  state.cameraMode = 'close';
  setClock(world, 1, 9, 31);
  world.money = 18450;
  world.respect = 65;
  world.armour = 100;
  world.health = 100;
  world.wanted = 0;

  player.driving = false;
  player.vehicle = null;
  player.speed = 0;
  player.position.x = SIDEWALK_SPOT.x;
  player.position.z = SIDEWALK_SPOT.z;
  player.heading = SIDEWALK_HEADING;
  player.weaponSlots = DEFAULT_WEAPON_SLOTS.map((slot) => ({ ...slot }));
  player.activeWeaponSlot = 1;

  state.mission = {
    title: 'Heat on the Malecón',
    objective: 'Find a car',
    markerDistance: 120,
  };
  setRadio(state, 'SOLMAR FM 98.6');
}

function stageRooftop(state) {
  const world = ensureWorld(state);
  const player = ensurePlayer(state);
  ensurePolice(state);

  state.mode = 'playing';
  state.cameraMode = 'rooftop';
  setClock(world, 1, 17, 45);
  world.money = 18450;
  world.respect = 65;
  world.armour = 100;
  world.health = 100;
  world.wanted = 0;

  // Rico stands on a rooftop above the city; the renderer pulls the
  // camera up and back from here for the wide sunset view.
  player.driving = false;
  player.vehicle = null;
  player.speed = 0;
  player.onRooftop = true;
  player.position.x = ROOFTOP_SPOT.x;
  player.position.z = ROOFTOP_SPOT.z;
  player.heading = Math.PI * 0.75;
  player.weaponSlots = DEFAULT_WEAPON_SLOTS.map((slot) => ({ ...slot }));
  player.activeWeaponSlot = 1;

  state.mission = null;
  setRadio(state, 'SOLMAR FM 98.6');
}

const STAGERS = {
  start: stageTitle,
  play: stagePlay,
  end: stageOnFoot,
  rooftop: stageRooftop,
};

// Read the shot name (and optional seed) out of the page query string.
export function getShotNameFromQuery(queryString) {
  const search =
    typeof queryString === 'string'
      ? queryString
      : window.location.search;
  const params = new URLSearchParams(search);
  const shot = (params.get('shot') || '').trim().toLowerCase();
  return SHOT_NAMES.includes(shot) ? shot : null;
}

// The one function the loop calls at boot with the shared state.
// Returns the shot name that was staged, or null when the page was
// loaded without a ?shot= parameter (normal play).
export function stageShot(state) {
  const params = new URLSearchParams(window.location.search);
  const shot = getShotNameFromQuery(window.location.search);
  if (!shot) {
    return null;
  }
  // The seed is recorded for the driver / renderer; the city itself is
  // built from the fixed seed in the config before this runs, so a shot
  // seed never rebuilds the world mid-load.
  const seed = params.get('seed');
  if (seed !== null && seed !== '') {
    const parsed = Number.parseInt(seed, 10);
    state.shotSeed = Number.isNaN(parsed) ? seed : parsed;
  }
  STAGERS[shot](state);
  return shot;
}
