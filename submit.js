/**
 * stealth_master.js — The Ultimate Hybrid Build (V2 - Hardened UI)
 * Features: Stealth Opera Launch, Elastic Trimming, Smart Ambiguity, 
 * Forgiving Anchors, Numeral Mapping, and Hardened DOM/UI interactions.
 */

'use strict';

const { chromium }       = require('playwright-extra');
const stealthPlugin      = require('puppeteer-extra-plugin-stealth');
const fs                 = require('fs');
const path               = require('path');
const readline           = require('readline');
const stringSimilarity   = require('string-similarity');

chromium.use(stealthPlugin());

// ─── 0. CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  // 👇 CHANGE THIS NUMBER WHEN YOUR PROJECT UPDATES 👇
  PROJECT_ID:            '35584', 
  get PROJECT_URL()      { return `https://scale.dingtalk.com/projects/${this.PROJECT_ID}/data`; },

  OPERA_PATH:            'C:\\Users\\User\\AppData\\Local\\Programs\\Opera\\opera.exe',
  USER_DATA_DIR:         'C:\\DingTalk\\stealth_data',

  HIGH_CONFIDENCE:       0.40,
  LOW_CONFIDENCE:        0.24,
  AMBIGUITY_GAP:         0.04,

  WORDS_PER_SECOND:      1.55,
  LENGTH_TOLERANCE:      2.2,

  POLL_INTERVAL_MS:      1500,
  BEEP:                  '\u0007'
};

const sleep = (min, max = min) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

// ─── 1. LOAD scripts.txt ─────────────────────────────────────────────────────
const SCRIPTS_PATH = path.join(__dirname, 'scripts.txt');
let cleanChunks = [];

(function loadScripts() {
  if (!fs.existsSync(SCRIPTS_PATH)) {
    console.error('❌ scripts.txt not found.');
    process.exit(1);
  }
  const raw = fs.readFileSync(SCRIPTS_PATH, 'utf8');
  const sentences = raw.replace(/\r\n/g, '\n').replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 15);

  // Create 1-to-5 sentence sliding windows
  for (let i = 0; i < sentences.length; i++) {
    for (let len = 1; len <= 5 && i + len <= sentences.length; len++) {
      cleanChunks.push(sentences.slice(i, i + len).join(' '));
    }
  }
  console.log(`✅ Loaded ${sentences.length} sentences → ${cleanChunks.length} window chunks`);
})();

// ─── 2. TEXT NORMALISATION (With Number Mapping) ──────────────────────────────
function normalize(text) {
  let norm = text.toLowerCase()
    .replace(/-/g, ' ').replace(/%/g, ' peratus')
    .replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();

  const magMap = {
    'bilion': '000000000', 'juta': '000000', 'ribu': '000', 
    'ratus': '00', 'puluh': '0', 'sebelas': '11', 'sepuluh': '10',
    'sifar': '0', 'kosong': '0', 'setengah': '0.5'
  };

  Object.keys(magMap).forEach(word => {
    norm = norm.replace(new RegExp(`\\b${word}\\b`, 'g'), magMap[word]);
  });
  return norm;
}

// ─── 3. DURATION & SANITY HELPERS ────────────────────────────────────────────
function parseDuration(val) {
  if (!val) return null;
  const p = val.split(':').map(Number);
  if (p.length === 4) return (p[0] * 3600) + (p[1] * 60) + p[2] + (p[3] / 1000);
  if (p.length === 3) return (p[0] * 60) + p[1] + (p[2] / 1000);
  if (p.length === 2) return p[0] + (p[1] / 1000);
  return null;
}

function expectedWords(sec) { return Math.round(sec * CONFIG.WORDS_PER_SECOND); }
function wordCount(text)     { return text.trim().split(/\s+/).length; }

function sanityCheck(text, sec) {
  if (!sec) return { ok: true };
  const exp = expectedWords(sec), act = wordCount(text), ratio = act / exp;
  if (ratio < 0.35 || ratio > 2.8)
    return { ok: false, reason: `Word count mismatch: ${act} pasted, ~${exp} expected for ${sec.toFixed(1)}s` };
  return { ok: true };
}

// ─── 4. FINGERPRINT SCORER & BEST MATCH ──────────────────────────────────────
const FILLER = new Set(['yang','dan','dia','ini','itu','akan','untuk','dengan','dari','pada','oleh','ke','di','ia','si','tu','ni','juga','atau','pun','saja','sahaja','lagi','sudah','telah','sedang','boleh','tidak','tak','ada','satu','kami','kita','anda','saya','mereka','kamu']);

function scoreChunk(messy, chunk) {
  const nm = normalize(messy), nc = normalize(chunk);
  const mArr = nm.split(/\s+/);
  const kw = [...new Set(mArr.filter(w => (w.length > 3 || !isNaN(w)) && !FILLER.has(w)))];

  const overlap = kw.length ? kw.filter(w => nc.includes(w)).length / kw.length : 0;
  const sim     = stringSimilarity.compareTwoStrings(nm, nc);

  let tri = 0, bi = 0;
  for (let i = 0; i < mArr.length - 2; i++) if (nc.includes(mArr.slice(i, i + 3).join(' '))) tri += 0.10;
  for (let i = 0; i < mArr.length - 1; i++) if (nc.includes(mArr.slice(i, i + 2).join(' '))) bi += 0.03;

  // Forgiving Anchors
  let anchor = 0;
  if (mArr.length >= 4) {
    if (nc.includes(mArr.slice(0, 3).join(' ')) || nc.includes(mArr.slice(1, 4).join(' '))) anchor += 0.12;
    if (nc.includes(mArr.slice(-3).join(' ')) || nc.includes(mArr.slice(-4, -1).join(' '))) anchor += 0.12;
  } else if (mArr.length === 3) {
    if (nc.includes(mArr.join(' '))) anchor += 0.24; 
  }

  return overlap * 0.22 + sim * 0.13 + Math.min(tri, 0.40) * 0.38 + Math.min(bi, 0.15) * 0.10 + anchor * 0.17;
}

function bestMatch(snippet, durationSec) {
  let best = 0, second = 0, bestChunk = '', secondChunk = '';
  
  for (const chunk of cleanChunks) {
    // Only filter chunks that are drastically too short for the audio
    if (durationSec) {
      const exp = expectedWords(durationSec);
      if (wordCount(chunk) < exp * 0.40) continue; 
    }
    
    let s = scoreChunk(snippet, chunk);
    
    if (s > best)        { second = best; secondChunk = bestChunk; best = s; bestChunk = chunk; }
    else if (s > second) { second = s; secondChunk = chunk; }
  }
  return { best, second, gap: best - second, chunk: bestChunk, secondChunk };
}

// ─── 5. ELASTIC TRIM ─────────────────────────────────────────────────────────
function trimToSnippetLength(snippetText, matchedChunk) {
  const snippetWords = snippetText.trim().split(/\s+/), chunkWords = matchedChunk.trim().split(/\s+/);
  if (chunkWords.length <= Math.ceil(snippetWords.length * 1.1)) return matchedChunk;

  const normSnippet = normalize(snippetText), snippetArr = normSnippet.split(/\s+/);
  const minLen = Math.max(1, Math.floor(snippetWords.length * 0.75));
  const maxLen = Math.min(chunkWords.length, Math.ceil(snippetWords.length * 1.35));

  let bestScore = -1, bestSeg = matchedChunk;
  for (let size = minLen; size <= maxLen; size++) {
    for (let i = 0; i <= chunkWords.length - size; i++) {
      const windowText = chunkWords.slice(i, i + size).join(' '), normWin = normalize(windowText);
      let s = stringSimilarity.compareTwoStrings(normSnippet, normWin);
      
      let tri = 0;
      for (let j = 0; j < snippetArr.length - 2; j++) {
        if (normWin.includes(snippetArr.slice(j, j + 3).join(' '))) tri += 0.05;
      }
      s += Math.min(tri, 0.20);

      if (s > bestScore) { bestScore = s; bestSeg = windowText; }
    }
  }
  return bestSeg;
}

// ─── 6. HARDENED DOM UI HELPERS ────────────────────────────────────────────────
async function pauseForReview(reason) {
  process.stdout.write(CONFIG.BEEP);
  console.log(`\n🚨 PAUSED — ${reason}\n   Press ENTER to skip and continue…`);
  return new Promise(resolve => process.stdin.once('data', resolve));
}

const TEXTAREA_SEL = 'textarea[name="Annotation Result"]';

async function readTextarea(page) {
  try {
    await page.locator(TEXTAREA_SEL).first().waitFor({ state: 'visible', timeout: 5000 });
    const v = await page.locator(TEXTAREA_SEL).first().inputValue().catch(() => '');
    if (v) return v.trim();
    return (await page.locator(TEXTAREA_SEL).first().textContent().catch(() => '')).trim();
  } catch { return ''; }
}

async function pasteText(page, text) {
  const box = page.locator(TEXTAREA_SEL).first();
  await box.focus();
  await page.keyboard.press('Control+A'); await sleep(80, 150);
  await page.keyboard.press('Backspace'); await sleep(100, 200);
  await box.fill(text.trim());            await sleep(100, 150);
  await page.keyboard.press('Space');     await sleep(60, 100);
  await page.keyboard.press('Backspace');
}

async function safeSubmit(page) {
  // Fuzzy selector: looks for a button with aria-label OR text containing 'submit', 'save', or 'confirm'
  const submitBtn = page.locator('button[aria-label*="submit" i], button:has-text("Submit"), button:has-text("Save")').first();
  await submitBtn.click();
  await sleep(500, 800);
  
  // Fuzzy dialog handler
  try { 
    const dialogBtn = page.locator('[data-testid*="ok" i], [data-testid*="confirm" i], button:has-text("Ignore"), button:has-text("OK")').first(); 
    await dialogBtn.waitFor({state:'visible', timeout: 1500}); 
    await dialogBtn.click(); 
  } catch {}
}

async function goBack(page) {
  try {
    await page.goBack({ timeout: 5000 });
    await sleep(400, 700);
  } catch {
    try {
      const m = page.url().match(/\/projects\/(\d+)/);
      const url = m ? `https://scale.dingtalk.com/projects/${m[1]}/data` : CONFIG.PROJECT_URL;
      await page.goto(url, { timeout: 8000 });
    } catch {
      console.log('   ❌ Cannot navigate back — manual intervention needed');
    }
  }
}

// ─── 7. MAIN LAUNCH & LOOP ───────────────────────────────────────────────────
(async () => {
  console.log("🚀 Launching Stealth Opera...");
  
  try {
    const context = await chromium.launchPersistentContext(CONFIG.USER_DATA_DIR, {
      executablePath: CONFIG.OPERA_PATH,
      headless: false,
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    
    console.log(`🌐 Navigating to Project ${CONFIG.PROJECT_ID}...`);
    await page.goto(CONFIG.PROJECT_URL);
    await page.waitForSelector('.lsf-table-row', { timeout: 30000 }).catch(() => {});

    if (process.stdin.isTTY) { readline.emitKeypressEvents(process.stdin); process.stdin.setRawMode(false); }
    let lastTaskID = '';
    console.log("\n━━━ BOT ACTIVE ━━━\n");

    while (true) {
      try {
        await sleep(CONFIG.POLL_INTERVAL_MS);
        const rows = await page.locator('.lsf-table-row').all();
        let processed = false;

        // Restored robust row checking
        for (const row of rows) {
          const cells = await row.locator('.lsf-table__cell').all();
          if (cells.length < 2) continue;
          
          const countText = (await cells[1].innerText().catch(() => '')).trim();
          const countCol3 = cells.length > 2 ? (await cells[2].innerText().catch(() => '')).trim() : "";
          
          if (countText === "0" || countCol3 === "0") {
            const checkbox = row.locator('.lsf-select-row input');
            const ariaLabel = (await checkbox.getAttribute('aria-label').catch(() => '')) || "";
            const taskID = ariaLabel.replace('Select Task ', '').trim();

            if (taskID && taskID !== lastTaskID) {
              
              console.log(`\n🎯 Task ${taskID}`);
              if (countText === "0") await cells[1].dblclick({ force: true });
              else await cells[2].dblclick({ force: true });
              
              // Clear annoying text highlighting caused by fast double clicks
              await page.evaluate(() => window.getSelection().removeAllRanges()).catch(()=>{});
              
              lastTaskID = taskID;

              // 1. Wait for canvas to be visible
              await page.waitForSelector('#waveform-layer-main', { timeout: 15000 }).catch(() => {});
              
              // 2. Wait for audio duration to populate (Polling up to 20s)
              const durationInput = page.locator('[data-testid="timebox-end-time"] input').first();
              let rawDur = "";
              for (let i = 0; i < 40; i++) {
                rawDur = await durationInput.inputValue().catch(() => "");
                if (rawDur && rawDur.length >= 5 && rawDur !== "00:00:00" && rawDur !== "00:00:00:000") break;
                await sleep(500);
              }
              
              // 3. Smart-Click the waveform safely
              await page.click('#waveform-layer-main').catch(() => {});
              await sleep(1000, 1500);
              
              // 3.5 Check for Update button (Task Already Completed)
              if (await page.locator('button:has-text("Update")').isVisible().catch(()=>false)) {
                  console.log("   ⏭️ Wrapper shows 'Update' instead of Submit! Task is already completed. Skipping to next row.");
                  continue;
              }
              
              // 4. Parse the extracted Duration
              let clipDur = parseDuration(rawDur);
              
              // Read Textarea safely
              const snippet = await readTextarea(page);

              if (!snippet || snippet.length < 5) {
                console.log(`   ⚠ Textarea empty — skipping`);
                await goBack(page); processed = true; break;
              }

              console.log(`   📋 Snippet: "${snippet.substring(0, 80)}…"`);

              // Match & Guard
              const { best, second, gap, chunk, secondChunk } = bestMatch(snippet, clipDur);
              console.log(`   📊 Best: ${best.toFixed(3)} | Second: ${second.toFixed(3)} | Gap: ${gap.toFixed(3)}`);

              // Smart Ambiguity Check
              if (best > CONFIG.LOW_CONFIDENCE && gap < CONFIG.AMBIGUITY_GAP) {
                if (stringSimilarity.compareTwoStrings(normalize(chunk), normalize(secondChunk)) > 0.40) {
                  console.log(`   💡 Ambiguity ignored: Matches are overlapping neighbors.`);
                } else {
                  await pauseForReview(`Ambiguous — ${best.toFixed(3)} vs ${second.toFixed(3)} gap ${gap.toFixed(3)}`);
                  await goBack(page); processed = true; break;
                }
              }

              // Paste Logic
              let textToPaste, mode;
              if (best >= CONFIG.HIGH_CONFIDENCE) {
                textToPaste = trimToSnippetLength(snippet, chunk);
                mode = 'high-confidence (trimmed)';
              } else if (best >= CONFIG.LOW_CONFIDENCE) {
                textToPaste = snippet;
                mode = 'low-confidence fallback';
              } else {
                console.log(`   ⚠ Score below threshold — skipping`);
                await goBack(page); processed = true; break;
              }

              // Sanity check AFTER trimming
              const s = sanityCheck(textToPaste, clipDur);
              if (!s.ok) {
                await pauseForReview(`Sanity failed — ${s.reason}`);
                await goBack(page); processed = true; break;
              }

              console.log(`   📝 Pasting (${mode})`);
              await pasteText(page, textToPaste);
              
              const reviewTime = Math.max(8000, wordCount(textToPaste) * 800);
              console.log(`   ⏳ Simulating human review for ${(reviewTime/1000).toFixed(1)}s...`);
              await sleep(reviewTime, reviewTime + 3000);

              // Submit Safely using Hardened helper
              console.log('   ⏳ WAITING 3 SECONDS... PRESS CTRL+C NOW TO CANCEL IF WRONG!');
              await sleep(3000);
              console.log('   🖱 Submitting…');
              await safeSubmit(page);
              
              console.log('   ✅ Submitted.');
              await sleep(2500, 4000); 
              processed = true; break;
            }
          }
        }

        // Native scroll if no tasks found
        if (!processed) {
          try {
            await page.evaluate(() => {
              const scroller = document.querySelector('.lsf-table [style*="overflow: auto"]');
              if (scroller) scroller.scrollTop += 800;
            });
            await sleep(600, 900);
          } catch {
            await sleep(600, 900);
          }
        }
      } catch (err) {
        console.log(`   ❌ Error in loop: ${err.message}`);
        await sleep(2000, 3500);
      }
    }
  } catch (error) {
    console.log("❌ Fatal Launch Error. Make sure Opera is closed before starting.");
    console.log(error.message);
  }
})();