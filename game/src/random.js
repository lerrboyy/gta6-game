// A small deterministic number source for building the city.
//
// The city is generated from a seed, and it has to come out the same way
// every time — same streets, same buildings, same screenshots — so the
// generator here is a fixed, simple one rather than Math.random(). Feed it
// the same starting seed and it hands back the same sequence of numbers,
// which is what keeps every play session looking at the same Solmar Bay.

export class SeededRandom {
  // The default seed is the one the city builder uses when no other
  // seed is given.
  constructor(seed = 12345) {
    this.seed = seed;
  }

  // Advance the generator one step and return a float in [0, 1).
  // The step is a classic linear congruential update: multiply the
  // stored seed, add a constant, and wrap it into a fixed range.
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  // A float between min (inclusive) and max (exclusive).
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // A whole number between min and max, both ends included.
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  // One element picked from the given array, uniformly at random.
  choice(arr) {
    return arr[this.int(0, arr.length - 1)];
  }
}
