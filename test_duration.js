const { chromium } = require('playwright');

(async () => {
  console.log("🔍 Connecting to your browser...");
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects')) || context.pages()[0];
    
    if (!page.url().includes('task=')) {
      console.log("⚠️ PLEASE OPEN A NEW TASK FIRST!");
      console.log("You can refresh the page manually right now to simulate a fresh load.");
      process.exit(0);
    }

    console.log("⏳ 1. Waiting for waveform canvas to appear on screen...");
    const waveform = page.locator('#waveform-layer-main');
    await waveform.waitFor({ state: 'visible', timeout: 5000 });
    console.log("✔ Waveform canvas is visible! (But audio might still be streaming)");

    console.log("⏳ 2. Monitoring the duration box for actual audio data...");
    
    // This looks exactly at the timebox your master scripts use to extract the duration
    const durationInput = page.locator('[data-testid="timebox-end-time"] input').first();
    let loaded = false;
    
    for (let i = 0; i < 40; i++) { // Will wait up to 20 seconds (500ms intervals)
      const val = await durationInput.inputValue().catch(e => "");
      
      // We wait until the duration is actually populated with something other than complete zeros
      if (val && val.length >= 5 && val !== "00:00:00" && val !== "00:00:00:000") {
        console.log(`\n🎉 AUDIO FULLY LOADED! Detected duration: [${val}]`);
        loaded = true;
        break;
      }
      
      // Print dots inline to show we are actively waiting
      process.stdout.write("."); 
      await page.waitForTimeout(500); 
    }

    if (!loaded) {
        console.log("\n⚠️ Waited 20 seconds, but the duration never populated. Network might be extremely slow.");
    }

    console.log("\n🖱️ 3. Executing the click safely...");
    await waveform.click(); 
    
    console.log("✅ Smart-click executed!");
    process.exit(0);

  } catch(e) {
    console.log("\n❌ Error:", e.message);
  }
})();
