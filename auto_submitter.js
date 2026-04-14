const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');

// ============================================================
// 0. CONFIG
// ============================================================
const CONFIG = {
  HIGH_CONFIDENCE_THRESHOLD: 0.40,
  LOW_CONFIDENCE_THRESHOLD:  0.24,
  AMBIGUITY_GAP_THRESHOLD:   0.00,  // pause if top-2 scores within this gap
  WORDS_PER_SECOND:          1.55,
  LENGTH_PENALTY_WEIGHT:     0.25,
  LENGTH_FILTER_TOLERANCE:   2.2,   // skip chunks > 2.2x or < 1/2.2x expected words
  LOG_FILE:                  path.join(__dirname, `session_${Date.now()}.log`),
  BEEP:                      '\u0007',
};

// ============================================================
// 1. LOGGER
// ============================================================
const logEntries = [];

function logTask(entry) {
  logEntries.push({ timestamp: new Date().toISOString(), ...entry });
  fs.appendFileSync(
    CONFIG.LOG_FILE,
    JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n'
  );
}

function flushLog() {
  console.log(`\n📄 Session log: ${CONFIG.LOG_FILE}`);
  console.log(`   Total tasks: ${logEntries.length}`);
  const flagged = logEntries.filter(
    e => e.status === 'error' || e.status === 'skipped' || e.status === 'paused'
  );
  if (flagged.length > 0) {
    console.log(`   ⚠ Flagged for review: ${flagged.length}`);
    flagged.forEach(e =>
      console.log(`     - Task ${e.taskID}: ${e.status} | ${e.reason || ''}`)
    );
  }
}

// ============================================================
// 2. HUMAN BEHAVIOR
// ============================================================
const humanPause = (min, max) =>
  new Promise(r =>
    setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min)
  );

// ============================================================
// 3. LOAD & CHUNK SCRIPTS.TXT INTO SENTENCE WINDOWS
// ============================================================
const filePath = path.join(__dirname, 'scripts.txt');
let cleanChunks = [];

try {
  const rawContent = fs.readFileSync(filePath, 'utf8');

  // Split on sentence boundaries
  const allSentences = rawContent
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  if (allSentences.length === 0) {
    console.log('❌ scripts.txt has no sentences. Exiting.');
    process.exit(1);
  }

  // Build overlapping windows of 1-5 sentences
  // Covers clip sizes from ~5s (1 sentence) to ~40s (5 sentences)
  for (let i = 0; i < allSentences.length; i++) {
    // Single sentence
    cleanChunks.push(allSentences[i]);

    // Pair
    if (i + 1 < allSentences.length)
      cleanChunks.push(allSentences[i] + ' ' + allSentences[i + 1]);

    // Triple
    if (i + 2 < allSentences.length)
      cleanChunks.push(
        allSentences[i] + ' ' +
        allSentences[i + 1] + ' ' +
        allSentences[i + 2]
      );

    // Quad
    if (i + 3 < allSentences.length)
      cleanChunks.push(
        allSentences[i] + ' ' +
        allSentences[i + 1] + ' ' +
        allSentences[i + 2] + ' ' +
        allSentences[i + 3]
      );

    // Quint (covers longer 38s+ clips)
    if (i + 4 < allSentences.length)
      cleanChunks.push(
        allSentences[i] + ' ' +
        allSentences[i + 1] + ' ' +
        allSentences[i + 2] + ' ' +
        allSentences[i + 3] + ' ' +
        allSentences[i + 4]
      );
  }

  console.log(
    `✅ Loaded ${allSentences.length} sentences → ${cleanChunks.length} sentence-window chunks`
  );
} catch (err) {
  console.log('❌ Cannot read scripts.txt:', err.message);
  process.exit(1);
}

// ============================================================
// 4. TEXT NORMALIZATION (conservative — no prefix stripping)
// ============================================================
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/%/g, ' peratus')
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// 5. DURATION HELPERS
// ============================================================
function parseDuration(value) {
  // Format: 00:00:38:600
  const parts = value.split(':');
  if (parts.length !== 4) return null;
  return (
    parseInt(parts[0]) * 3600 +
    parseInt(parts[1]) * 60 +
    parseInt(parts[2]) +
    parseInt(parts[3]) / 1000
  );
}

function expectedWordCount(durationSeconds) {
  return Math.round(durationSeconds * CONFIG.WORDS_PER_SECOND);
}

function wordCount(text) {
  return text.trim().split(/\s+/).length;
}

// ============================================================
// 6. LENGTH PLAUSIBILITY
// ============================================================
function getLengthPlausibilityScore(durationSeconds, chunk) {
  if (!durationSeconds) return 1.0;
  const expected = expectedWordCount(durationSeconds);
  const actual   = wordCount(chunk);
  return Math.min(expected, actual) / Math.max(expected, actual);
}

function isLengthPlausible(durationSeconds, chunk) {
  if (!durationSeconds) return true;
  const expected = expectedWordCount(durationSeconds);
  const actual   = wordCount(chunk);
  return (
    actual <= expected * CONFIG.LENGTH_FILTER_TOLERANCE &&
    actual >= expected / CONFIG.LENGTH_FILTER_TOLERANCE
  );
}

// ============================================================
// 7. FINGERPRINT SCORER
// ============================================================
function getFingerprintScore(messyText, cleanChunk) {
  const normMessy = normalizeText(messyText);
  const normClean = normalizeText(cleanChunk);

  const fillerWords = new Set([
    'yang', 'dan', 'dia', 'ini', 'itu', 'akan', 'untuk', 'dengan',
    'dari', 'pada', 'oleh', 'ke', 'di', 'ia', 'si', 'tu', 'ni',
    'juga', 'atau', 'pun', 'saja', 'sahaja', 'lagi', 'sudah',
    'telah', 'sedang', 'boleh', 'tidak', 'tak', 'ada', 'satu',
    'kami', 'kita', 'anda', 'saya', 'mereka', 'kamu',
  ]);

  const messyWords = [
    ...new Set(
      normMessy
        .split(/\s+/)
        .filter(w => (w.length > 3 || !isNaN(w)) && !fillerWords.has(w))
    ),
  ];

  // Score 1: keyword overlap
  let matchCount = 0;
  messyWords.forEach(w => { if (normClean.includes(w)) matchCount++; });
  const overlapScore = messyWords.length > 0 ? matchCount / messyWords.length : 0;

  // Score 2: string similarity
  const simScore = stringSimilarity.compareTwoStrings(normMessy, normClean);

  // Score 3: trigram bonus — strongest signal for distinguishing near-identical paragraphs
  const messyArr = normMessy.split(/\s+/);
  let trigramBonus = 0;
  for (let i = 0; i < messyArr.length - 2; i++) {
    const tg = messyArr.slice(i, i + 3).join(' ');
    if (normClean.includes(tg)) trigramBonus += 0.10;
  }
  trigramBonus = Math.min(trigramBonus, 0.40);

  // Score 4: bigram bonus
  let bigramBonus = 0;
  for (let i = 0; i < messyArr.length - 1; i++) {
    const bg = messyArr.slice(i, i + 2).join(' ');
    if (normClean.includes(bg)) bigramBonus += 0.03;
  }
  bigramBonus = Math.min(bigramBonus, 0.15);

  // Score 5: anchor bonus — first & last 3 words pin position in the script
  let anchorBonus = 0;
  if (messyArr.length >= 3) {
    const openTg  = messyArr.slice(0, 3).join(' ');
    const closeTg = messyArr.slice(-3).join(' ');
    if (normClean.includes(openTg))  anchorBonus += 0.12;
    if (normClean.includes(closeTg)) anchorBonus += 0.12;
  }

  return (
    overlapScore  * 0.22 +
    simScore      * 0.13 +
    trigramBonus  * 0.38 +
    bigramBonus   * 0.10 +
    anchorBonus   * 0.17
  );
}

// ============================================================
// 8. SANITY CHECK
// ============================================================
function sanityCheck(pastedText, durationSeconds) {
  if (!durationSeconds) return { ok: true };
  const expected = expectedWordCount(durationSeconds);
  const actual   = wordCount(pastedText);
  const ratio    = actual / expected;
  if (ratio < 0.35 || ratio > 2.8) {
    return {
      ok: false,
      reason: `Word count mismatch: ${actual} words pasted, expected ~${expected} for ${durationSeconds.toFixed(1)}s`,
    };
  }
  return { ok: true };
}

// ============================================================
// 9. PAUSE & ALERT
// ============================================================
async function pauseForReview(reason) {
  process.stdout.write(CONFIG.BEEP);
  console.log(`\n🚨 PAUSED — ${reason}`);
  console.log('   Press ENTER to skip this task and continue...');
  await new Promise(resolve => process.stdin.once('data', resolve));
}

// ============================================================
// 10. SUBMIT HELPER
// ============================================================
async function submitTask(page) {
  await page.locator('button[aria-label="submit"]').first().click();
  try {
    const ignoreBtn = page.locator('[data-testid="dialog-ok-button"]');
    await ignoreBtn.waitFor({ state: 'visible', timeout: 1500 });
    console.log('⚠ Warning dialog — clicking Ignore & Submit.');
    await humanPause(300, 500);
    await ignoreBtn.click();
  } catch {
    console.log('✔ Submitted cleanly.');
  }
  await page.waitForURL('**/data?tab=**', { timeout: 10000 }).catch(() => {});
}

// ============================================================
// 11. SAFE BACK NAVIGATION
// ============================================================
async function safeGoBack(page) {
  try {
    await page.goBack({ timeout: 5000 });
    await humanPause(500, 800);
  } catch {
    console.log('⚠ goBack failed — attempting direct project nav.');
    try {
      const url          = page.url();
      const projectMatch = url.match(/\/projects\/(\d+)/);
      if (projectMatch) {
        await page.goto(`/projects/${projectMatch[1]}/data`, { timeout: 8000 });
        await humanPause(600, 1000);
      }
    } catch {
      console.log('❌ Cannot navigate back. Manual intervention needed.');
    }
  }
}

// ============================================================
// 12. PASTE TEXT INTO TEXTAREA
// ============================================================
async function pasteIntoTextBox(page, textBox, text) {
  await textBox.focus();
  await page.keyboard.press('Control+A');
  await humanPause(100, 200);
  await page.keyboard.press('Backspace');
  await humanPause(200, 300);
  await textBox.fill(text.trim());
  await humanPause(150, 250);
  await page.keyboard.press('Space');
  await humanPause(100, 150);
  await page.keyboard.press('Backspace');
}

// ============================================================
// 13. MAIN LOOP
// ============================================================
(async () => {
  process.on('SIGINT', () => { flushLog(); process.exit(0); });
  process.on('exit',   () => { flushLog(); });

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const pages   = context.pages();

  console.log(`Found ${pages.length} open tab(s):`);
  pages.forEach((p, i) => console.log(`  Tab ${i}: ${p.url()}`));

  const page =
    pages.find(p => p.url().includes('scale.dingtalk.com/projects')) || pages[0];
  console.log(`✅ Using tab: ${page.url()}`);

  let lastTaskID = '';
  console.log('\n--- AUTO-SUBMITTER ACTIVE ---\n');

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
        let countText = '';

        if (cells.length > 5) {
          const countCell = row.locator('div:nth-child(10) > div');
          if (await countCell.isVisible()) countText = await countCell.innerText();
        } else if (cells.length >= 2) {
          countText = await cells[1].innerText();
        }

        countText = countText ? countText.trim() : '';

        if (countText !== '0' || currentID === lastTaskID) continue;

        console.log(`\n🎯 Task: ${currentID}`);
        await humanPause(300, 500);

        if (cells.length >= 2) {
          await cells[1].dblclick({ force: true });
        } else {
          await row.dblclick({ force: true });
        }

        lastTaskID = currentID;
        await page.waitForURL('**/data?**task=**', { timeout: 10000 });
        console.log('👀 Task opened.');
        await humanPause(500, 800);

        // Click waveform to trigger audio load
        await page.click('#waveform-layer-main', {
          }).catch(() => {});
        await humanPause(300, 500);

        // --- Read clip duration from DOM ---
        let clipDuration = null;
        try {
          const durInput = page
            .locator('[data-testid="timebox-end-time"] input')
            .first();
          await durInput.waitFor({ state: 'visible', timeout: 3000 });
          const durVal = await durInput.inputValue();
          clipDuration = parseDuration(durVal);
          if (clipDuration) {
            console.log(
              `⏱ Duration: ${clipDuration.toFixed(1)}s` +
              ` (~${expectedWordCount(clipDuration)} words expected)`
            );
          }
        } catch {
          console.log('⚠ Could not read duration.');
        }

        // --- Read transcript snippet ---
        const textBox = page
          .locator('textarea, [contenteditable="true"], .lsf-text-area__input')
          .first();
        await textBox.waitFor({ state: 'visible' });

        let screenSnippet =
          (await textBox.inputValue().catch(() => '')) ||
          (await textBox.textContent().catch(() => '')) ||
          '';
        screenSnippet = screenSnippet.trim();
        console.log(
          `📋 Snippet (${wordCount(screenSnippet)} words): ` +
          `"${screenSnippet.substring(0, 80)}..."`
        );

        // --- Guard: empty snippet ---
        if (screenSnippet.length < 5) {
          console.log('⚠ Snippet too short. Skipping.');
          logTask({
            taskID: currentID, duration: clipDuration,
            snippet: screenSnippet, status: 'skipped', reason: 'empty snippet',
          });
          await safeGoBack(page);
          foundOnScreen = true;
          break;
        }

        // --- Score all chunks ---
        let bestScore   = 0;
        let secondScore = 0;
        let bestChunk   = '';

        for (const chunk of cleanChunks) {
          if (!isLengthPlausible(clipDuration, chunk)) continue;

          let score = getFingerprintScore(screenSnippet, chunk);

          // Blend in length plausibility
          const lenScore = getLengthPlausibilityScore(clipDuration, chunk);
          score = score * (
            1 - CONFIG.LENGTH_PENALTY_WEIGHT +
            CONFIG.LENGTH_PENALTY_WEIGHT * lenScore
          );

          if (score > bestScore) {
            secondScore = bestScore;
            bestScore   = score;
            bestChunk   = chunk;
          } else if (score > secondScore) {
            secondScore = score;
          }
        }

        const gap = bestScore - secondScore;
        console.log(
          `📊 Best: ${bestScore.toFixed(3)} | Second: ${secondScore.toFixed(3)}` +
          ` | Gap: ${gap.toFixed(3)}`
        );
        if (bestChunk) {
          console.log(`   Match: "${bestChunk.substring(0, 100)}"`);
        }

        // --- Ambiguity check ---
        const isAmbiguous =
          bestScore > CONFIG.LOW_CONFIDENCE_THRESHOLD &&
          gap < CONFIG.AMBIGUITY_GAP_THRESHOLD;

        if (isAmbiguous) {
          const reason =
            `Ambiguous — scores ${bestScore.toFixed(3)} vs ` +
            `${secondScore.toFixed(3)} (gap ${gap.toFixed(3)})`;
          console.log(`⚠ ${reason}`);
          await pauseForReview(`Task ${currentID}: ${reason}`);
          logTask({
            taskID: currentID, duration: clipDuration,
            snippet: screenSnippet, bestScore, secondScore,
            status: 'paused', reason,
          });
          await safeGoBack(page);
          foundOnScreen = true;
          break;
        }

        // ── HIGH CONFIDENCE ──────────────────────────────────
        if (bestScore >= CONFIG.HIGH_CONFIDENCE_THRESHOLD) {
          const sanity = sanityCheck(bestChunk, clipDuration);
          if (!sanity.ok) {
            console.log(`⚠ Sanity check failed: ${sanity.reason}`);
            await pauseForReview(`Task ${currentID}: ${sanity.reason}`);
            logTask({
              taskID: currentID, duration: clipDuration,
              snippet: screenSnippet, pasted: bestChunk,
              bestScore, status: 'paused', reason: sanity.reason,
            });
            await safeGoBack(page);
            foundOnScreen = true;
            break;
          }

          console.log(`📝 Pasting (high confidence)`);
          await humanPause(200, 400);
          await pasteIntoTextBox(page, textBox, bestChunk);
          console.log('✔ Pasted.');

          const reviewTime = Math.max(3000, wordCount(bestChunk) * 200);
          console.log(`⏳ Review pause: ${(reviewTime / 1000).toFixed(1)}s`);
          await humanPause(reviewTime, reviewTime + 1000);

          console.log('🖱 Submitting...');
          await submitTask(page);

          logTask({
            taskID: currentID, duration: clipDuration,
            snippet: screenSnippet.substring(0, 100),
            pasted: bestChunk.substring(0, 100),
            bestScore, secondScore, status: 'submitted',
          });

          console.log('☕ Cooling down...');
          await humanPause(1000, 1500);

        // ── LOW CONFIDENCE — use original snippet ────────────
        } else if (bestScore >= CONFIG.LOW_CONFIDENCE_THRESHOLD) {
          console.log('⚠ Low confidence. Submitting original snippet as fallback.');

          const sanity = sanityCheck(screenSnippet, clipDuration);
          if (!sanity.ok) {
            console.log(`⚠ Sanity check on snippet: ${sanity.reason}`);
            await pauseForReview(`Task ${currentID}: low-conf + ${sanity.reason}`);
            logTask({
              taskID: currentID, duration: clipDuration,
              snippet: screenSnippet, bestScore,
              status: 'paused', reason: `low confidence + ${sanity.reason}`,
            });
            await safeGoBack(page);
            foundOnScreen = true;
            break;
          }

          await humanPause(200, 400);
          await pasteIntoTextBox(page, textBox, screenSnippet);

          const reviewTime = Math.max(3000, wordCount(screenSnippet) * 200);
          await humanPause(reviewTime, reviewTime + 1000);

          console.log('🖱 Submitting (fallback)...');
          await submitTask(page);

          logTask({
            taskID: currentID, duration: clipDuration,
            snippet: screenSnippet.substring(0, 100),
            bestScore, secondScore,
            status: 'submitted-fallback', reason: 'low confidence',
          });

          await humanPause(1000, 1500);

        // ── NO MATCH ─────────────────────────────────────────
        } else {
          console.log(`⚠ Score ${bestScore.toFixed(3)} below threshold. Skipping.`);
          logTask({
            taskID: currentID, duration: clipDuration,
            snippet: screenSnippet.substring(0, 100),
            bestScore, status: 'skipped', reason: 'score below threshold',
          });
          await safeGoBack(page);
          await humanPause(500, 800);
        }

        foundOnScreen = true;
        break;
      }

      // Scroll if nothing actionable found on screen
      if (!foundOnScreen) {
        await page.evaluate(() => {
          const scroller = document.querySelector(
            '.lsf-table [style*="overflow: auto"]'
          );
          if (scroller) scroller.scrollTop += 400;
        });
        await humanPause(500, 800);
      }

    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
      logTask({ status: 'error', reason: e.message });
      await humanPause(500, 1000);
    }
  }
})();