const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  console.log("--- AUTO-PILOT ACTIVE ---");
  let lastTaskID = "";

  while (true) {
    // 1. If inside a task, wait for you to finish and go back
    if (page.url().includes('task=')) {
      console.log("Waiting for manual Submit and return to table...");
      await page.waitForFunction(() => !window.location.search.includes('task='), { timeout: 0 });
      await page.waitForTimeout(2000); 
    }

    let foundOnScreen = false;
    
    // 2. Scan for the '0' in Column 10
    const rows = await page.locator('.lsf-table-row').all();
    for (const row of rows) {
      const countCell = row.locator('div:nth-child(10) > div');
      const idCell = row.locator('.lsf-table__cell').nth(1);
      
      const countText = (await countCell.innerText()).trim();
      const currentID = (await idCell.innerText()).trim();

      if (countText === "0" && currentID !== lastTaskID) {
        console.log(`🎯 Opening Task: ${currentID}`);
        await countCell.dblclick({ force: true });
        lastTaskID = currentID;

        // 3. PREPARE THE WORKSPACE (Using your recorded clicks)
        try {
          console.log("Waiting for workspace to load...");
          
          // Wait for the waveform to appear and click it to activate the segment
          const waveform = page.locator('#waveform-layer-main');
          await waveform.waitFor({ state: 'visible', timeout: 10000 });
          await waveform.click();
          
          // Click into the transcription area so it's focused
          const textBox = page.getByText('Annotation Result (Transcription)');
          await textBox.click();

          console.log("✅ Ready! The box is focused. Just PASTE your text.");
          foundOnScreen = true; 
          break; 
        } catch (e) {
          console.log("Workspace load timed out. Please click into the box manually.");
          foundOnScreen = true;
          break;
        }
      }
    }

    // 4. Scroll if no '0' is found
    if (!foundOnScreen) {
      await page.evaluate(() => {
        const scroller = document.querySelector('.lsf-table [style*="overflow: auto"]');
        if (scroller) scroller.scrollTop += 500;
      });
      await page.waitForTimeout(1500);
    }
  }
})();