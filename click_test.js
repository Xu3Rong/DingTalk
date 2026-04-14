const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];

  console.log("--- CLICK DIAGNOSTIC STARTING ---");

  // 1. Ensure we aren't already in a task
  if (page.url().includes('task=')) {
    console.log("❌ Please go back to the main table view first.");
    return;
  }

  const rows = await page.locator('.lsf-table-row').all();
  if (rows.length === 0) {
      console.log("❌ No rows found on screen.");
      return;
  }

  // Target the very first row for the test
  const testRow = rows[0];
  const idCell = testRow.locator('.lsf-table__cell').nth(1);
  const taskID = (await idCell.innerText()).trim();
  
  console.log(`🎯 Testing clicks on Task ID: ${taskID}`);

  // METHOD 1: Double-Click the Row Wrapper (instead of the cell)
  console.log("► Method 1: Double-clicking the outer row...");
  await testRow.dblclick({ force: true });
  await page.waitForTimeout(2000); // Wait 2 seconds to see if UI shifts

  if (page.url().includes('task=')) {
      console.log("✅ Method 1 WORKED! The Row Wrapper is the correct target.");
      return; // Stop testing
  }

  // METHOD 2: Click to Focus + Press Enter (Accessibility Bypass)
  console.log("► Method 2: Single Click + 'Enter' key...");
  await testRow.click({ force: true });
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  if (page.url().includes('task=')) {
      console.log("✅ Method 2 WORKED! The grid requires keyboard activation.");
      return;
  }

  // METHOD 3: Native Coordinate Mouse Click on the ID
  console.log("► Method 3: Native coordinate double-click on the ID...");
  const box = await idCell.boundingBox();
  if (box) {
      // Moves the literal mouse cursor to the center of the ID and double clicks
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(2000);
  }

  if (page.url().includes('task=')) {
      console.log("✅ Method 3 WORKED! The grid blocks synthetic clicks.");
  } else {
      console.log("❌ FAILED: None of the methods opened the row. The site might be lagging or blocking automation heavily.");
  }
})();