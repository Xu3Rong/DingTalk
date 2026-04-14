const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

(async () => {
  console.log("Launching Chrome in Stealth Mode...");
  
  // This uses a local folder on your computer to save session data,
  // preventing you from needing to log in repeatedly.
  const context = await chromium.launchPersistentContext('./chrome_user_data', {
    channel: 'chrome', // This instructs Playwright to use your system's Google Chrome natively
    headless: false,
    viewport: null,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--remote-debugging-port=9222', 
    ]
  });

  const page = await context.pages()[0] || await context.newPage();
  await page.goto('https://accounts.google.com/');
  
  console.log("✅ Chrome is running cleanly.");
  console.log("✅ Debugging port open at http://localhost:9222");
  console.log("Keep this terminal open! Run your automation script in another terminal.");
})();
