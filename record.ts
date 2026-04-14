import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:\\Users\\User\\AppData\\Local\\Programs\\Opera\\opera.exe'
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://scale.dingtalk.com/projects/32687/data');
  await page.pause(); // This opens the Recorder/Inspector!
})();