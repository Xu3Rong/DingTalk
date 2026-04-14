const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const page = browser.contexts()[0].pages().find(p=>p.url().includes('scale.dingtalk.com/projects')) || browser.contexts()[0].pages()[0];
    
    console.log("\n🕵️‍♂️ DUMPING TABLE STRUCTURE...");
    const headers = await page.locator('.lsf-table__header-cell').allInnerTexts();
    console.log("HEADERS:", headers.map(h => h.replace(/\n/g, '').trim()).join(" | "));

    const rows = await page.locator('.lsf-table-row').all();
    if (rows.length > 0) {
        console.log(`\n🕵️‍♂️ ROW 1 has ${rows.length} rows detected.`);
        let i = 0;
        // Let's dump the first 3 rows
        for (let row of rows.slice(0, 3)) {
            const cells = await row.locator('.lsf-table__cell').all();
            console.log(`\n--- ROW ${i} --- (${cells.length} cells)`);
            for (let c = 0; c < cells.length; c++) {
               let txt = await cells[c].textContent().catch(()=>'');
               console.log(`  Cell[${c}]: ${txt.trim().replace(/\n/g, '\\n')}`);
            }
            i++;
        }
    } else {
        console.log("❌ No rows found!");
    }
  } catch (e) {
    console.log("❌ Error:", e.message);
  }
  process.exit(0);
})();
