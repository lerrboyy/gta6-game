// world.js — Solmar Bay world state.
//
// The world object is the single source of truth for everything the HUD
// reads: the day and clock, money, respect, armour, health and the wanted
// level. The loop creates it once, hands it to the other modules, and the
// mission module pays out through it while the police module reads the
// wanted level from it.
//
// All behaviour here is plain functions that take the world first, so the
// state stays a simple object that can be snapshotted to JSON for saving
// and restored later without any class machinery.

const START_DAY = 1;
const START_HOUR = 9;
const START_MINUTE = 31;
const START_MONEY = 0;
const START_RESPECT = 0;
const START_ARMOUR = 0;
const START_HEALTH = 100;
const MAX_WANTED = 5;
const MAX_RESPECT = 100;
const MAX_ARMOUR = 100;
const MAX_HEALTH = 100;

// One real second moves the clock this many game minutes. The city lives in
// a long golden hour, so the clock drifts slowly through the sunset.
const MINUTES_PER_SECOND = 1;

const SAVE_VERSION = 1;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function createWorld(initial) {
  const seed = initial || {};
  const world = {
    day: seed.day !== undefined ? seed.day : START_DAY,
    hour: seed.hour !== undefined ? seed.hour : START_HOUR,
    minute: seed.minute !== undefined ? seed.minute : START_MINUTE,
    money: seed.money !== undefined ? seed.money : START_MONEY,
    respect: seed.respect !== undefined ? seed.respect : START_RESPECT,
    armour: seed.armour !== undefined ? seed.armour : START_ARMOUR,
    health: seed.health !== undefined ? seed.health : START_HEALTH,
    wanted: seed.wanted !== undefined ? seed.wanted : 0,
    // Total game minutes elapsed since the start of day 1; handy for the
    // save file and for anything that needs "how long has Rico been out".
    totalMinutes:
      seed.totalMinutes !== undefined
        ? seed.totalMinutes
        : (START_DAY - 1) * 1440 + START_HOUR * 60 + START_MINUTE,
    jobsCompleted: seed.jobsCompleted !== undefined ? seed.jobsCompleted : 0,
    bustedCount: seed.bustedCount !== undefined ? seed.bustedCount : 0,
    wastedCount: seed.wastedCount !== undefined ? seed.wastedCount : 0,
  };
  normaliseClock(world);
  return world;
}

// Keep hour/minute/day consistent after any direct edit of the fields.
function normaliseClock(world) {
  let extraDays = 0;
  while (world.minute >= 60) {
    world.minute -= 60;
    world.hour += 1;
  }
  while (world.minute < 0) {
    world.minute += 60;
    world.hour -= 1;
  }
  while (world.hour >= 24) {
    world.hour -= 24;
    extraDays += 1;
  }
  while (world.hour < 0) {
    world.hour += 24;
    extraDays -= 1;
  }
  world.day = Math.max(1, world.day + extraDays);
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export function advanceClock(world, dtSeconds) {
  if (!world || !dtSeconds) return world;
  const minutes = dtSeconds * MINUTES_PER_SECOND;
  world.totalMinutes += minutes;
  const whole = Math.floor(minutes);
  // Carry fractional minutes so slow frame rates do not lose time.
  advanceClock.carry = (advanceClock.carry || 0) + (minutes - whole);
  let add = whole;
  if (advanceClock.carry >= 1) {
    add += Math.floor(advanceClock.carry);
    advanceClock.carry -= Math.floor(advanceClock.carry);
  }
  world.minute += add;
  normaliseClock(world);
  return world;
}

export function setClock(world, hour, minute, day) {
  world.hour = clamp(Math.floor(hour), 0, 23);
  world.minute = clamp(Math.floor(minute), 0, 59);
  if (day !== undefined) world.day = Math.max(1, Math.floor(day));
  world.totalMinutes = (world.day - 1) * 1440 + world.hour * 60 + world.minute;
  return world;
}

export function clockText(world) {
  return `DAY ${world.day} ${pad2(world.hour)}:${pad2(world.minute)}`;
}

export function timeOfDay(world) {
  const hour = world.hour + world.minute / 60;
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'sunset';
  if (hour >= 20 && hour < 23) return 'dusk';
  return 'night';
}

// ---------------------------------------------------------------------------
// Money and respect
// ---------------------------------------------------------------------------

export function addMoney(world, amount) {
  world.money += amount;
  return world.money;
}

export function spendMoney(world, amount) {
  if (world.money < amount) return false;
  world.money -= amount;
  return true;
}

export function addRespect(world, amount) {
  world.respect = clamp(world.respect + amount, 0, MAX_RESPECT);
  return world.respect;
}

export function moneyText(world) {
  return `$${Math.floor(world.money).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// Wanted level
// ---------------------------------------------------------------------------

export function setWanted(world, level) {
  world.wanted = clamp(Math.floor(level), 0, MAX_WANTED);
  return world.wanted;
}

export function raiseWanted(world, amount) {
  world.wanted = clamp(world.wanted + (amount || 1), 0, MAX_WANTED);
  return world.wanted;
}

export function lowerWanted(world, amount) {
  world.wanted = clamp(world.wanted - (amount || 1), 0, MAX_WANTED);
  return world.wanted;
}

export function clearWanted(world) {
  world.wanted = 0;
  return world;
}

// ---------------------------------------------------------------------------
// Health and armour
// ---------------------------------------------------------------------------

export function damagePlayer(world, amount) {
  let remaining = amount;
  // Armour soaks damage first; whatever is left hits health.
  if (world.armour > 0) {
    const absorbed = Math.min(world.armour, remaining);
    world.armour -= absorbed;
    remaining -= absorbed;
  }
  world.health = clamp(world.health - remaining, 0, MAX_HEALTH);
  return world.health;
}

export function healPlayer(world, amount) {
  world.health = clamp(world.health + amount, 0, MAX_HEALTH);
  return world.health;
}

export function addArmour(world, amount) {
  world.armour = clamp(world.armour + amount, 0, MAX_ARMOUR);
  return world.armour;
}

export function isWasted(world) {
  return world.health <= 0;
}

export function isBusted(world) {
  // Busted is decided by the police module; the world only records it.
  return false;
}

export function recordBusted(world) {
  world.bustedCount += 1;
  clearWanted(world);
  return world.bustedCount;
}

export function recordWasted(world) {
  world.wastedCount += 1;
  world.health = MAX_HEALTH;
  clearWanted(world);
  return world.wastedCount;
}

export function completeJob(world, payout, respectGain) {
  if (payout) addMoney(world, payout);
  if (respectGain) addRespect(world, respectGain);
  world.jobsCompleted += 1;
  return world.jobsCompleted;
}

// ---------------------------------------------------------------------------
// Sunset lighting
// ---------------------------------------------------------------------------
//
// The sun hangs low through the golden hour and the light turns warm and
// orange as it drops. The renderer reads these values each frame and tints
// the sky dome, the directional sun light and the ambient light with them.

export function sunsetLighting(world) {
  const hour = world.hour + world.minute / 60;
  // Sun elevation as a 0..1 curve: high at noon, touching the horizon at
  // 19:30, gone by 20:30. Midday is 1, sunset is 0.
  let elevation;
  if (hour <= 12) elevation = 0.55 + 0.45 * (hour / 12);
  else if (hour <= 19.5) elevation = 1 - ((hour - 12) / 7.5) * 0.95;
  else elevation = 0.05;
  elevation = clamp(elevation, 0, 1);

  // Warmth is strongest when the sun is low: 0 at noon, 1 at the horizon.
  const warmth = clamp(1 - elevation, 0, 1);
  const phase = timeOfDay(world);

  // A warm amber that deepens to burnt orange as the sun drops.
  const sunColour =
    warmth < 0.35 ? '#ffd9a0' : warmth < 0.7 ? '#ffb36b' : '#ff8a3d';
  const skyHorizon =
    warmth < 0.35 ? '#f7c873' : warmth < 0.7 ? '#ff9e57' : '#ff6b35';
  const skyTop =
    phase === 'night' ? '#1c1440' : warmth < 0.5 ? '#7d5aa8' : '#b44a7a';

  return {
    sunElevation: elevation,
    warmth,
    phase,
    sunColour,
    skyHorizon,
    skyTop,
    // Directional light strength fades as the sun sets; ambient picks up
    // the purple of the upper sky so shadows never go black.
    sunIntensity: 0.55 + 0.85 * elevation,
    ambientIntensity: 0.55 + 0.25 * (1 - elevation),
    // Sun azimuth swings from east in the morning to west at sunset.
    sunAzimuth: ((hour - 6) / 12) * Math.PI,
  };
}

// ---------------------------------------------------------------------------
// Save / restore
// ---------------------------------------------------------------------------

export function snapshot(world) {
  return {
    version: SAVE_VERSION,
    day: world.day,
    hour: world.hour,
    minute: world.minute,
    money: world.money,
    respect: world.respect,
    armour: world.armour,
    health: world.health,
    wanted: world.wanted,
    totalMinutes: world.totalMinutes,
    jobsCompleted: world.jobsCompleted,
    bustedCount: world.bustedCount,
    wastedCount: world.wastedCount,
  };
}

export function restoreWorld(data) {
  if (!data || typeof data !== 'object') return createWorld();
  return createWorld({
    day: data.day,
    hour: data.hour,
    minute: data.minute,
    money: data.money,
    respect: data.respect,
    armour: data.armour,
    health: data.health,
    wanted: data.wanted,
    totalMinutes: data.totalMinutes,
    jobsCompleted: data.jobsCompleted,
    bustedCount: data.bustedCount,
    wastedCount: data.wastedCount,
  });
}

export function applySnapshot(world, data) {
  if (!world || !data || typeof data !== 'object') return world;
  const restored = restoreWorld(data);
  Object.keys(restored).forEach((key) => {
    world[key] = restored[key];
  });
  return world;
}

export function serialize(world) {
  return JSON.stringify(snapshot(world));
}

export function deserialize(text) {
  try {
    return restoreWorld(JSON.parse(text));
  } catch (error) {
    return createWorld();
  }
}
