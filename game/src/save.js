// Save and Load manager using localStorage
import { CONFIG } from './config.js';

export class SaveManager {
  constructor() {
    this.defaultData = {
      x: 0,
      y: 1,
      z: 0,
      cash: 500,
      health: 100,
      wanted: 0,
      weaponSlot: 1,
      armor: 0,
      respect: 0,
      day: 1,
      clockMinutes: 571,
      mission: 1,
      garage: null,
    };
  }

  save(playerData) {
    try {
      const data = {
        x: playerData.position?.x ?? playerData.x ?? 0,
        y: playerData.position?.y ?? playerData.y ?? 1,
        z: playerData.position?.z ?? playerData.z ?? 0,
        cash: playerData.cash ?? 500,
        health: playerData.health ?? 100,
        wanted: playerData.wanted ?? 0,
        weaponSlot: playerData.weaponSlot ?? 1,
        armor: playerData.armor ?? 0,
        respect: playerData.respect ?? 0,
        day: playerData.day ?? 1,
        clockMinutes: playerData.clockMinutes ?? 571,
        mission: playerData.mission ?? 1,
        garage: playerData.garage ?? null,
        timestamp: Date.now(),
      };
      localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Failed to save game:', e);
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(CONFIG.SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to load game:', e);
      return null;
    }
  }

  hasSave() {
    try {
      return !!localStorage.getItem(CONFIG.SAVE_KEY);
    } catch {
      return false;
    }
  }
}
