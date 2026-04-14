const { chromium } = require('playwright');

(async () => {
  console.log("🔍 Connecting to browser to test Split-Pane looping...");
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects')) || context.pages()[0];
    
    if (!page.url().includes('task=')) {
      console.log("⚠️ PLEASE OPEN A TASK FIRST! We need the wrapper to be actively open to test switching to the next row.");
      process.exit(0);
    }

    // 1. Figure out what task we are currently sitting in
    let urlTaskId = "";
    try {
        urlTaskId = page.url().split('task=')[1].split('&')[0];
        console.log(`\n✔ Currently inside wrapper for task: ${urlTaskId}`);
    } catch(e) {
        console.log("\n✔ Inside wrapper, but couldn't parse task ID from URL.");
    }
    
    console.log("⏳ Scanning the visible table for the NEXT untouched '0' task...");
    
    const rows = await page.locator('.lsf-table-row').all();
    let found = false;

    // 2. Scan the table next to the wrapper
    for (const row of rows) {
      if (found) break;
      
      const checkbox = row.locator('.lsf-select-row input, input[aria-label^="Select Task"]').first();
      const ariaLabel = await checkbox.getAttribute('aria-label').catch(() => '');
      const taskID = ariaLabel ? ariaLabel.replace('Select Task ', '').trim() : "Unknown";

      // If this row is the task we already have open, skip it
      if (taskID === urlTaskId && taskID !== "Unknown") continue;

      const cells = await row.locator('.lsf-table__cell').all();
      if (cells.length < 2) continue;

      let col1 = (await cells[1].innerText().catch(() => '')).trim();
      let col2 = cells.length > 2 ? (await cells[2].innerText().catch(() => '')).trim() : "";
      
      let col10 = "";
      if (cells.length > 5) {
          const countCell = row.locator('div:nth-child(10) > div');
          if (await countCell.isVisible().catch(() => false)) {
              col10 = (await countCell.innerText().catch(() => '')).trim();
          }
      }

      // 3. Did we find a new '0'?
      if (col1 === "0" || col2 === "0" || col10 === "0") {
          console.log(`\n🎯 Found NEW target in the table: Task ${taskID}`);
          
          if (col1 === "0") await cells[1].dblclick({ force: true });
          else if (col2 === "0") await cells[2].dblclick({ force: true });
          else await row.dblclick({ force: true });
          
          found = true;
          console.log("🖱️ Double clicked the table cell! Waiting for wrapper UI to refresh...");

          // 4. Test our Smart Load logic!
          console.log("⏳ Waiting for duration box to populate new audio data...");
          const durationInput = page.locator('[data-testid="timebox-end-time"] input').first();
          let loaded = false;
          
          for (let i = 0; i < 40; i++) {
             const newDur = await durationInput.inputValue().catch(() => "");
             // Check if we got a valid duration that is NOT totally zeroed
             if (newDur && newDur.length >= 5 && newDur !== "00:00:00" && newDur !== "00:00:00:000") {
               console.log(`\n🎉 NEW TASK AUDIO LOADED! Duration: [${newDur}]`);
               loaded = true;
               break;
             }
             process.stdout.write(".");
             await page.waitForTimeout(500);
          }

          console.log("\n🖱️ Clicking waveform natively on the new task...");
          await page.click('#waveform-layer-main').catch(() => {});
          console.log("✅ Success! Switch and load workflow complete.");
      }
    }

    if (!found) {
        console.log("\n⚠️ Could not find another '0' task in the visible table. Try scrolling down manually and run this again.");
    }

    process.exit(0);

  } catch(e) {
    console.log("\n❌ Error:", e.message);
  }
})();
