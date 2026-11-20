// Seeded PRNG for reproducible procedural generation
// v3: the same seed always builds the same Solmar Bay, so every screenshot
// and every play session sees the same streets.
export class SeededRandom {
  constructor(seed = 12345) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  choice(arr) {
    return arr[this.int(0, arr.length - 1)];
  }
}
