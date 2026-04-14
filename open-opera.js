const { chromium } = require('playwright');

(async () => {
  // This launches Opera with a "User Data Dir"
  // It saves your login so you don't have to keep signing in!
  const context = await chromium.launchPersistentContext('C:\\DingTalk\\user_data', {
    executablePath: 'C:\\Users\\User\\AppData\\Local\\Programs\\Opera\\opera.exe',
    headless: false,
    viewport: null, // Opens in full screen
    args: ['--start-maximized'] 
  });

  const page = await context.newPage();
  await page.goto('https://scale.dingtalk.com/projects/32687/data');
  
  // This opens the recorder
  await page.pause();
})();