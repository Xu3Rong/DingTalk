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
  PROJECT_ID: '39649',
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

async function smoothScroll(page, selector, pixels) {
  await page.evaluate(async ({ selector, pixels }) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const direction = pixels > 0 ? 1 : -1;
    let remaining = Math.abs(pixels);
    while (remaining > 0) {
      const step = Math.min(remaining, Math.floor(Math.random() * 50) + 50);
      el.scrollTop += step * direction;
      remaining -= step;
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 15));
    }
  }, { selector, pixels });
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
  log('   ⏳ Auditor reading transcript...');
  for (let i = 0; i < 20; i++) {
    try {
      await page.waitForSelector(TEXTAREA_SEL, { state: 'visible', timeout: 3000 });
      let v = await page.locator(TEXTAREA_SEL).first().inputValue().catch(() => '');
      if (!v) v = await page.locator(TEXTAREA_SEL).first().textContent().catch(() => '');
      if (v && v.trim().length > 5) return v.trim();
    } catch (e) { }
    await sleep(500);
  }
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
      const rows = await page.locator('.lsf-table-row').all();
      let processed = false;

      for (const row of rows) {
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

        const checkbox = row.locator('.lsf-select-row input, input[aria-label^="Select Task"]').first();
        const ariaLabel = await checkbox.getAttribute('aria-label').catch(() => '');
        const taskID = ariaLabel ? ariaLabel.replace('Select Task ', '').trim() : 'Unknown';

        // History check
        if (sweepHistory.has(taskID)) continue;

        if (taskID !== lastTaskID) {
          log(`\n🕵️ Auditing Task ${taskID}... [col1='${col1}' col2='${col2}' col10='${col10}']`);

          // Humanised Start
          await row.hover({ force: true }).catch(() => { });
          await sleep(200, 400);

          // Mark as done immediately
          sweepHistory.add(taskID);
          lastTaskID = taskID;

          // Open Task (Identical Cell Click logic to ok.js)
          if (col1 === '0') await cells[1].dblclick({ force: true });
          else if (col2 === '0') await cells[2].dblclick({ force: true });
          else await row.dblclick({ force: true });

          await page.evaluate(() => window.getSelection().removeAllRanges()).catch(() => { });

          // Wait for UI
          await page.waitForSelector('#waveform-layer-main', { timeout: 10000 }).catch(() => { });
          
          log("   ⏳ Polling audio metadata...");
          const durationInput = page.locator('[data-testid="timebox-end-time"] input').first();
          let rawDur = "";
          for (let i = 0; i < 40; i++) {
            rawDur = await durationInput.inputValue().catch(e => "");
            if (rawDur && rawDur.length >= 5 && !rawDur.startsWith("00:00:00")) break;
            await sleep(500);
          }

          log(`   🖱️ Waveform click (Metadata: ${rawDur || 'None'})...`);
          await page.click('#waveform-layer-main', { force: true, position: { x: 50, y: 50 } }).catch(() => { });
          await sleep(2000, 3000); 
          
          const snippet = await readTextarea(page);

          if (snippet && snippet.length > 5) {
            log(`   ✅ Extractions recorded.`, { event: "extraction_collected", taskID, rawSnippet: snippet });
            const readPause = Math.floor(Math.random() * 800) + 1200;
            log(`   🤔 Scanned for ${(readPause/1000).toFixed(1)}s`);
            await sleep(readPause);
          } else {
            log(`   ⚠ Empty snippet.`);
          }

          // --- FAST EXIT (ESCAPE) ---
          log(`   🔙 Returning to table (Escape)...`);
          await page.keyboard.press('Escape').catch(() => { });
          await sleep(1200, 1800); // Wait for modal to close

          processed = true;
          isVerifying = false;
          break; // Return to while(true) to re-poll rows
        }
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
          await smoothScroll(page, TABLE_SCROLLER, 1000);
          await sleep(1000, 2000);
        }
      }
    } catch (e) {
      log(`   ❌ Loop error: ${e.message}`);
      await sleep(2000);
    }
  }
})();