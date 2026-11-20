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
    };
  }

  save(playerData) {
    try {
      const data = {
        x: playerData.position.x,
        y: playerData.position.y,
        z: playerData.position.z,
        cash: playerData.cash ?? 500,
        health: playerData.health ?? 100,
        wanted: playerData.wanted ?? 0,
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
