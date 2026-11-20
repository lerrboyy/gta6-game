// Game Configuration and Constants
// v3: weapon slots, garage prices, radio stations, respect ranks and wanted names
// all live here so the HUD, the garage and the police dispatch read one source.
export const CONFIG = {
  WORLD_SIZE: 300,
  BLOCK_SIZE: 40,
  ROAD_WIDTH: 12,
  PLAYER_SPEED: 8,
  PLAYER_SPRINT_MULT: 1.8,
  JUMP_FORCE: 9,
  GRAVITY: 25,
  SAVE_KEY: 'solmar_bay_save_v1',

  // Weapon definitions: name, damage, fireRateMs, range, price, locked
  WEAPONS: [
    { name: 'Fists', damage: 1, fireRateMs: 400, range: 3, price: 0, locked: false },
    { name: 'Pistol ".38"', damage: 2, fireRateMs: 450, range: 40, price: 0, locked: false },
    { name: 'SMG', damage: 1, fireRateMs: 140, range: 35, price: 1200, locked: true },
    { name: 'Shotgun "12G"', damage: 5, fireRateMs: 900, range: 18, price: 2500, locked: true },
    { name: 'Rifle "AR-9"', damage: 3, fireRateMs: 200, range: 60, price: 5000, locked: true },
  ],

  // Garage upgrade prices and engine speed bonus
  GARAGE: {
    repair: 250,
    respray: 400,
    engine: 4000,
    armour: 3000,
    nitro: 1800,
    engineMaxSpeedBonus: 8,
    maxLevel: 3,
  },

  // Radio station frequencies
  RADIO: [
    { name: 'SOLMAR FM', freq: 98.6 },
    { name: 'PALM 107', freq: 107.1 },
  ],

  // Crew members
  CREW: [
    { name: 'Rico', role: 'Wheelman', color: 0x0e7c7b },
    { name: 'Lena', role: 'Fixer', color: 0xff6b9d },
    { name: 'Marco', role: 'Driver', color: 0xff9500 },
  ],

  // In-game clock configuration
  CLOCK: {
    dayLengthMin: 8,
    startHour: 9,
    startMinute: 31,
  },

  // Respect level thresholds and titles
  RESPECT_LEVELS: [
    { threshold: 0, min: 0, name: 'NEW IN TOWN', label: 'NEW IN TOWN' },
    { threshold: 150, min: 150, name: 'STREET KNOWN', label: 'STREET KNOWN' },
    { threshold: 400, min: 400, name: 'RESPECTED', label: 'RESPECTED' },
    { threshold: 800, min: 800, name: 'FEARED', label: 'FEARED' },
    { threshold: 1500, min: 1500, name: 'KING OF SOLMAR', label: 'KING OF SOLMAR' },
  ],

  // Wanted level descriptors indexed 0-5
  WANTED_NAMES: ['', 'SOLMAR PD', 'SOLMAR PD', 'SBPD + HELI', 'SBPD + ROADBLOCK', 'FULL MANHUNT'],
};
