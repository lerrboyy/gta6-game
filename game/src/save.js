// Save and load for Solmar Bay, backed by localStorage.
//
// This module knows nothing about the game itself: it works with a plain
// snapshot object that the world module produces and restores from, so
// there is no circular import between the save layer and the world layer.
// The loop module is the go-between — it hands a snapshot in when saving
// and applies the loaded snapshot when continuing.
//
// A snapshot carries: money, respect, day, clock (hour and minute),
// owned car upgrades, and the list of completed jobs. Anything missing
// from a snapshot is filled with a sensible default on load, so an older
// or partial save never crashes the game. Storage failures (private
// browsing, a full quota, a blocked origin) are swallowed silently:
// saving simply does nothing and loading reports no save.

const SAVE_KEY = 'solmar-bay-save-v1';

// The shape of a fresh save, used both as the default for missing fields
// and as the starting point for a brand-new game.
function defaultSnapshot() {
  return {
    money: 0,
    respect: 0,
    day: 1,
    clockHour: 9,
    clockMinute: 0,
    upgrades: {
      engine: false,
      armour: false,
      nitro: false,
      respray: null,
    },
    completedJobs: [],
  };
}

// Merge a raw loaded object over the defaults, field by field, so a save
// that is missing a key (or was written by an older build) still loads
// cleanly. Types are checked loosely: a wrong-typed value falls back to
// its default rather than being trusted.
function normaliseSnapshot(raw) {
  const fresh = defaultSnapshot();
  if (!raw || typeof raw !== 'object') return fresh;

  if (typeof raw.money === 'number' && Number.isFinite(raw.money)) {
    fresh.money = Math.max(0, Math.floor(raw.money));
  }
  if (typeof raw.respect === 'number' && Number.isFinite(raw.respect)) {
    fresh.respect = Math.max(0, Math.floor(raw.respect));
  }
  if (typeof raw.day === 'number' && Number.isFinite(raw.day)) {
    fresh.day = Math.max(1, Math.floor(raw.day));
  }
  if (typeof raw.clockHour === 'number' && Number.isFinite(raw.clockHour)) {
    fresh.clockHour = Math.min(23, Math.max(0, Math.floor(raw.clockHour)));
  }
  if (typeof raw.clockMinute === 'number' && Number.isFinite(raw.clockMinute)) {
    fresh.clockMinute = Math.min(59, Math.max(0, Math.floor(raw.clockMinute)));
  }
  if (raw.upgrades && typeof raw.upgrades === 'object') {
    fresh.upgrades.engine = raw.upgrades.engine === true;
    fresh.upgrades.armour = raw.upgrades.armour === true;
    fresh.upgrades.nitro = raw.upgrades.nitro === true;
    fresh.upgrades.respray =
      typeof raw.upgrades.respray === 'string' ? raw.upgrades.respray : null;
  }
  if (Array.isArray(raw.completedJobs)) {
    fresh.completedJobs = raw.completedJobs.filter((job) => typeof job === 'string');
  }
  return fresh;
}

// Persist a snapshot. Returns true when the save landed, false when
// storage was unavailable. Only the known fields are written, so extra
// properties on the caller's object never leak into the save.
export function saveProgress(snapshot) {
  const clean = normaliseSnapshot(snapshot);
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(clean));
    return true;
  } catch (error) {
    return false;
  }
}

// Load the saved snapshot, or null when there is no save or it cannot be
// read. A corrupt entry is treated as no save at all (and removed, so it
// does not keep failing on every load).
export function loadProgress() {
  let rawText = null;
  try {
    rawText = window.localStorage.getItem(SAVE_KEY);
  } catch (error) {
    return null;
  }
  if (rawText === null) return null;
  try {
    return normaliseSnapshot(JSON.parse(rawText));
  } catch (error) {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch (ignored) {
      // Nothing more to do if the corrupt entry cannot be removed either.
    }
    return null;
  }
}

// True when a readable save exists. A corrupt entry counts as no save.
export function hasSave() {
  return loadProgress() !== null;
}

// Remove the save entirely. Returns true when the entry is gone (or was
// never there), false only when storage itself is unavailable.
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
    return true;
  } catch (error) {
    return false;
  }
}
