const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');

// --- THE FIX: Correct stealth initialization ---
chromium.use(stealthPlugin());

// --- 0. HUMAN BEHAVIOR SIMULATOR ---
const humanPause = (min, max) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

// --- 1. DATA NORMALIZATION (Notebook Rules) ---
function normalizeText(text) {
    let norm = text.toLowerCase()
        .replace(/-/g, ' ')           
        .replace(/%/g, ' peratus')    
        .replace(/[^\w\s]/gi, '')     
        .replace(/\s+/g, ' ')         
        .trim();

    const magMap = {
        'bilion': '000000000', 'juta': '000000',
        'ribu': '000', 'ratus': '00', 'puluh': '0',
        'sebelas': '11', 'sepuluh': '10'
    };

    Object.keys(magMap).forEach(word => {
        norm = norm.replace(new RegExp(`\\b${word}\\b`, 'g'), magMap[word]);
    });

    return norm;
}

// --- 2. LOAD SCRIPT DATA ---
const filePath = path.join(__dirname, 'scripts.txt');
let cleanParagraphs = [];
try {
  const rawContent = fs.readFileSync(filePath, 'utf8');
  cleanParagraphs = rawContent.split(/\n\s*\n/) 
    .map(s => s.trim())
    .filter(s => s.length > 20); 
  console.log(`✅ Loaded ${cleanParagraphs.length} paragraphs from scripts.txt.`);
} catch (err) {
  console.log("❌ Error reading scripts.txt.");
  process.exit();
}

// --- 3. FINGERPRINT SCORER ---
function getFingerprintScore(messyText, cleanChunk) {
    const normMessy = normalizeText(messyText);
    const normClean = normalizeText(cleanChunk);
    const messyWords = [...new Set(normMessy.split(/\s+/).filter(w => w.length > 3 || !isNaN(w)))]; 
    
    let matchCount = 0;
    messyWords.forEach(word => {
        if (normClean.includes(word)) matchCount++;
    });
    return messyWords.length > 0 ? (matchCount / messyWords.length) : 0;
}

// --- 4. ELASTIC SLIDING WINDOW ---
function extractBestSegment(messyText, cleanParagraph) {
    const messyWords = messyText.trim().split(/\s+/);
    const cleanWords = cleanParagraph.trim().split(/\s+/);
    const targetLen = messyWords.length;
    if (targetLen < 3) return cleanParagraph; 

    let bestScore = 0;
    let bestSegment = cleanParagraph;
    const minLen = Math.max(1, Math.floor(targetLen * 0.7));
    const maxLen = Math.min(cleanWords.length, Math.ceil(targetLen * 1.4));

    for (let windowSize = minLen; windowSize <= maxLen; windowSize++) {
        for (let i = 0; i <= cleanWords.length - windowSize; i++) {
            const windowText = cleanWords.slice(i, i + windowSize).join(' ');
            const score = stringSimilarity.compareTwoStrings(normalizeText(messyText), normalizeText(windowText));
            if (score > bestScore) {
                bestScore = score;
                bestSegment = windowText;
            }
        }
    }
    return bestSegment;
}

(async () => {
  console.log("🚀 Launching Stealth Opera...");
  
  try {
    const context = await chromium.launchPersistentContext('C:\\DingTalk\\stealth_data', {
      executablePath: 'C:\\Users\\User\\AppData\\Local\\Programs\\Opera\\opera.exe',
      headless: false,
      viewport: null,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'
      ]
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    
    console.log("🌐 Navigating to Project 35584...");
    await page.goto('https://scale.dingtalk.com/projects/35584/data');
    
    await page.waitForSelector('.lsf-table-row', { timeout: 30000 }).catch(() => {});

    let lastTaskID = "";
    console.log("--- BOT ACTIVE ---");

    while (true) {
      try {
        await humanPause(2000, 3500); 

        const rows = await page.locator('.lsf-table-row').all();
        let foundOnScreen = false;

        for (const row of rows) {
          const cells = await row.locator('.lsf-table__cell').all();
          if (cells.length < 2) continue;

          const textCol2 = (await cells[1].innerText()).trim();
          const textCol3 = cells.length > 2 ? (await cells[2].innerText()).trim() : "";
          
          if (textCol2 === "0" || textCol3 === "0") {
            const checkbox = row.locator('.lsf-select-row input');
            const ariaLabel = (await checkbox.getAttribute('aria-label')) || "";
            const currentID = ariaLabel.replace('Select Task ', '').trim();

            if (currentID !== lastTaskID) {
              console.log(`🎯 Found Task: ${currentID}. Opening...`);
              
              if (textCol2 === "0") await cells[1].dblclick({ force: true });
              else await cells[2].dblclick({ force: true });

              lastTaskID = currentID;

              await page.waitForSelector('#waveform-layer-main', { timeout: 15000 });
              await humanPause(2500, 3500); 
              
              const textBox = page.locator('textarea, [contenteditable="true"], .lsf-text-area__input').first();
              await textBox.waitFor({ state: 'visible' });

              let screenSnippet = await textBox.inputValue() || await textBox.textContent() || "";
              screenSnippet = screenSnippet.trim();
              
              if (screenSnippet.length > 5) {
                let bestScore = 0;
                let bestParagraph = "";
                for (const cleanPara of cleanParagraphs) {
                    const score = getFingerprintScore(screenSnippet, cleanPara);
                    if (score > bestScore) {
                        bestScore = score;
                        bestParagraph = cleanPara;
                    }
                }

                if (bestScore > 0.25) { 
                  const finalPastedText = extractBestSegment(screenSnippet, bestParagraph);

                  await humanPause(600, 1200); 
                  await textBox.focus();
                  await page.keyboard.press('Control+A');
                  await page.keyboard.press('Backspace');
                  await textBox.fill(finalPastedText.trim()); 
                  
                  console.log(`✔ Matched. Waiting to look human...`);

                  const wordCount = finalPastedText.split(/\s+/).length;
                  const reviewTime = Math.max(15000, wordCount * 1100); 
                  await humanPause(reviewTime, reviewTime + 5000); 

                  await page.locator('button[aria-label="submit"]').first().click();

                  try {
                      const ignoreBtn = page.locator('[data-testid="dialog-ok-button"]');
                      await ignoreBtn.waitFor({ state: 'visible', timeout: 2000 });
                      await ignoreBtn.click();
                  } catch (e) {}

                  console.log("✅ Submitted.");
                  await humanPause(3000, 5000); 
                }
              }
              foundOnScreen = true; 
              break; 
            }
          }
        }

        if (!foundOnScreen) {
          await page.evaluate(() => {
            const scroller = document.querySelector('.lsf-table [style*="overflow: auto"]');
            if (scroller) scroller.scrollTop += 600;
          });
        }
      } catch (e) {
        await humanPause(2000, 3500); 
      }
    }
  } catch (error) {
    console.log("❌ Fatal Launch Error. Make sure Opera is closed before starting.");
    console.log(error.message);
  }
})();