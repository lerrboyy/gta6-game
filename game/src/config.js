// Solmar Bay — one shared tuning table.
//
// Everything the rest of the game needs to agree on lives in this single
// object: how big the map is, how the player moves, what the guns do, what
// the garage charges, which radio stations exist, who is on the crew, how
// fast the clock runs, and what each respect rank and wanted level is called.
// Nothing here is read from anywhere else, so changing a number here changes
// it everywhere at once — the HUD, the garage, the police and the missions
// all read from this same place.

export const CONFIG = {
  // Map dimensions, in world units. Streets are laid out on a grid of
  // blocks separated by roads of the width below.
  WORLD_SIZE: 300,
  BLOCK_SIZE: 40,
  ROAD_WIDTH: 12,

  // How Rico moves on foot, and how hard the world pulls him back down.
  PLAYER_SPEED: 8,
  PLAYER_SPRINT_MULT: 1.8,
  JUMP_FORCE: 9,
  GRAVITY: 25,

  // Local-storage slot for the save file.
  SAVE_KEY: 'solmar_bay_save_v1',

  // The five weapons, in slot order. Damage is per hit, fireRateMs is the
  // gap between shots, range is in world units, price is what an unowned
  // weapon costs, and locked marks the ones Rico starts without.
  WEAPONS: [
    {
      name: 'Fists',
      damage: 1,
      fireRateMs: 400,
      range: 3,
      price: 0,
      locked: false,
    },
    {
      name: 'Pistol ".38"',
      damage: 2,
      fireRateMs: 450,
      range: 40,
      price: 0,
      locked: false,
    },
    {
      name: 'SMG',
      damage: 1,
      fireRateMs: 140,
      range: 35,
      price: 1200,
      locked: true,
    },
    {
      name: 'Shotgun "12G"',
      damage: 5,
      fireRateMs: 900,
      range: 18,
      price: 2500,
      locked: true,
    },
    {
      name: 'Rifle "AR-9"',
      damage: 3,
      fireRateMs: 200,
      range: 60,
      price: 5000,
      locked: true,
    },
  ],

  // What SOLMAR CUSTOMS charges, and how much extra top speed a fully
  // tuned engine adds. Upgrades cap out at maxLevel.
  GARAGE: {
    repair: 250,
    respray: 400,
    engine: 4000,
    armour: 3000,
    nitro: 1800,
    engineMaxSpeedBonus: 8,
    maxLevel: 3,
  },

  // The two stations on the dial, with their frequencies.
  RADIO: [
    { name: 'SOLMAR FM', freq: 98.6 },
    { name: 'PALM 107', freq: 107.1 },
  ],

  // Rico's crew, with the job each of them does and the colour used to
  // mark them in the world.
  CREW: [
    { name: 'Rico', role: 'Wheelman', color: 0x0e7c7b },
    { name: 'Lena', role: 'Fixer', color: 0xff6b9d },
    { name: 'Marco', role: 'Driver', color: 0xff9500 },
  ],

  // The in-game clock: one full day passes in dayLengthMin real minutes,
  // and a fresh game opens at the hour and minute below.
  CLOCK: {
    dayLengthMin: 8,
    startHour: 9,
    startMinute: 31,
  },

  // Respect ranks. Each entry is the respect total a rank starts at, and
  // the name shown for it — threshold and min carry the same value, and
  // name and label carry the same text.
  RESPECT_LEVELS: [
    { threshold: 0, min: 0, name: 'NEW IN TOWN', label: 'NEW IN TOWN' },
    { threshold: 150, min: 150, name: 'STREET KNOWN', label: 'STREET KNOWN' },
    { threshold: 400, min: 400, name: 'RESPECTED', label: 'RESPECTED' },
    { threshold: 800, min: 800, name: 'FEARED', label: 'FEARED' },
    { threshold: 1500, min: 1500, name: 'KING OF SOLMAR', label: 'KING OF SOLMAR' },
  ],

  // What the HUD calls each wanted level, by star count from 0 to 5.
  // Level 0 has no name because there is no heat to describe.
  WANTED_NAMES: ['', 'SOLMAR PD', 'SOLMAR PD', 'SBPD + HELI', 'SBPD + ROADBLOCK', 'FULL MANHUNT'],
};
