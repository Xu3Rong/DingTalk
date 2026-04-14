const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  let lastTaskID = "";

  console.log("--- PRECISION MAP-PASTER ACTIVE ---");

  while (true) {
    try {
      // 1. Reload the map every loop so you can add new tasks while it's running
      const mapping = JSON.parse(fs.readFileSync(path.join(__dirname, 'mapping.json'), 'utf8'));

      if (page.url().includes('task=')) {
        await page.waitForURL(url => !url.searchParams.has('task'), { timeout: 0 });
        await page.waitForTimeout(1500); 
      }

      const rows = await page.locator('.lsf-table-row').all();
      let foundOnScreen = false;

      for (const row of rows) {
        const countCell = row.locator('div:nth-child(10) > div');
        const idCell = row.locator('.lsf-table__cell').nth(1);
        const countText = (await countCell.innerText()).trim();
        const currentID = (await idCell.innerText()).trim();

        if (countText === "0" && currentID !== lastTaskID) {
          console.log(`🎯 Task Detected: ${currentID}`);
          
          // 2. CHECK THE MAP
          if (mapping[currentID]) {
            console.log(`✅ ID Match found in mapping.json. Opening...`);
            await countCell.dblclick({ force: true });
            lastTaskID = currentID;

            await page.waitForSelector('#waveform-layer-main', { timeout: 10000 });
            await page.waitForTimeout(1200);
            await page.click('#waveform-layer-main');
            
            const textBox = page.locator('textarea, [contenteditable="true"], .lsf-text-area__input').first();
            await textBox.waitFor({ state: 'visible' });
            
            // 3. INJECT THE PERFECT TEXT
            await textBox.focus();
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Backspace');
            await textBox.fill(mapping[currentID]); 
            await page.keyboard.press('Space'); 
            
            console.log(`✔ Task ${currentID} completed via Map.`);
          } else {
            console.log(`⚠ Task ${currentID} is NOT in your mapping.json yet.`);
          }
          
          foundOnScreen = true; 
          break; 
        }
      }

      if (!foundOnScreen) {
        await page.evaluate(() => {
          const scroller = document.querySelector('.lsf-table [style*="overflow: auto"]');
          if (scroller) scroller.scrollTop += 400;
        });
        await page.waitForTimeout(1000); 
      }
    } catch (e) {
      await page.waitForTimeout(2000);
    }
  }
})();