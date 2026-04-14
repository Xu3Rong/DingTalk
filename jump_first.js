const { chromium } = require('playwright');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

(async () => {
  console.log("🔍 Connecting to browser to hunt down the first '0'...");
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects')) || context.pages()[0];
    
    let found = false;
    
    // We will attempt up to 5 times. If we don't find it, we scroll down and try again!
    for (let attempts = 0; attempts < 5; attempts++) {
      console.log(`\n⏳ Scanning visible table (Attempt ${attempts + 1}/5)...`);
      const rows = await page.locator('.lsf-table-row').all();
      
      for (const row of rows) {
        if (found) break;
        const cells = await row.locator('.lsf-table__cell').all();
        if (cells.length < 2) continue;

        // Check our fallback columns
        let col1 = (await cells[1].innerText().catch(() => '')).trim();
        let col2 = cells.length > 2 ? (await cells[2].innerText().catch(() => '')).trim() : "";
        let col10 = "";
        if (cells.length > 5) {
            const countCell = row.locator('div:nth-child(10) > div');
            if (await countCell.isVisible().catch(() => false)) {
                col10 = (await countCell.innerText().catch(() => '')).trim();
            }
        }

        if (col1 === "0" || col2 === "0" || col10 === "0") {
            const checkbox = row.locator('.lsf-select-row input, input[aria-label^="Select Task"]').first();
            const ariaLabel = await checkbox.getAttribute('aria-label').catch(() => '');
            const taskID = ariaLabel ? ariaLabel.replace('Select Task ', '').trim() : "Unknown";
            
            console.log(`\n🎯 Found highest '0' on screen: Task ${taskID}`);
            
            // Double click exactly perfectly!
            if (col1 === "0") await cells[1].dblclick({ force: true });
            else if (col2 === "0") await cells[2].dblclick({ force: true });
            else await row.dblclick({ force: true });
            
            // Clear annoying text highlighting caused by fast double clicks
            await page.evaluate(() => window.getSelection().removeAllRanges()).catch(()=>{});
            
            found = true;
            console.log("🖱️ Double clicked the row. Jump complete!");
            break;
        }
      }

      if (found) break;

      // SCROLLING LOGIC
      console.log("⚠️ No '0' visible on screen right now! Activating auto-scroll to fetch more lazy-loaded tasks...");
      try {
        await page.evaluate(() => {
          const scroller = document.querySelector('.lsf-table [style*="overflow: auto"]');
          if (scroller) scroller.scrollTop += 800;
        });
      } catch (e) { console.log(e.message); }
      
      // Give the DingTalk servers a second to stream the new table rows into the browser
      await sleep(1500); 
    }

    if (!found) {
        console.log("\n❌ Scrolled 5 times but couldn't find a single '0'. Everything might be completed!");
    } else {
        console.log("✅ Success! Your cursor is now at the highest untouched task.");
    }

    process.exit(0);
  } catch(e) {
    console.log("\n❌ Error:", e.message);
  }
})();
