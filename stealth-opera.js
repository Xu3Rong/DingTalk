const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

(async () => {
  const context = await chromium.launchPersistentContext('C:\\DingTalk\\stealth_data', {
    executablePath: 'C:\\Users\\User\\AppData\\Local\\Programs\\Opera\\opera.exe',
    headless: false,
    viewport: null,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--remote-debugging-port=9222',  // 👈 ADD THIS
    ]
  });

  const page = await context.newPage();
  await page.goto('https://accounts.google.com/');
  console.log("Browser ready. CDP available on port 9222.");
  await page.pause();
})();