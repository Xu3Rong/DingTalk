const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const readline = require('readline');
const path = require('path');

chromium.use(stealth);

const TARGET_FILES = [
  'ok.js',
  'ok_compare.js',
  'ok_single_task.js',
  'preflight.js',
  'mapper.js'
];

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

function updateProjectID(targetID) {
  const pattern = /PROJECT_ID:\s*'(\d+)'/;
  let updatedCount = 0;

  for (const filename of TARGET_FILES) {
    const filepath = path.join(__dirname, filename);
    if (!fs.existsSync(filepath)) {
      console.log(`⚠️ Warning: ${filename} not found, skipping.`);
      continue;
    }

    try {
      const content = fs.readFileSync(filepath, 'utf8');
      if (pattern.test(content)) {
        const newContent = content.replace(pattern, `PROJECT_ID: '${targetID}'`);
        fs.writeFileSync(filepath, newContent, 'utf8');
        console.log(`✅ Synced ${filename} -> Project ${targetID}`);
        updatedCount++;
      } else {
        console.log(`⚠️ Note: Could not locate PROJECT_ID in ${filename}.`);
      }
    } catch (e) {
      console.error(`❌ Error updating ${filename}: ${e.message}`);
    }
  }
  
  if (updatedCount > 0) {
    console.log(`\n🎉 Successfully globally configured ${updatedCount} modules to Project ${targetID}!\n`);
  }
}

(async () => {
  console.log("==========================================");
  console.log("    DingTalk Master Launcher & Sync");
  console.log("==========================================\n");

  let projectID = process.argv[2];

  if (projectID) {
    console.log(`🚀 Argument provided. Syncing all scripts to Project ID: ${projectID}...`);
  } else {
    projectID = await askQuestion("🎯 Enter the target Project ID (e.g. 42652) or press Enter to skip sync: ");
    projectID = projectID.trim();
  }

  if (projectID) {
    // Basic validation to ensure it's numerical
    if (/^\d{3,10}$/.test(projectID)) {
      updateProjectID(projectID);
    } else {
      console.log(`❌ Invalid Project ID format '${projectID}'. Skipping sync.`);
    }
  } else {
    console.log(`➖ No Project ID provided. Proceeding to launch browser natively...`);
  }

  console.log("\nLaunching Chrome in Stealth Mode...");
  
  // This uses a local folder on your computer to save session data,
  // preventing you from needing to log in repeatedly.
  const context = await chromium.launchPersistentContext('./chrome_user_data', {
    channel: 'chrome', // This instructs Playwright to use your system's Google Chrome natively
    headless: false,
    viewport: null,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--remote-debugging-port=9222', 
    ]
  });

  const page = await context.pages()[0] || await context.newPage();
  await page.goto('https://accounts.google.com/');
  
  console.log("✅ Chrome is running cleanly.");
  console.log("✅ Debugging port open at http://localhost:9222");
  console.log("Keep this terminal open! Run your automation script in another terminal.");
})();
