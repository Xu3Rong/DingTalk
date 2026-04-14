const { chromium } = require('playwright');

// Simple 'Memory' to store the last ID we opened to prevent double-clicking
let lastTaskID = "";

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  console.log("--- STARTING STABLE SCAN ---");

  let found = false;
  let scrollAttempts = 0;

  while (!found && scrollAttempts < 40) {
    const rows = await page.locator('.lsf-table-row').all();
    
    for (const row of rows) {
      // 1. Get the Task ID (Cell 2) and the Annotation Count (Cell 10)
      const idCell = row.locator('.lsf-table__cell').nth(1);
      const countCell = row.locator('div:nth-child(10) > div');
      
      const currentID = (await idCell.innerText()).trim();
      const countText = (await countCell.innerText()).trim();

      // 2. LOGIC: Is it a '0' AND is it a new task we haven't just touched?
      if (countText === "0" && currentID !== lastTaskID) {
        console.log(`✅ TARGET IDENTIFIED: Task ID ${currentID}`);
        
        await countCell.evaluate(el => el.style.border = '2px solid #52c41a');
        
        // 3. Open the task
        await countCell.click({ force: true });
        lastTaskID = currentID; // Remember this ID for the next run
        
        // 4. WAIT FOR INTERFACE: Ensure the transcription box is ready
        console.log("Waiting for transcription box to load...");
        try {
            // Adjust 'textarea' if the transcription box is a different element
            await page.waitForSelector('textarea, .lsf-text-area', { timeout: 8000 });
            console.log("✔ Ready! Paste your text now.");
        } catch (e) {
            console.log("⚠ Task opened, but couldn't find the text box automatically.");
        }

        found = true;
        break;
      }
    }

    if (!found) {
      // 5. Force the internal scroller
      await page.evaluate(() => {
        const scroller = document.querySelector('.lsf-table [style*="overflow: auto"]');
        if (scroller) scroller.scrollTop += 550;
      });

      await page.waitForTimeout(1500); 
      scrollAttempts++;
    }
  }

  if (!found) console.log("✖ No new '0' tasks found.");

  // Pause here for your manual Paste + Record of Save/Back
  await page.pause();
})();