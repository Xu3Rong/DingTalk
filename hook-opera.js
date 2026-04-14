const { chromium } = require('playwright');

(async () => {
  // Instead of launching, we CONNECT to the window you already opened
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const defaultContext = browser.contexts()[0];
  const page = defaultContext.pages()[0];

  // Now Playwright can see your logged-in session!
  await page.goto('https://scale.dingtalk.com/projects/32687/data');
  
  console.log("Playwright is now controlling your manual Opera session.");
  await page.pause(); // Start recording!
})();