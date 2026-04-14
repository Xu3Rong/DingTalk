const { chromium } = require('playwright');

(async () => {
  console.log("🔍 Connecting to your browser...");
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    
    // Find the DingTalk tab
    const page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects')) || context.pages()[0];
    
    if (!page.url().includes('task=')) {
      console.log("⚠️ PLEASE OPEN A TASK FIRST! I need to see the waveform to click it.");
      process.exit(0);
    }

    console.log("⏳ Waiting for waveform...");
    const waveform = page.locator('#waveform-layer-main');
    await waveform.waitFor({ state: 'visible', timeout: 5000 });
    
    console.log("🖱️ Clicking DEAD CENTER of the waveform natively...");
    
    // This is the newly implemented coordinate-free click!
    await waveform.click(); 
    
    console.log("\n✅ Click executed! Did it activate the audio segment properly on your screen?");
    process.exit(0);

  } catch(e) {
    console.log("\n❌ Error:", e.message);
  }
})();
