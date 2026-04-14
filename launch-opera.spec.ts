import { test, chromium } from '@playwright/test';

test('launch opera and record', async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:\\Users\\User\\AppData\\Local\\Programs\\Opera\\opera.exe'
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // This line opens the DingTalk page
  await page.goto('https://scale.dingtalk.com/projects/32687/data');
  
  // This line triggers the "Inspector" window so you can start recording
  await page.pause();
});