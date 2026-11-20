import pkg from '/tmp/pwtest/node_modules/playwright/index.js';
const { chromium } = pkg;
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { mkdirSync } from 'node:fs';

async function main() {
  mkdirSync('screenshots', { recursive: true });
  
  // Start server
  const server = spawn('node', ['serve.ts'], { stdio: 'inherit' });
  await setTimeout(1000); // wait for server to start

  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
  
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  try {
    // 1. Foundation / Start shot
    await page.goto('http://localhost:8080/?shot=start', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 10000 }).catch(() => {
      console.log('Timeout waiting for __shotReady on start, taking screenshot anyway');
    });
    await setTimeout(500);
    await page.screenshot({ path: 'screenshots/0-foundation.png' });
    console.log('Successfully saved screenshots/0-foundation.png');

    // 2. Street shot with cars and pedestrians
    await page.goto('http://localhost:8080/?shot=street', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 10000 }).catch(() => {
      console.log('Timeout waiting for __shotReady on street, taking screenshot anyway');
    });
    await setTimeout(500);
    await page.screenshot({ path: 'screenshots/1-street.png' });
    console.log('Successfully saved screenshots/1-street.png');

  } catch (err) {
    console.error('Render test error:', err);
  } finally {
    await browser.close();
    server.kill();
  }
}

main();
