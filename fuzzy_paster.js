const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');

// --- 0. HUMAN BEHAVIOR SIMULATOR ---
const humanPause = (min, max) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

// --- 1. DATA NORMALIZATION ---
function normalizeText(text) {
    let norm = text.toLowerCase()
        .replace(/-/g, ' ')
        .replace(/%/g, ' peratus')
        .replace(/[^\w\s]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Strip common Malay prefixes/suffixes for better matching
    norm = norm
        .replace(/\bme(ng|ny|m|n)?/g, '')
        .replace(/\bber/g, '')
        .replace(/\bter/g, '')
        .replace(/\bke(pada)?\b/g, '')
        .replace(/nya\b/g, '')
        .replace(/lah\b/g, '')
        .replace(/kah\b/g, '');

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

// --- 2. LOAD FULL PARAGRAPHS ---
const filePath = path.join(__dirname, 'scripts.txt');
let cleanParagraphs = [];
try {
  const rawContent = fs.readFileSync(filePath, 'utf8');
  cleanParagraphs = rawContent.split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
  console.log(`✅ Loaded ${cleanParagraphs.length} paragraphs from scripts.txt.`);
} catch (err) {
  console.log("❌ Error reading scripts.txt. Make sure the file exists.");
  process.exit();
}

// --- 3. FINGERPRINT SCORER (Improved) ---
function getFingerprintScore(messyText, cleanChunk) {
    const normMessy = normalizeText(messyText);
    const normClean = normalizeText(cleanChunk);

    // Expanded Malay filler words
    const fillerWords = new Set([
        'yang', 'dan', 'dia', 'ini', 'itu', 'akan', 'untuk', 'dengan',
        'dari', 'pada', 'oleh', 'ke', 'di', 'ia', 'si', 'tu', 'ni',
        'juga', 'atau', 'pun', 'saja', 'sahaja', 'lagi', 'sudah',
        'telah', 'sedang', 'boleh', 'tidak', 'tak', 'ada', 'satu',
        'kami', 'kita', 'anda', 'saya', 'mereka', 'kamu'
    ]);

    const messyWords = [...new Set(normMessy.split(/\s+/).filter(w => (w.length > 3 || !isNaN(w)) && !fillerWords.has(w)))];

    // Score 1: word overlap
    let matchCount = 0;
    messyWords.forEach(word => {
        if (normClean.includes(word)) matchCount++;
    });
    const overlapScore = messyWords.length > 0 ? (matchCount / messyWords.length) : 0;

    // Score 2: string similarity
    const similarityScore = stringSimilarity.compareTwoStrings(normMessy, normClean);

    // Score 3: trigram bonus
    const messyArr = normMessy.split(/\s+/);
    let consecutiveBonus = 0;
    for (let i = 0; i < messyArr.length - 2; i++) {
        const trigram = messyArr.slice(i, i + 3).join(' ');
        if (normClean.includes(trigram)) {
            consecutiveBonus += 0.1;
        }
    }
    consecutiveBonus = Math.min(consecutiveBonus, 0.3);

    const finalScore = (overlapScore * 0.5) + (similarityScore * 0.3) + consecutiveBonus;
    return finalScore;
}

// --- 4. ELASTIC SLIDING WINDOW (Improved, keeps duplicates) ---
function extractBestSegment(messyText, cleanParagraph) {
    const messyWords = messyText.trim().split(/\s+/);
    const cleanWords = cleanParagraph.trim().split(/\s+/);
    const targetLen = messyWords.length;

    if (targetLen < 3) return cleanParagraph;

    let bestScore = 0;
    let bestSegment = cleanParagraph;

    const minLen = Math.max(1, Math.floor(targetLen * 0.7));
    const maxLen = Math.min(cleanWords.length, Math.ceil(targetLen * 1.4));

    const normMessy = normalizeText(messyText);
    const messyArr = normMessy.split(/\s+/);

    for (let windowSize = minLen; windowSize <= maxLen; windowSize++) {
        for (let i = 0; i <= cleanWords.length - windowSize; i++) {
            const windowText = cleanWords.slice(i, i + windowSize).join(' ');
            const normWindow = normalizeText(windowText);

            let simScore = stringSimilarity.compareTwoStrings(normMessy, normWindow);

            let trigramBonus = 0;
            for (let j = 0; j < messyArr.length - 2; j++) {
                const trigram = messyArr.slice(j, j + 3).join(' ');
                if (normWindow.includes(trigram)) trigramBonus += 0.05;
            }

            const totalScore = simScore + Math.min(trigramBonus, 0.2);

            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestSegment = windowText;
            }
        }
    }

    console.log(`🎯 Segment match score: ${bestScore.toFixed(3)}`);
    return bestSegment;
}

// --- 5. SUBMIT HELPER ---
async function submitTask(page) {
    await page.locator('button[aria-label="submit"]').first().click();
    try {
        const ignoreBtn = page.locator('[data-testid="dialog-ok-button"]');
        await ignoreBtn.waitFor({ state: 'visible', timeout: 1500 });
        console.log("⚠ Warning popped up. Clicking 'Ignore & Submit'.");
        await humanPause(300, 500);
        await ignoreBtn.click();
    } catch (e) {
        console.log("✔ Submitted cleanly.");
    }
    await page.waitForURL('**/data?tab=**', { timeout: 10000 }).catch(() => {});
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();

  console.log(`Found ${pages.length} open tabs:`);
  pages.forEach((p, i) => console.log(`  Tab ${i}: ${p.url()}`));

  const page = pages.find(p => p.url().includes('scale.dingtalk.com/projects')) || pages[0];
  console.log(`✅ Using tab: ${page.url()}`);

  let lastTaskID = "";

  console.log("--- FAST AUTO-SUBMITTER ACTIVE ---");

  while (true) {
    try {
      await humanPause(500, 800);

      const rows = await page.locator('.lsf-table-row').all();
      let foundOnScreen = false;

      for (const row of rows) {

        const checkbox = row.locator('input[aria-label^="Select Task"]');
        if (!(await checkbox.isVisible().catch(() => false))) continue;

        const ariaLabel = await checkbox.getAttribute('aria-label');
        if (!ariaLabel) continue;
        const currentID = ariaLabel.replace('Select Task ', '').trim();

        const cells = await row.locator('.lsf-table__cell').all();
        let countText = "";

        if (cells.length > 5) {
            const countCell = row.locator('div:nth-child(10) > div');
            if (await countCell.isVisible()) countText = await countCell.innerText();
        } else if (cells.length >= 2) {
            countText = await cells[1].innerText();
        }

        countText = countText ? countText.trim() : "";

        if (countText === "0" && currentID !== lastTaskID) {
          console.log(`\n🎯 Eyeing Task: ${currentID}...`);

          await humanPause(300, 500);

          if (cells.length >= 2) {
              await cells[1].dblclick({ force: true });
          } else {
              await row.dblclick({ force: true });
          }

          lastTaskID = currentID;

          await page.waitForURL('**/data?**task=**', { timeout: 10000 });
          console.log("👀 Task opened. Reading screen...");
          await humanPause(500, 800);

          await page.click('#waveform-layer-main');
          await humanPause(300, 500);

          const textBox = page.locator('textarea, [contenteditable="true"], .lsf-text-area__input').first();
          await textBox.waitFor({ state: 'visible' });

          let screenSnippet = await textBox.inputValue() || await textBox.textContent() || "";
          screenSnippet = screenSnippet.trim();

          console.log(`📋 Screen snippet: "${screenSnippet}"`);

          if (screenSnippet.length > 5) {
            let bestScore = 0;
            let bestParagraph = "";

            // Log scores for all paragraphs for tuning
            for (const cleanPara of cleanParagraphs) {
                const score = getFingerprintScore(screenSnippet, cleanPara);
                console.log(`  Score ${score.toFixed(3)}: "${cleanPara.substring(0, 60)}..."`);
                if (score > bestScore) {
                    bestScore = score;
                    bestParagraph = cleanPara;
                }
            }

            console.log(`📊 Best paragraph score: ${bestScore.toFixed(3)}`);

            if (bestScore > 0.35) {
              // High confidence — use matched and extracted segment
              const finalPastedText = extractBestSegment(screenSnippet, bestParagraph);
              console.log(`📝 Final pasted: "${finalPastedText}"`);

              await humanPause(200, 400);
              await textBox.focus();
              await page.keyboard.press('Control+A');
              await humanPause(100, 200);
              await page.keyboard.press('Backspace');
              await humanPause(200, 300);
              await textBox.fill(finalPastedText.trim());
              await humanPause(150, 250);
              await page.keyboard.press('Space');
              await humanPause(100, 150);
              await page.keyboard.press('Backspace');
              console.log(`✔ Pasted clean text.`);

              console.log("🧐 Reviewing work before submitting...");
              const wordCount = finalPastedText.split(/\s+/).length;
              const reviewTime = Math.max(3000, wordCount * 200);
              console.log(`⏳ Simulated listening time: ${(reviewTime/1000).toFixed(1)}s`);
              await humanPause(reviewTime, reviewTime + 1000);

              console.log("🖱 Clicking Submit.");
              await submitTask(page);
              console.log("☕ Taking a breath...");
              await humanPause(1000, 1500);

            } else if (bestScore > 0.2) {
              // Low confidence — submit original snippet as fallback
              console.log("⚠ Low confidence match. Submitting original snippet as fallback.");
              await textBox.focus();
              await page.keyboard.press('Control+A');
              await humanPause(100, 200);
              await page.keyboard.press('Backspace');
              await humanPause(200, 300);
              await textBox.fill(screenSnippet.trim());
              await humanPause(150, 250);
              await page.keyboard.press('Space');
              await humanPause(100, 150);
              await page.keyboard.press('Backspace');

              const wordCount = screenSnippet.split(/\s+/).length;
              const reviewTime = Math.max(3000, wordCount * 200);
              console.log(`⏳ Simulated listening time: ${(reviewTime/1000).toFixed(1)}s`);
              await humanPause(reviewTime, reviewTime + 1000);

              console.log("🖱 Clicking Submit.");
              await submitTask(page);
              console.log("☕ Taking a breath...");
              await humanPause(1000, 1500);

            } else {
              // No match at all — skip
              console.log("⚠ No confident match found. Skipping.");
              await page.goBack();
              await humanPause(500, 800);
            }

          } else {
            console.log(`⚠ Skipped: Text box was empty or too short. (${screenSnippet.length} chars)`);
            await page.goBack();
            await humanPause(500, 800);
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
        await humanPause(500, 800);
      }
    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
      await humanPause(500, 1000);
    }
  }
})();