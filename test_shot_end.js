const { chromium } = require('playwright');
const { spawn } = require('child_process');

(async () => {
  const server = spawn('node', ['serve.ts'], { stdio: 'inherit' });
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    const browser = await chromium.launch({
      executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('http://localhost:8080/?shot=end', { waitUntil: 'networkidle' });
    await page.waitForFunction('window.__shotReady === true', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/3-end.jpg' });
    await browser.close();
    console.log('Screenshot saved to screenshots/3-end.jpg');
  } finally {
    server.kill();
  }
})();
