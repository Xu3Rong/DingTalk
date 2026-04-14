const { chromium } = require('playwright');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

(async () => {
  console.log("🔍 Connecting to browser to test Submit logic...");
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects')) || context.pages()[0];
    
    if (!page.url().includes('task=')) {
      console.log("⚠️ PLEASE OPEN A TASK! We need to be inside the wrapper to submit.");
      process.exit(0);
    }

    console.log("⏳ Hunting for the Submit/Save button...");
    
    // 1. Find the main Submit button
    const submitBtn = page.locator('button[aria-label*="submit" i], button:has-text("Submit"), button:has-text("Save")').first();
    
    // Check if it exists before clicking
    if (await submitBtn.isVisible().catch(() => false)) {
        console.log("✅ Main Submit Button found! Clicking it now...");
        await submitBtn.click();
    } else {
        console.log("❌ Could not find a button that says Submit or Save. Is the button grayed out or named differently?");
        process.exit(1);
    }

    // 2. Wait for UI to trigger the warning popup
    console.log("🕵️‍♂️ Waiting 1.5 seconds to see if a warning/ambiguity popup appears...");
    await sleep(800);
    
    try { 
        // 3. Find the Ignore/OK button in the popup
        const dialogBtn = page.locator('[data-testid*="ok" i], [data-testid*="confirm" i], button:has-text("Ignore"), button:has-text("OK")').first(); 
        await dialogBtn.waitFor({state:'visible', timeout: 1500}); 
        
        console.log("⚠️ Popup detected! Found the 'Ignore/OK' button.");
        console.log("🖱️ Clicking Ignore/OK to force submission...");
        await dialogBtn.click(); 
    } catch {
        console.log("✔ No popup appeared within 1.5 seconds. Submission went through cleanly!");
    }

    console.log("\n✅ Test complete! Did the UI transition to the next task correctly?");
    process.exit(0);

  } catch(e) {
    console.log("\n❌ Error:", e.message);
  }
})();
