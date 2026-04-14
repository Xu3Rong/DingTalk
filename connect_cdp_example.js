const { chromium } = require('playwright');

(async () => {
  console.log('Connecting to existing browser on port 9222...');
  
  try {
    // Connect to the browser instance that was launched with --remote-debugging-port=9222
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    
    // Get the first context and the first page, which is usually the active tab
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    
    console.log('Connected successfully!');
    
    // Navigate to Google
    await page.goto('https://accounts.google.com/');
    console.log('Navigated to Google Login page.');
    
    // You can now interact with this page just like normal
    // Since this is your regular browser, Google will see your regular browser profile and fingerprint
    // For example:
    // await page.getByRole('textbox', { name: 'Email or phone' }).fill('your-email@gmail.com');
    
    console.log('Script finished. You can now observe the browser.');
    
    // Optional: disconnect
    await browser.close();
  } catch (error) {
    console.error('Failed to connect to the browser. Make sure it is running with --remote-debugging-port=9222');
    console.error(error);
  }
})();
