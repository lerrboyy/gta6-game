// Every tuning value for Solmar Bay, in one place.
//
// Nothing else in the game hard-codes a number that matters: speeds,
// damage, payouts, prices, colours and the screenshot targets all live
// here, so balancing the game means editing this file and nothing else.
// Values are grouped by the system that owns them. Distances are metres,
// speeds are metres per second (the HUD converts to MPH for display),
// headings are radians, and colours are hex numbers in the 0xRRGGBB form
// the renderer expects.

export const config = {
  // The fixed seed the city generator is built from. Change this and the
  // whole city — streets, buildings, palms — regenerates differently.
  worldSeed: 20261121,

  // Golden-hour sunset palette. The sky runs from a deep orange at the
  // horizon up to purple-pink overhead; the sun itself is a warm amber.
  palette: {
    skyHorizon: 0xff7a2a,
    skyTop: 0x7a3b8f,
    sunColour: 0xffc46b,
    sunIntensity: 1.6,
    ambientColour: 0x8a6a9a,
    ambientIntensity: 0.55,
    windowGlow: 0xffd27a,
    neonPink: 0xff2e88,
    neonCyan: 0x2ee6ff,
    ocean: 0x1d4e6b,
    sand: 0xd9b380,
    road: 0x2b2b33,
    sidewalk: 0x6b6b72,
    // Building face colours, picked per building at random.
    buildings: [0xc96f4a, 0xd9a05b, 0x8f6a8a, 0x5b7d8a, 0xb8574f, 0x7a8a5b, 0xe0b070],
    rooftop: 0x4a4a52,
  },

  // Rico on foot.
  player: {
    walkSpeed: 4.2,
    runSpeed: 8.0,
    turnSpeed: 7.5,
    health: 100,
    armour: 100,
  },

  // Driving. Acceleration and braking are in m/s^2, top speed in m/s,
  // steering in radians per second at full lock, nitro as a multiplier
  // on top speed while held.
  car: {
    acceleration: 14.0,
    braking: 26.0,
    reverseTopSpeed: 12.0,
    topSpeed: 42.0,
    steering: 1.9,
    steeringGrip: 0.86,
    nitroBoost: 1.45,
    nitroDrain: 0.35,
    damageSmokeAt: 0.45,
  },

  // The five weapon slots, in HUD order. Damage is per hit, fireRate is
  // shots per second, range is the maximum useful distance in metres.
  weapons: [
    { slot: 1, name: 'Fists', damage: 12, fireRate: 2.0, range: 2.0 },
    { slot: 2, name: 'Pistol', damage: 18, fireRate: 3.0, range: 45.0 },
    { slot: 3, name: 'SMG', damage: 11, fireRate: 9.0, range: 55.0 },
    { slot: 4, name: 'Shotgun', damage: 34, fireRate: 1.1, range: 22.0 },
    { slot: 5, name: 'Rifle', damage: 42, fireRate: 5.5, range: 120.0 },
  ],

  // The wanted system. Police cruisers appear at this distance from the
  // player; the number of units chasing grows with the star level, and
  // the helicopter joins the hunt from three stars upward.
  police: {
    spawnDistance: 90,
    despawnDistance: 220,
    maxUnitsPerStar: 2,
    helicopterFromStars: 3,
    ramDistance: 6,
    bustDistance: 3.5,
    roadblockFromStars: 4,
    heatDecaySeconds: 45,
  },

  // The eight-job story chain: payout in dollars and respect gained on
  // completion, in story order.
  missions: [
    { id: 'first-delivery', payout: 500, respect: 10 },
    { id: 'watched-pickup', payout: 800, respect: 12 },
    { id: 'the-chase', payout: 1200, respect: 15 },
    { id: 'protection-run', payout: 1500, respect: 18 },
    { id: 'high-speed-escape', payout: 2000, respect: 22 },
    { id: 'night-job', payout: 2500, respect: 25 },
    { id: 'garage-favour', payout: 1800, respect: 20 },
    { id: 'the-big-score', payout: 5000, respect: 40 },
  ],

  // SOLMAR CUSTOMS garage prices, in dollars.
  garage: {
    engine: 1500,
    armour: 1200,
    nitro: 900,
    respray: 400,
  },

  // The two radio stations. Frequency is in MHz; style is a short
  // description the audio module uses to pick its synth loop.
  radio: [
    { name: 'SOLMAR FM', frequency: 98.6, style: 'laid-back Latin groove' },
    { name: 'NEON WAVE', frequency: 104.3, style: 'fast electronic beat' },
  ],

  // The exact world state the screenshot scenario sets up, so the play
  // shot is reproducible: money, wanted stars, day and clock, speed and
  // the active radio station.
  screenshot: {
    money: 18450,
    wantedStars: 3,
    day: 1,
    clockHour: 9,
    clockMinute: 31,
    speedMph: 61,
    station: 'SOLMAR FM 98.6',
  },
};
