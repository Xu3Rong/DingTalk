const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  console.log("--- CONTINUOUS LOOP ACTIVE ---");
  
  let lastTaskID = "";

  // The Infinite Loop
  while (true) {
    // 1. Check if we are currently INSIDE a task
    if (page.url().includes('task=')) {
      console.log("Current status: In Task view. Waiting for you to Submit and return to table...");
      
      // Wait for the URL to lose the 'task=' part (meaning you clicked Back/Close)
      await page.waitForFunction(() => !window.location.search.includes('task='), { timeout: 0 });
      console.log("Detected return to table. Hunting for next 0...");
      await page.waitForTimeout(1000); // Breathe for the grid to reload
    }

    let foundOnScreen = false;
    let scrollAttempts = 0;

    while (!foundOnScreen && scrollAttempts < 40) {
      const rows = await page.locator('.lsf-table-row').all();
      
      for (const row of rows) {
        const countCell = row.locator('div:nth-child(10) > div');
        const idCell = row.locator('.lsf-table__cell').nth(1);
        
        const countText = (await countCell.innerText()).trim();
        const currentID = (await idCell.innerText()).trim();

        if (countText === "0" && currentID !== lastTaskID) {
          console.log(`🎯 Next Task Found: ${currentID}`);
          await countCell.evaluate(el => el.style.backgroundColor = '#52c41a');
          
          // Double click as per your recording
          await countCell.dblclick({ force: true });
          lastTaskID = currentID;

          // Wait for the detail view to actually load before pausing
          try {
            await page.waitForSelector('textarea', { timeout: 8000 });
            console.log("✅ Box ready. Paste your essay now!");
          } catch (e) {
            console.log("Opened, but text area is slow...");
          }

          foundOnScreen = true;
          break;
        }
      }

      if (!foundOnScreen) {
        // Force the internal scroller down
        await page.evaluate(() => {
          const scroller = document.querySelector('.lsf-table [style*="overflow: auto"]');
          if (scroller) scroller.scrollTop += 550;
        });
        await page.waitForTimeout(1200); 
        scrollAttempts++;
      }
    }

    // This is the key: The script "pauses" its code here, but the loop is still active.
    // It will loop back to the top and wait at step #1 until you return to the table.
    console.log("Action: After Submitting, click the 'Back' button to trigger the next search.");
    await page.waitForTimeout(2000); 
  }
})();