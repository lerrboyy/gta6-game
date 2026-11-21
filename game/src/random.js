// Seeded random-number generator for Solmar Bay.
//
// The whole city is built from one fixed seed, so every load produces the
// same streets, buildings and palm trees. This module implements a small
// mulberry-style generator from scratch: a 32-bit integer state is scrambled
// on every draw and the result is scaled into the [0, 1) range. Everything
// else in the game (ranges, picks, shuffles) is built on top of that one
// draw, so the sequence stays deterministic as long as the seed is.

export function createSeededRandom(seed) {
  // Fold any numeric seed into an unsigned 32-bit starting state. Zero is
  // a poor starting state for this scrambler, so it is nudged to a fixed
  // non-zero value instead.
  let state = (seed >>> 0) || 0x9e3779b9;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let scrambled = state;
    scrambled = Math.imul(scrambled ^ (scrambled >>> 15), scrambled | 1);
    scrambled ^= scrambled + Math.imul(scrambled ^ (scrambled >>> 7), scrambled | 61);
    return ((scrambled ^ (scrambled >>> 14)) >>> 0) / 4294967296;
  }

  // A float in [0, 1).
  function float() {
    return next();
  }

  // A float in [min, max). The caller may pass the bounds in either order;
  // the smaller one always wins as the lower end.
  function range(min, max) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + next() * (hi - lo);
  }

  // An integer in [min, max], both ends inclusive.
  function integer(min, max) {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(next() * (hi - lo + 1));
  }

  // One element chosen at random from an array. Returns undefined for an
  // empty array rather than throwing, so callers can treat "no choice"
  // as a normal result.
  function pick(list) {
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(next() * list.length)];
  }

  // A shuffled copy of an array (Fisher-Yates). The original array is
  // never modified, so the same source list can be reused for later draws.
  function shuffle(list) {
    const copy = Array.from(list || []);
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const held = copy[i];
      copy[i] = copy[j];
      copy[j] = held;
    }
    return copy;
  }

  return { next: float, float, range, integer, pick, shuffle };
}
