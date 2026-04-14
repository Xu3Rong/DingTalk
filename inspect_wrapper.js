const { chromium } = require('playwright');

(async () => {
  console.log("🔍 Connecting to browser to inspect Wrapper View...");
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects')) || context.pages()[0];
    
    if (!page.url().includes('task=')) {
      console.log("⚠️ PLEASE OPEN A TASK! You must be INSIDE the wrapper to inspect it.");
      process.exit(0);
    }

    console.log(`\n✅ Inside Wrapper (Task ID: ${page.url().split('task=')[1]})`);
    
    console.log("⏳ Scanning for Navigation/Action Buttons...");

    // Find all buttons or things that act like buttons globally on the page
    const buttons = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"], a.ant-btn'));
        return btns.map(el => {
            const text = (el.innerText || el.textContent || "").trim();
            const aria = el.getAttribute('aria-label') || "";
            const cls = typeof el.className === 'string' ? el.className : "";
            
            // Only care about buttons that have text or aria labels
            if(text.length > 0 || aria.length > 0) {
                return `[TEXT: "${text.substring(0, 20)}"]  [ARIA: "${aria}"]  [CLASS: ${cls}]`;
            }
            return null;
        }).filter(b => b !== null);
    });

    // Check if the table still completely exists in the background
    const tableRows = await page.locator('.lsf-table-row').count();

    console.log("\n--- BUTTONS FOUND INSIDE WRAPPER ---");
    buttons.forEach(b => console.log(b));

    console.log("\n--- UI STRUCTURE CHECK ---");
    if (tableRows > 0) {
        console.log(`The Table View IS STILL visible behind or beside the wrapper (Found ${tableRows} rows). This is a Split-Pane UI or Modal!`);
    } else {
        console.log("The Table View is GONE. You are on a completely separate page.");
    }

    console.log("\n✅ Done! Paste this output back.");
    process.exit(0);

  } catch(e) {
    console.log("\n❌ Error:", e.message);
  }
})();
