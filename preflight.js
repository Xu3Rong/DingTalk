/**
 * preflight.js — High-Speed Auditor Edition (Strict Mode)
 * Crawls through unannotated tasks to extract raw ASR snippets.
 * Strict column-based discovery to match ok.js.
 */

'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── 0. SYSTEM CONFIG ────────────────────────────────────────────────────────
const CONFIG = {
  PROJECT_ID: '42652',
  get PROJECT_URL() { return `https://scale.dingtalk.com/projects/${this.PROJECT_ID}/data`; },
  CDP_URL: 'http://127.0.0.1:9222',
  POLL_INTERVAL_MS: 1500,
  BEEP: '\u0007',
};

// ─── 1. LOGGING SETUP ────────────────────────────────────────────────────────
const logDir = path.join(__dirname, 'logs');
const preflightLogDir = path.join(logDir, 'preflight');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
if (!fs.existsSync(preflightLogDir)) fs.mkdirSync(preflightLogDir);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const humanLogFile = path.join(logDir, `preflight_${CONFIG.PROJECT_ID}_${timestamp}_human.log`);
const preflightLogFile = path.join(preflightLogDir, `proj${CONFIG.PROJECT_ID}_${timestamp}_preflight.jsonl`);

function log(msg, data = null) {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${msg}`;

  console.log(line);
  try { fs.appendFileSync(humanLogFile, line + '\n', 'utf8'); } catch (err) { }

  if (data && data.event === "extraction_collected") {
    try {
      const entry = JSON.stringify({ taskID: data.taskID, rawSnippet: data.rawSnippet });
      fs.appendFileSync(preflightLogFile, entry + '\n', 'utf8');
    } catch (err) { }
  }
}

const sleep = (min, max = min) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

// ─── 2. DOM HELPERS ──────────────────────────────────────────────────────────
async function isScrollerAtBottom(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true;
    return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 5);
  }, selector);
}

async function scrollToTop(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollTop = 0;
  }, selector);
}

async function quickOverlapScroll(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    
    // Halved the jump distance for a much smaller, stabler overlap
    const jumpDistance = Math.max(100, Math.floor(el.clientHeight / 2));
    
    // Instant jump exactly like `jump_first.js` to avoid React lag/stuttering!
    el.scrollTop += jumpDistance;
  }, selector);
}

async function getVerifiedTaskID(page) {
  const url = page.url();
  const match = url.match(/[?&]task=(\d+)/);
  if (match) return match[1];
  try {
    const uiID = await page.locator('.lsf-current-task__task-id').innerText({ timeout: 2000 });
    if (uiID && uiID.trim()) return uiID.trim().replace('#', '').trim();
  } catch (e) { }
  return null;
}

const TEXTAREA_SEL = 'textarea[name="Annotation Result"]';
async function readTextarea(page) {
  log('   ⏳ Polling transcript content...');
  for (let i = 0; i < 30; i++) {
    try {
      await page.locator(TEXTAREA_SEL).first().waitFor({ state: 'visible', timeout: 5000 });
      let v = await page.locator(TEXTAREA_SEL).first().inputValue().catch(() => '');
      if (!v) v = await page.locator(TEXTAREA_SEL).first().textContent().catch(() => '');

      if (v && v.trim().length > 5) return v.trim();
    } catch (e) { }
    process.stdout.write('.');
    await sleep(500);
  }
  process.stdout.write('\n');
  return '';
}

// ─── 3. MAIN LOOP ─────────────────────────────────────────────────────────────
(async () => {
  log(`🔌 Auditor connecting to CDP...`);
  let browser;
  try {
    browser = await chromium.connectOverCDP(CONFIG.CDP_URL);
  } catch (e) {
    console.error(`❌ Connection failed.`);
    process.exit(1);
  }

  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects'));

  if (!page) {
    log("❌ DingTalk tab not found.");
    process.exit(1);
  }

  log("\n━━━ AUDITOR ACTIVE ━━━\n");
  log(`📄 Preflight Log: ${preflightLogFile}\n`);

  let lastTaskID = '';
  const sweepHistory = new Set();
  let isVerifying = false;
  const TABLE_SCROLLER = '.lsf-table [style*="overflow: auto"]';

  while (true) {
    try {
      await sleep(CONFIG.POLL_INTERVAL_MS);
      let processed = false;
      let targetTaskID = null;

      // ─── LADDER CRAWLER (QUICK SIBLING JUMP) ───
      // Since preflight.js never Submits, DingTalk never automatically cycles to the next task.
      // This explicitly locates the exact adjacent DOM node beneath the currently open task.
      const activeSelected = page.locator('.lsf-table__row-wrapper_selected').first();
      if (await activeSelected.isVisible().catch(() => false)) {
        const nextWrapper = page.locator('.lsf-table__row-wrapper_selected + .lsf-table__row-wrapper').first();
        if (await nextWrapper.isVisible().catch(() => false)) {
          const nextRow = nextWrapper.locator('.lsf-table-row').first();
          const pCells = await nextRow.locator('.lsf-table__cell').all();
          
          if (pCells.length >= 2) {
             const cell1 = await pCells[1].innerText().catch(() => '');
             const cell2 = pCells.length > 2 ? await pCells[2].innerText().catch(() => '') : '';
             
             if (cell1.trim() === '0' || cell2.trim() === '0') {
               const checkbox = nextRow.locator('.lsf-select-row input, input[aria-label^="Select Task"]').first();
               const ariaLabel = await checkbox.getAttribute('aria-label').catch(() => '');
               let taskID = ariaLabel ? ariaLabel.replace('Select Task ', '').trim() : 'Unknown';

               if (!sweepHistory.has(taskID) && taskID !== lastTaskID) {
                 log(`\n🪜 Climbing natively to next valid sibling (Task ${taskID})...`);
                 
                 // Precisely click the "0" cell, NEVER the whole row, because the row's center is the audio player!
                 if (cell1.trim() === '0') await pCells[1].dblclick({ force: true }).catch(() => {});
                 else if (cell2.trim() === '0') await pCells[2].dblclick({ force: true }).catch(() => {});
                 else await nextRow.dblclick({ force: true }).catch(() => {});
                 
                 await page.evaluate(() => window.getSelection().removeAllRanges()).catch(() => { });
                 targetTaskID = taskID;
                 processed = true;
               }
             }
          }
        }
      }

      // ─── FALLBACK SCANNER ───
      if (!processed) {
        const rows = await page.locator('.lsf-table-row').all();

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (processed) break;
        const cells = await row.locator('.lsf-table__cell').all();
        if (cells.length < 2) continue;

        // --- STRICT DISCOVERY (Identical to ok.js) ---
        const col1 = (await cells[1].innerText().catch(() => '')).trim();
        const col2 = cells.length > 2 ? (await cells[2].innerText().catch(() => '')).trim() : '';

        let col10 = '';
        if (cells.length > 5) {
          const countCell = row.locator('div:nth-child(10) > div');
          if (await countCell.isVisible().catch(() => false)) {
            col10 = (await countCell.innerText().catch(() => '')).trim();
          }
        }

        const isZeroRow = col1 === '0' || col2 === '0' || col10 === '0';
        if (!isZeroRow) continue;

        // Extract ID FIRST!
        const checkbox = row.locator('.lsf-select-row input, input[aria-label^="Select Task"]').first();
        const ariaLabel = await checkbox.getAttribute('aria-label').catch(() => '');
        let originalTaskID = ariaLabel ? ariaLabel.replace('Select Task ', '').trim() : 'Unknown';
        let taskID = originalTaskID;

        // History check instantly so we don't hover and auto-scroll past lazy-loaded tasks
        if (sweepHistory.has(taskID) || taskID === lastTaskID) continue;

        // --- PRE-AIM & DOM STABILITY FIX ---
        await row.hover({ force: true }).catch(() => { });
        await sleep(350, 650);

        // Verify the data stabilized.
        const stableCol1 = (await cells[1].innerText().catch(() => '')).trim();
        const stableCol2 = cells.length > 2 ? (await cells[2].innerText().catch(() => '')).trim() : '';
        let stableCol10 = '';
        if (cells.length > 5) {
            const countCell = row.locator('div:nth-child(10) > div');
            if (await countCell.isVisible().catch(() => false)) {
                stableCol10 = (await countCell.innerText().catch(() => '')).trim();
            }
        }

        const isStableZero = stableCol1 === '0' || stableCol2 === '0' || stableCol10 === '0';
        if (!isStableZero) continue;

        // Open Task (Identical Cell Click logic to ok.js)
        if (stableCol1 === '0') await cells[1].dblclick({ force: true });
        else if (stableCol2 === '0') await cells[2].dblclick({ force: true });
        else await row.dblclick({ force: true });

        await page.evaluate(() => window.getSelection().removeAllRanges()).catch(() => { });

        targetTaskID = taskID;
        processed = true;
        break; // Break the fallback scanner loop, let the unified processor handle it
      }
      } // End Fallback scanner

      // ─── UNIFIED TASK PROCESSOR ───
      if (processed && targetTaskID) {
          log(`\n🕵️ Auditing Task ${targetTaskID}...`);

          // Wait for UI to populate the audio workspace
          await page.waitForSelector('#waveform-layer-main', { timeout: 15000 }).catch(() => { });

          // --- VERIFY ID (The "Absolute Truth" fix) ---
          const verifiedID = await getVerifiedTaskID(page);
          if (verifiedID && verifiedID !== targetTaskID) {
            log(`   ⚠️ ID MISMATCH! Table said ${targetTaskID}, but UI/URL confirms ${verifiedID}. Correcting...`);
            sweepHistory.add(targetTaskID); // Block the "Wrong" ID from the table row
            targetTaskID = verifiedID; // Update to the real ID
          }
          lastTaskID = targetTaskID;
          sweepHistory.add(targetTaskID); // Block the "Verified" ID

          log("   ⏳ Polling audio metadata...");
          const durationInput = page.locator('[data-testid="timebox-end-time"] input').first();
          let rawDur = "";
          for (let i = 0; i < 40; i++) {
            rawDur = await durationInput.inputValue().catch(e => "");
            if (rawDur && rawDur.length >= 5 && rawDur !== "00:00:00" && rawDur !== "00:00:00:000") break;
            process.stdout.write(".");
            await sleep(500);
          }
          log(""); // newline after dots

          log(`   🖱️ Audio duration confirmed [${rawDur.trim() || 'None'}]. Clicking waveform...`);
          await page.click('#waveform-layer-main').catch(() => { });
          await sleep(1000, 1500);

          const snippet = await readTextarea(page);

          if (snippet && snippet.length > 5) {
            log(`   ✅ Extractions recorded.`, { event: "extraction_collected", taskID: targetTaskID, rawSnippet: snippet });
            const readPause = Math.floor(Math.random() * 800) + 1200;
            log(`   🤔 Scanned for ${(readPause / 1000).toFixed(1)}s`);
            await sleep(readPause);
          } else {
            log(`   ⚠ Empty snippet.`);
          }

          // --- FAST EXIT (STAY IN SPLIT PANE) ---
          log(`   ⏩ Audit complete. Staying in split-pane view to directly load next task from sidebar...`);
          await sleep(500, 800); // Tiny buffer for DingTalk data cleanup

          isVerifying = false;
      }

      if (!processed) {
        const atBottom = await isScrollerAtBottom(page, TABLE_SCROLLER);
        if (atBottom) {
          if (!isVerifying) {
            log("\n🔍 REACHED BOTTOM. Final sweep from top...");
            await scrollToTop(page, TABLE_SCROLLER);
            await sleep(3000);
            isVerifying = true;
          } else {
            log(`\n🏁 AUDIT COMPLETE. Found ${sweepHistory.size} unique tasks.`);
            process.exit(0);
          }
        } else {
          log(`   🔍 Scanning... [History: ${sweepHistory.size}]`);
          await quickOverlapScroll(page, TABLE_SCROLLER); // Instant, perfectly overlapped jump
          await sleep(600, 1000); // Shorter wait since the jump is instant
        }
      }
    } catch (e) {
      log(`   ❌ Loop error: ${e.message}`);
      await sleep(2000);
    }
  }
})();