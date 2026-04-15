/**
 * paste_lab.js v2 — Isolated Copy-Paste Lab
 *
 * PURPOSE: Test & tune the paste matching pipeline in isolation.
 *          Never touches the table scanner or submit logic from ok.js.
 *
 * USAGE:
 *   node paste_lab.js                 → interactive (asks y/n before pasting)
 *   node paste_lab.js --dry-run       → score only, never pastes
 *   node paste_lab.js --batch         → score-only batch across all open tabs
 *   node paste_lab.js --sweep         → automatically open first 5 untouched tasks
 *
 * IMPROVEMENTS over v1:
 *   [1] Malay prefix-stripped second scorer (from fuzzy_paster.js)
 *   [2] Normalized snippet display — see exactly what the scorer sees
 *   [3] Keyword extraction display — confirm no important words dropped
 *   [4] Length filter report — how many chunks were filtered pre-scoring
 *   [5] Re-score after trim — confirm trim improved the match
 *   [6] Word-level diff — snippet vs proposed paste
 *   [7] Scripts.txt position report — WHERE in the script the match lives
 *   [8] Batch mode (--batch) — score all open tasks dry-run in sequence
 */

'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const stringSimilarity = require('string-similarity');

// ─── 0. CLI FLAGS ─────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_MODE = process.argv.includes('--batch');
const SWEEP_MODE = process.argv.includes('--sweep');

// ─── 2. CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  PROJECT_ID: '39649',
  CDP_URL: 'http://127.0.0.1:9222',

  // ── Scorer thresholds (tune here, then copy to ok.js when happy) ──
  HIGH_CONFIDENCE: 0.40,
  LOW_CONFIDENCE: 0.24,
  AMBIGUITY_GAP: 0.04,

  // ── Duration / word-count ──
  WORDS_PER_SECOND: 1.55,
  LENGTH_TOLERANCE: 3.0, // Increased to allow "spanning" chunks to be considered

  // ── Lab display ──
  TOP_N_CANDIDATES: 3,
  SHOW_TRIM_WINDOWS: 5,
};

// ─── 1. LOGGING (mirrors ok.js dual-log) ─────────────────────────────────────
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const humanLogFile = path.join(logDir, `lab_proj${CONFIG.PROJECT_ID}_${timestamp}_human.log`);
const machineLogFile = path.join(logDir, `lab_proj${CONFIG.PROJECT_ID}_${timestamp}_machine.jsonl`);

  /**
   * PASTE_MODE — swap to compare paste strategies:
   *   'fill'       → box.fill(text)                  [current ok.js method]
   *   'type'       → box.type(text, {delay:18})       [character-by-character]
   *   'clipboard'  → navigator.clipboard + Ctrl+V     [OS clipboard route]
   */
  PASTE_MODE: 'fill',

  POLL_INTERVAL_MS: 500,
  BEEP: '\u0007',
};

// ─── 3. SLEEP ─────────────────────────────────────────────────────────────────
const sleep = (min, max = min) =>
  new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

// ─── 4. LOAD & CHUNK SCRIPTS.TXT ─────────────────────────────────────────────
let cleanChunks = [];
let allSentences = []; // kept for [7] position report
let chunkStartIdx = []; // [B2 FIX] pre-computed sentence start index for every chunk
let loadedScriptFile = '';

function loadScripts(projID = null) {
  let targetPath = projID ? path.join(__dirname, `scripts_${projID}.txt`) : null;

  if (!targetPath || !fs.existsSync(targetPath)) {
    targetPath = path.join(__dirname, 'scripts.txt');
    if (projID) log(`   ⚠️  scripts_${projID}.txt not found → falling back to scripts.txt`);
  } else {
    log(`   📂 Loaded dataset: scripts_${projID}.txt`);
  }

  if (!fs.existsSync(targetPath)) {
    log('   ❌ No scripts.txt found! Cannot run matcher.');
    return false;
  }

  loadedScriptFile = targetPath;
  const raw = fs.readFileSync(targetPath, 'utf8');
  allSentences = raw
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  cleanChunks = [];
  chunkStartIdx = [];
  // [B2 FIX] Record sentence start index at build time — O(1) lookup later
  for (let i = 0; i < allSentences.length; i++) {
    for (let len = 1; len <= 5 && i + len <= allSentences.length; len++) {
      cleanChunks.push(allSentences.slice(i, i + len).join(' '));
      chunkStartIdx.push(i); // sentence index where this chunk starts
    }
  }
  log(`   └─ Parsed ${allSentences.length} sentences → ${cleanChunks.length} window chunks`);
  return true;
}

// ─── 5. TEXT NORMALISATION (standard, no prefix stripping) ────────────────────
function normalize(text) {
  let norm = text.toLowerCase()
    // Treat "peratus" as % (consume leading space if present)
    .replace(/\s*peratus\b/g, '%')
    // Normalize reduplicated words to hyphenated form (user preference)
    // "sama sama" -> "sama-sama", "besar besaran" -> "besar-besaran"
    .replace(/(\b\w+)[-\s](\1\w*\b)/g, '$1-$2')
    // Remove punctuation but keep alphanumeric, hyphens (for reduplication/prefixes), and %
    .replace(/[^\w\s\-%]/gi, '')
    .replace(/\s+/g, ' ').trim();

  const magMap = {
    // Magnitude words (se- variants)
    'sebilion': '1000000000', 'sejuta': '1000000', 'seribu': '1000', 'seratus': '100', 'sepuluh': '10',
    // Malay cardinal digits
    'satu': '1', 'dua': '2', 'tiga': '3', 'empat': '4', 'lima': '5',
    'enam': '6', 'tujuh': '7', 'lapan': '8', 'sembilan': '9',
    // Magnitude words (standard)
    'bilion': '000000000', 'juta': '000000', 'ribu': '000',
    'ratus': '00', 'puluh': '0', 'sebelas': '11',
    'sifar': '0', 'kosong': '0', 'setengah': '0.5'
  };

  Object.keys(magMap).forEach(word => {
    norm = norm.replace(new RegExp(`\\b${word}\\b`, 'g'), magMap[word]);
  });

  // Squash spaces between digits: "2 0 0" → "200", "1 0 0 0 0 0 0" → "1000000"
  norm = norm.replace(/(\d)\s+(?=\d)/g, '$1');

  return norm;
}

// ─── [1] TEXT NORMALISATION — prefix-stripped variant (from fuzzy_paster.js) ──
// [B5 FIX] Conservative Prefix-Only Stripping
//          Prevents over-stripping roots (e.g., 'beras' to 'as')
function normalizeStripped(text) {
  let norm = normalize(text);
  const exclusions = new Set([
    'mereka', 'terima', 'maka', 'kerana', 'sebab', 'dengan', 'telah', 'boleh',
    'bukan', 'punya', 'untuk', 'dalam', 'merekanya', 'member', 'peratus'
  ]);

  let words = norm.split(/\s+/);
  words = words.map(w => {
    if (exclusions.has(w) || w.length <= 4) return w;

    let stem = w;
    const prefixes = [
      /^me(?:m|n|ng|nge|ny)?/, /^pe(?:m|n|ng|nge|ny|r)?/,
      /^ber/, /^bel/, /^ter/, /^di/, /^se/, /^ke/
    ];

    for (const p of prefixes) {
      if (p.test(stem)) {
        const potential = stem.replace(p, '');
        // Root must be at least 4 chars to be safe
        if (potential.length >= 4) {
          stem = potential;
          break;
        }
      }
    }
    return stem;
  });

  return words.join(' ').trim();
}

// ─── 6. FILLER WORDS ─────────────────────────────────────────────────────────
const FILLER = new Set([
  'yang', 'dan', 'dia', 'ini', 'itu', 'akan', 'untuk', 'dengan', 'dari', 'pada', 'oleh',
  'ke', 'di', 'ia', 'si', 'tu', 'ni', 'juga', 'atau', 'pun', 'saja', 'sahaja', 'lagi',
  'sudah', 'telah', 'sedang', 'boleh', 'tidak', 'tak', 'ada', 'satu', 'kami', 'kita',
  'anda', 'saya', 'mereka', 'kamu',
  // Context-specific from scripts.txt
  'merupakan', 'iaitu', 'adalah', 'sebagai', 'bagi', 'secara', 'setiap', 'serta',
  'dalam', 'paling', 'hal', 'maka', 'bagaimana', 'dicapai', 'natijahnya', 'kesannya',
  'perkara', 'penegasan', 'terhadap', 'harapan', 'harus', 'sedar',
  'bahawa', 'menjadi', 'melalui', 'seterusnya', 'lebih',
  'mampu', 'peratus'
]);

// ─── 7. KEYWORD EXTRACTION ────────────────────────────────────────────────────
// [3] Extracted separately so we can display it
function extractKeywords(normText) {
  return [...new Set(
    normText.split(/\s+/).filter(w => (w.length > 3 || !isNaN(w)) && !FILLER.has(w))
  )];
}

// ─── 8. FINGERPRINT SCORER (verbose sub-scores) ───────────────────────────────
function scoreChunkVerbose(messy, chunk, normFn = normalize) {
  const nm = normFn(messy);
  const nc = normFn(chunk);
  const mArr = nm.split(/\s+/);
  const kw = extractKeywords(nm);

  const overlap = kw.length ? kw.filter(w => nc.includes(w)).length / kw.length : 0;
  const sim = stringSimilarity.compareTwoStrings(nm, nc);

  let tri = 0;
  for (let i = 0; i < mArr.length - 2; i++)
    if (nc.includes(mArr.slice(i, i + 3).join(' '))) tri += 0.10;

  let bi = 0;
  for (let i = 0; i < mArr.length - 1; i++)
    if (nc.includes(mArr.slice(i, i + 2).join(' '))) bi += 0.03;

  // --- 5-WORD ANCHOR LOGIC ---
  let anchor = 0;
  if (mArr.length >= 6) {
    // Start anchor (First 5 words) - High weight to fix mid-sentence starts
    const start5 = mArr.slice(0, 5).join(' ');
    if (nc.includes(start5)) anchor += 0.25;
    else if (nc.includes(mArr.slice(0, 4).join(' '))) anchor += 0.15;

    // End anchor (Last 5 words)
    const end5 = mArr.slice(-5).join(' ');
    if (nc.includes(end5)) anchor += 0.15;
    else if (nc.includes(mArr.slice(-4).join(' '))) anchor += 0.10;
  } else if (mArr.length >= 3) {
    if (nc.includes(mArr.join(' '))) anchor += 0.40;
  }

  const triCapped = Math.min(tri, 0.40);
  const biCapped = Math.min(bi, 0.15);
  // Re-weighted to favor anchor and overlap over sim (which is affected by chunk length)
  const total = overlap * 0.25 + sim * 0.10 + triCapped * 0.35 + biCapped * 0.10 + anchor * 0.20;
  return { total, overlap, sim, trigram: triCapped, bigram: biCapped, anchor };
}

function scoreChunk(messy, chunk) {
  return scoreChunkVerbose(messy, chunk).total;
}

// ─── 9. HELPERS ───────────────────────────────────────────────────────────────
function wordCount(text) { return text.trim().split(/\s+/).length; }
function expectedWords(sec) { return Math.round(sec * CONFIG.WORDS_PER_SECOND); }

// ─── 10. BEST MATCH (top-N, with [4] length filter report & [7] position) ────
function bestMatch(snippet, durationSec) {
  const candidates = [];
  const expWords = durationSec ? expectedWords(durationSec) : null;

  // --- Create Spanning Chunks ---
  const allChunks = [...cleanChunks];
  for (let i = 0; i < cleanChunks.length - 1; i++) {
    const combined = cleanChunks[i] + ' ' + cleanChunks[i + 1];
    allChunks.push(combined);
  }

  for (const chunk of allChunks) {
    // Filter too-short AND too-long chunks (bidirectional)
    if (expWords) {
      const cw = wordCount(chunk);
      if (cw < expWords * 0.40) continue;
      if (cw > expWords * CONFIG.LENGTH_TOLERANCE) continue;
    }

    const scores = scoreChunkVerbose(snippet, chunk);

    // Duration-aware length bonus (max +0.05 for perfect length match)
    let lengthBonus = 0;
    if (expWords) {
      const cw = wordCount(chunk);
      const ratio = cw > expWords ? expWords / cw : cw / expWords;
      lengthBonus = ratio * 0.05;
      scores.total += lengthBonus;
    }

    // Prefix-stripped scoring
    const strippedScores = scoreChunkVerbose(snippet, chunk, normalizeStripped);
    const strippedTotal = strippedScores.total + lengthBonus;

    candidates.push({ chunk, strippedTotal, ...scores });
  }

  candidates.sort((a, b) => b.total - a.total);

  if (candidates.length === 0) return { bestCandidate: null, secondCandidate: null, gap: 0, strippedAgrees: false };

  const best = candidates[0];
  const second = candidates[1] || null;

  // Agreement check: does the same chunk win both scorers?
  const strippedWinner = [...candidates].sort((a, b) => b.strippedTotal - a.strippedTotal)[0];
  const strippedAgrees = strippedWinner && strippedWinner.chunk === best.chunk;

  return {
    bestCandidate: best,
    secondCandidate: second,
    gap: best.total - (second ? second.total : 0),
    strippedAgrees
  };
}

// ─── 11. ELASTIC TRIMMER (with [5] re-score diagnostic) ──────────────────────
function trimToSnippetLength(snippetText, matchedChunk, verbose = false) {
  const snippetWords = snippetText.trim().split(/\s+/);
  const chunkWords = matchedChunk.trim().split(/\s+/);

  if (chunkWords.length <= Math.ceil(snippetWords.length * 1.1)) return matchedChunk;

  const normSnippet = normalize(snippetText);
  const snippetArr = normSnippet.split(/\s+/);
  const minLen = Math.max(1, Math.floor(snippetWords.length * 0.75));
  const maxLen = Math.min(chunkWords.length, Math.ceil(snippetWords.length * 1.35));

  const windows = [];
  for (let size = minLen; size <= maxLen; size++) {
    for (let i = 0; i <= chunkWords.length - size; i++) {
      const windowText = chunkWords.slice(i, i + size).join(' ');
      const normWin = normalize(windowText);
      const winArr = normWin.split(/\s+/);

      let s = stringSimilarity.compareTwoStrings(normSnippet, normWin);
      let tri = 0;
      for (let j = 0; j < snippetArr.length - 2; j++)
        if (normWin.includes(snippetArr.slice(j, j + 3).join(' '))) tri += 0.05;

      // Anchor bonus for trimming: does this window start/end with the right words?
      let anchorBonus = 0;
      if (snippetArr.length >= 3) {
        // High bonus for exact start match
        if (winArr[0] === snippetArr[0]) anchorBonus += 0.20;
        else if (snippetArr[0].includes(winArr[0]) || winArr[0].includes(snippetArr[0])) anchorBonus += 0.10;

        // High bonus for exact end match
        if (winArr[winArr.length - 1] === snippetArr[snippetArr.length - 1]) anchorBonus += 0.20;
      }

      windows.push({ score: s + Math.min(tri, 0.25) + anchorBonus, text: windowText, size, offset: i });
    }
  }
  windows.sort((a, b) => b.score - a.score);

  if (verbose && windows.length > 0) {
    log(`\n   ✂️  Trim-window diagnostic (top ${CONFIG.SHOW_TRIM_WINDOWS}):`);
    windows.slice(0, CONFIG.SHOW_TRIM_WINDOWS).forEach((w, i) => {
      log(`      [${i + 1}] score=${w.score.toFixed(3)} size=${w.size} off=${w.offset}: "${w.text.substring(0, 80)}..."`);
    });
  }
  const bestResult = windows.length > 0 ? windows[0].text : matchedChunk;
  return formatForPasting(bestResult);
}

// ─── 11.5. FINAL PASTE FORMATTER (Grammar & Numbers) ───────────────────────
function formatForPasting(text) {
  let out = text;

  // 1. Convert specific number sequences to digits
  const units = { 'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4, 'lima': 5, 'enam': 6, 'tujuh': 7, 'lapan': 8, 'sembilan': 9 };
  const mags = { 'puluh': 10, 'belas': 1, 'ratus': 100, 'ribu': 1000, 'juta': 1000000 }; // exclude bilion for simple processing
  out = out.replace(/\bseratus\s+peratus\b/gi, '100%');

  // Basic State machine for contiguous number words to turn simple spoken numbers into digits
  let words = out.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    if (units[w] !== undefined || w === 'sepuluh' || w === 'sebelas') {
      let val = 0, currentChunk = 0, j = i;
      while (j < words.length) {
        const tw = words[j].toLowerCase();
        if (units[tw] !== undefined) {
          currentChunk += units[tw];
        } else if (tw === 'belas') {
          currentChunk += 10;
        } else if (tw === 'sepuluh') {
          currentChunk += 10;
        } else if (tw === 'sebelas') {
          currentChunk += 11;
        } else if (mags[tw] !== undefined) {
          if (currentChunk === 0) currentChunk = 1;
          if (mags[tw] >= 1000) {
            val += currentChunk * mags[tw];
            currentChunk = 0;
          } else {
            currentChunk *= mags[tw];
          }
        } else {
          break;
        }
        j++;
      }
      val += currentChunk;
      if (j > i + 1) { // Only replace multi-word blocks (dua juta -> 2000000, dua ratus -> 200)
        words.splice(i, j - i, val.toString());
      }
    }
  }
  out = words.join(' ');

  // 2. Kata Ganda Penuh & Berimbuhan (e.g., sama sama -> sama-sama)
  out = out.replace(/\b([a-zA-Z]+)\s+(\1\w*)\b/gi, '$1-$2');

  // Kata Ganda Berentak
  const berentak = {
    'sayur mayur': 'sayur-mayur', 'kuih muih': 'kuih-muih', 'batu batan': 'batu-batan',
    'saudara mara': 'saudara-mara', 'gunung ganang': 'gunung-ganang', 'lauk pauk': 'lauk-pauk',
    'warna warni': 'warna-warni', 'tolong menolong': 'tolong-menolong',
    'anai anai': 'anai-anai', 'rama rama': 'rama-rama', 'kura kura': 'kura-kura',
    'labah labah': 'labah-labah', 'agar agar': 'agar-agar', 'anting anting': 'anting-anting',
    'layang layang': 'layang-layang', 'undang undang': 'undang-undang'
  };
  for (const [k, v] of Object.entries(berentak)) {
    out = out.replace(new RegExp(`\\b${k}\\b`, 'gi'), (match) => {
      return match[0] === match[0].toUpperCase() ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    });
  }

  // 3. Numerical Expressions
  out = out.replace(/\b(ke)\s+(\d+)\b/gi, '$1-$2');     // ke 10 -> ke-10
  out = out.replace(/\b(\d+)\s+(an)\b/gi, '$1-$2');     // 1990 an -> 1990-an
  out = out.replace(/\b(COVID)\s*(19)\b/gi, 'COVID-19'); // COVID 19 -> COVID-19
  out = out.replace(/\b(H5)\s*(N1)\b/gi, 'H5-N1');

  // 4. Prefixes with Proper Nouns
  out = out.replace(/\b(pro|anti|se|sub)\s+([A-Z]\w+)\b/g, '$1-$2'); // pro Malaysia -> pro-Malaysia

  // 5. Divine Pronouns (Must be Capitalized Nya, Mu, Ku to be safe)
  out = out.replace(/\b(\w+)\s+(Nya|Mu|Ku)\b/g, '$1-$2'); // rahmat Nya -> rahmat-Nya

  // 6. Technical / Modern / Loan terms
  out = out.replace(/\be\s+(mel|dagang|dompet|kasih|buku)\b/gi, 'e-$1'); // e mel -> e-mel

  return out;
}

// ─── 12. DURATION HELPERS ────────────────────────────────────────────────────
function parseDuration(val) {
  if (!val) return null;
  const p = val.split(':').map(Number);
  if (p.length === 4) return (p[0] * 3600) + (p[1] * 60) + p[2] + (p[3] / 1000);
  if (p.length === 3) return (p[0] * 60) + p[1] + (p[2] / 1000);
  if (p.length === 2) return p[0] + (p[1] / 1000);
  return null;
}

function sanityCheck(text, sec) {
  if (!sec) return { ok: true };
  const exp = expectedWords(sec), act = wordCount(text), ratio = act / exp;
  if (ratio < 0.35 || ratio > 2.8)
    return { ok: false, reason: `Word count mismatch: ${act} pasted, ~${exp} expected for ${sec.toFixed(1)}s` };
  return { ok: true };
}

// ─── 13. TEXTAREA HELPERS ────────────────────────────────────────────────────
const TEXTAREA_SEL = 'textarea[name="Annotation Result"]';

async function readTextarea(page) {
  try {
    await page.locator(TEXTAREA_SEL).first().waitFor({ state: 'visible', timeout: 5000 });
    const v = await page.locator(TEXTAREA_SEL).first().inputValue().catch(() => '');
    if (v) return v.trim();
    return (await page.locator(TEXTAREA_SEL).first().textContent().catch(() => '')).trim();
  } catch { return ''; }
}

async function readDuration(page) {
  const durInput = page.locator('[data-testid="timebox-end-time"] input').first();
  let rawDur = '';
  log('   ⏳ Polling audio duration...');
  for (let i = 0; i < 30; i++) {
    rawDur = await durInput.inputValue().catch(() => '');
    if (rawDur && rawDur.length >= 5 && rawDur !== '00:00:00' && rawDur !== '00:00:00:000') break;
    process.stdout.write('.');
    await sleep(CONFIG.POLL_INTERVAL_MS);
  }
  process.stdout.write('\n');
  return rawDur;
}

// ─── 14. PASTE TEXT (strategy-aware) ─────────────────────────────────────────
async function pasteText(page, text) {
  const box = page.locator(TEXTAREA_SEL).first();
  await box.focus();
  await sleep(80, 150);
  await box.press('Control+A');
  await sleep(80, 150);
  await box.press('Backspace');
  await sleep(600, 1200);

  log(`   🖊️  Paste strategy: ${CONFIG.PASTE_MODE}`);

  if (CONFIG.PASTE_MODE === 'fill') {
    await box.fill(text.trim());
    await sleep(100, 150);
    await box.press('Space');
    await sleep(60, 100);
    await box.press('Backspace');

  } else if (CONFIG.PASTE_MODE === 'type') {
    await box.type(text.trim(), { delay: 18 });
    await sleep(100, 150);
    await box.press('Space');
    await sleep(60, 100);
    await box.press('Backspace');

  } else if (CONFIG.PASTE_MODE === 'clipboard') {
    // [B6 FIX] Wrap clipboard write in try/catch — writeText needs focus & permissions
    const writeOk = await page.evaluate(async (t) => {
      try { await navigator.clipboard.writeText(t); return true; }
      catch (e) { return false; }
    }, text.trim());

    if (!writeOk) {
      log('   ❌ navigator.clipboard.writeText() failed (permissions/focus issue).');
      log('   ↩️  Falling back to fill strategy.');
      await box.fill(text.trim());
      await sleep(100, 150);
      await box.press('Space'); await sleep(60, 100); await box.press('Backspace');
      return; // early exit from pasteText
    }
    await sleep(100, 200);

    // Clipboard round-trip verify
    const clipCheck = await page.evaluate(async () => {
      try { return await navigator.clipboard.readText(); } catch { return ''; }
    });
    if (clipCheck && clipCheck.trim() !== text.trim()) {
      log('   ⚠️  Clipboard mismatch before paste — content may have been overwritten.');
    } else if (clipCheck) {
      log('   ✅ Clipboard round-trip verified.');
    }

    await box.press('Control+V');
    await sleep(100, 150);
    await box.press('Space');
    await sleep(60, 100);
    await box.press('Backspace');

  } else {
    log(`   ⚠️  Unknown PASTE_MODE "${CONFIG.PASTE_MODE}". Falling back to fill.`);
    await box.fill(text.trim());
    await sleep(100, 150);
    await box.press('Space');
    await sleep(60, 100);
    await box.press('Backspace');
  }
}

// ─── 15. [6] WORD DIFF ────────────────────────────────────────────────────────
// [B3 FIX] Use word-count maps instead of Sets so duplicates are handled correctly.
//          Shows added words in-place using a simple LCS-style inline diff.
function wordDiff(snippetText, pasteText) {
  const sw = snippetText.trim().split(/\s+/);
  const pw = pasteText.trim().split(/\s+/);

  // Build frequency maps to handle duplicate words properly
  const makeFreq = arr => arr.reduce((m, w) => { m[w] = (m[w] || 0) + 1; return m; }, {});
  const swFreq = makeFreq(sw);
  const pwFreq = makeFreq(pw);

  // Count-aware added/removed (e.g. 'yang' appears 3× in snippet, 1× in paste → 2 removed)
  let addedCount = 0, removedCount = 0, keptCount = 0;
  const allWords = new Set([...Object.keys(swFreq), ...Object.keys(pwFreq)]);
  allWords.forEach(w => {
    const s = swFreq[w] || 0, p = pwFreq[w] || 0;
    keptCount += Math.min(s, p);
    removedCount += Math.max(0, s - p);
    addedCount += Math.max(0, p - s);
  });

  // Build inline diff line: walk paste words, mark words not in snippet with [+]
  // Walk snippet words marking words not in paste with [−]
  // Simple approach: show snippet perspective with [−] for removed, then [+] additions at end
  const pwFreqCopy = { ...pwFreq };
  let diffLine = '';
  sw.forEach(w => {
    if (pwFreqCopy[w] && pwFreqCopy[w] > 0) {
      diffLine += w + ' ';
      pwFreqCopy[w]--;
    } else {
      diffLine += `[−${w}] `;
    }
  });
  // Remaining paste words that weren't consumed = additions
  Object.entries(pwFreqCopy).forEach(([w, cnt]) => {
    for (let i = 0; i < cnt; i++) diffLine += `[+${w}] `;
  });

  return {
    line: diffLine.trim(),
    added: addedCount,
    removed: removedCount,
    kept: keptCount,
    deltaWords: pw.length - sw.length,
  };
}

// ─── 16. INTERACTIVE PROMPT ──────────────────────────────────────────────────
function promptUser(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

// ─── 17. CORE: ANALYSE ONE TASK PAGE ─────────────────────────────────────────
async function analyseTask(page, interactive = true) {
  const url = page.url();
  log(`\n${'═'.repeat(70)}`);
  log(`🔍 Analysing: ${url}`);

  if (!url.includes('task=') && !url.includes('/tasks/')) {
    log('   ⚠️  Not on a task page. Skipping.');
    return false;
  }

  // 1. Wait for waveform UI to exist
  log('   ⏳ Waiting for Waveform UI to load...');
  await page.waitForSelector('#waveform-layer-main', { timeout: 15000 }).catch(() => { });

  // 2. Read duration (Polling as in ok.js/test_duration.js)
  const rawDur = await readDuration(page);
  const clipDur = parseDuration(rawDur);

  if (clipDur) {
    log(`   ⏱  Duration: ${rawDur.trim()} = ${clipDur.toFixed(2)}s (~${expectedWords(clipDur)} expected words)`);
  } else {
    log(`   ⚠️  Could not parse duration from "${rawDur}". Continuing without length filter.`);
  }

  // 3. Click waveform (Now that duration is confirmed)
  log('   🖱️  Clicking waveform...');
  await page.click('#waveform-layer-main', { force: true }).catch(() => { });
  await sleep(1500, 2000); // Give the UI time to populate the transcription box

  // 4. Read snippet
  const snippet = await readTextarea(page);
  if (!snippet || snippet.length < 5) {
    log('   ⚠️  Textarea empty or too short. Skipping.');
    return false;
  }

  // [2] Show normalized form
  const normSnippet = normalize(snippet);
  const strippedSnippet = normalizeStripped(snippet);
  log(`\n   📋 SNIPPET (${wordCount(snippet)} words):\n${'─'.repeat(60)}\n${snippet}\n${'─'.repeat(60)}`);
  log(`   🔡 Normalized:  "${normSnippet.substring(0, 120)}..."`);
  log(`   🔡 Prefix-stripped: "${strippedSnippet.substring(0, 120)}..."`);

  // [3] Show keywords
  const keywords = extractKeywords(normSnippet);
  log(`   🔑 Keywords extracted (${keywords.length}): [${keywords.slice(0, 20).join(', ')}${keywords.length > 20 ? '...' : ''}]`);

  // Run matcher
  log('\n   🔍 Running matcher...');
  const { bestCandidate: best, secondCandidate: second, gap, strippedAgrees } = bestMatch(snippet, clipDur);

  if (!best || best.total === 0) {
    log('   ❌ No candidates. Check scripts.txt has content.');
    return false;
  }

  // Print top-N
  log('\n──────────────────────────────────────────────────────────────────────');
  log('   📊 TOP 3 CANDIDATES');
  log('──────────────────────────────────────────────────────────────────────');

  const candidates = [best, second].filter(c => c && c.total > 0);

  candidates.forEach((c, i) => {
    const { total, strippedTotal, overlap, sim, trigram, bigram, anchor, chunk: candChunk } = c;
    const lenBonus = total - (overlap * 0.25 + sim * 0.10 + Math.min(trigram, 0.40) * 0.35 + Math.min(bigram, 0.15) * 0.10 + anchor * 0.20);

    log(`   [${i + 1}] Score: ${total.toFixed(4)}  (stripped: ${strippedTotal.toFixed(4)})`);
    log(`        overlap=${overlap.toFixed(3)}  sim=${sim.toFixed(3)}  tri=${trigram.toFixed(3)}  bi=${bigram.toFixed(3)}  anchor=${anchor.toFixed(3)}  lenBonus=${lenBonus.toFixed(3)}`);
    log(`        Words: ${wordCount(candChunk)}  │  📍 sentence ${cleanChunks.indexOf(candChunk) + 1} of ${cleanChunks.length}`);
    log(`        "${candChunk.substring(0, 80)}..."`);
  });
  log('──────────────────────────────────────────────────────────────────────');
  log(`   Gap #1 vs #2: ${gap.toFixed(4)}  (need > ${CONFIG.AMBIGUITY_GAP} to be unambiguous)`);
  log(`   ${strippedAgrees ? '✅' : '⚠️'} Prefix-stripped scorer ${strippedAgrees ? 'agrees' : 'disagrees'} with standard scorer on top pick.`);


  // Ambiguity check
  if (best.total > CONFIG.LOW_CONFIDENCE && gap < CONFIG.AMBIGUITY_GAP) {
    const sim12 = stringSimilarity.compareTwoStrings(normalize(best.chunk), normalize(second.chunk || ''));
    if (sim12 > 0.40) {
      log(`\n   💡 Gap small BUT chunks are very similar (sim=${sim12.toFixed(3)}) — treating as unambiguous.`);
    } else {
      log(`\n   🚨 AMBIGUOUS — gap too small and chunks are different.`);
      if (interactive && !DRY_RUN && !BATCH_MODE) {
        const ans = await promptUser('   Continue anyway? (y/n): ');
        if (ans !== 'y') { log('   Aborted.'); return false; }
      }
    }
  }

  // Decide paste text
  let finalText = formatForPasting(snippet);
  let trimmedText = null;
  let mode = 'fallback (snippet as-is)';
  const preTrimScore = best.total;

  if (best.total >= CONFIG.HIGH_CONFIDENCE) {
    log(`\n   ✅ HIGH confidence (${best.total.toFixed(4)} ≥ ${CONFIG.HIGH_CONFIDENCE}). Trimming...`);
    trimmedText = trimToSnippetLength(snippet, best.chunk, /* verbose= */ true);
    finalText = trimmedText;
    mode = 'high-confidence (elastic trimmed)';

    // Score-based Trim Revert: If trimming significantly lowers the match quality, revert.
    const postTrimScore = scoreChunk(snippet, finalText);
    if (postTrimScore < best.total - 0.02) {
      log(`\n   ↩️ Trim lowered score significantly (${postTrimScore.toFixed(4)} vs ${best.total.toFixed(4)}). Reverting to full chunk.`);
      finalText = formatForPasting(best.chunk);
      mode = 'high-confidence (full chunk — trim reverted)';
    }
  } else if (best.total >= CONFIG.LOW_CONFIDENCE) {
    log(`\n   ⚠️  LOW confidence (${best.total.toFixed(4)}). Using snippet as fallback.`);
    mode = 'low-confidence (snippet as-is)';
  } else {
    log(`\n   ❌ Score ${best.total.toFixed(4)} < LOW_CONFIDENCE ${CONFIG.LOW_CONFIDENCE}. Nothing to paste.`);
    return false;
  }

  // [5] Re-score after trim
  if (mode.includes('trimmed')) {
    const postTrimScore = scoreChunk(snippet, finalText);
    const delta = postTrimScore - preTrimScore;
    log(`\n   ✂️  Re-score after trim:`);
    log(`       Pre-trim:  ${preTrimScore.toFixed(4)}`);
    log(`       Post-trim: ${postTrimScore.toFixed(4)}  (${delta >= 0 ? '+' : ''}${delta.toFixed(4)}) ${delta >= 0 ? '✅ trim improved match' : '⚠️  trim lowered score — check window'}`);
  }

  // Sanity check
  const sanity = sanityCheck(finalText, clipDur);
  if (!sanity.ok) {
    log(`\n   🚨 SANITY CHECK: ${sanity.reason}`);

    // [FIX] Auto-revert aggressive trim if sanity check fails
    if (trimmedText && finalText === trimmedText) {
      const fullSanity = sanityCheck(best.chunk, clipDur);
      // If full chunk passes sanity check OR is just mathematically closer to expected length
      const errTrim = Math.abs(wordCount(trimmedText) - expectedWords(clipDur));
      const errFull = Math.abs(wordCount(best.chunk) - expectedWords(clipDur));

      if (fullSanity.ok || errFull < errTrim) {
        log(`   ↩️  Reverting to full un-trimmed chunk! It matches duration much better.`);
        finalText = formatForPasting(best.chunk);
        mode = 'high-confidence (full chunk - reverted trim)';
        sanity.ok = fullSanity.ok; // Updates sanity status to the full variant
      }
    }

    if (!sanity.ok && interactive && !DRY_RUN && !BATCH_MODE) {
      const ans = await promptUser('   Continue anyway? (y/n): ');
      if (ans !== 'y') { log('   Aborted.'); return false; }
    }
  }

  // [7] Scripts.txt position of the winning match
  if (best && typeof best.matchStart === 'number' && best.matchStart >= 0) {
    const pct = ((best.matchStart / allSentences.length) * 100).toFixed(1);
    log(`\n   📍 Scripts.txt position: sentence ${best.matchStart + 1} of ${allSentences.length} (~${pct}% through the script)`);
  } else if (best) {
    const idx = cleanChunks.indexOf(best.chunk);
    if (idx >= 0) {
      const pct = ((idx / cleanChunks.length) * 100).toFixed(1);
      log(`\n   📍 Chunk position: #${idx + 1} of ${cleanChunks.length} (~${pct}% through chunks)`);
    } else {
      log(`\n   📍 Spanning chunk (not in base chunk list — matched across sentence boundary)`);
    }
  }

  // Show proposed paste
  log(`\n   📝 PROPOSED PASTE [${mode}] (${wordCount(finalText)} words):\n${'─'.repeat(60)}\n${finalText}\n${'─'.repeat(60)}`);

  // [6] Word diff
  const diff = wordDiff(snippet, finalText);
  log(`\n   📊 Word diff vs snippet:`);
  log(`       kept=${diff.kept}  removed=${diff.removed}  added=${diff.added}  delta=${diff.deltaWords >= 0 ? '+' : ''}${diff.deltaWords} words`);
  if (diff.removed > 0 || diff.added > 0) {
    log(`       ${diff.line.substring(0, 160)}${diff.line.length > 160 ? '...' : ''}`);
  } else {
    log('       (no changes from snippet — identical paste)');
  }

  // Dry-run / batch exit
  if (DRY_RUN || BATCH_MODE) {
    log('\n   🔬 DRY RUN / BATCH — not pasting.');
    return true;
  }

  // Interactive confirm
  if (interactive && !DRY_RUN && !BATCH_MODE) {
    const answer = await promptUser('\n   Paste this text? (y/n): ');
    if (answer !== 'y') { log('   Aborted — nothing changed.'); return false; }
  } else if (!interactive) {
    // In non-interactive mode (like sweep), just log that we are skipping the paste execution
    log('\n   ⏭️  Non-interactive mode — skipping paste execution.');
  }

  // Execute paste
  log('\n   ⏳ Pasting in 2 seconds... (Ctrl+C to abort)');
  await sleep(2000);
  await pasteText(page, finalText);

  // Verify
  await sleep(400);
  const verify = await readTextarea(page);
  log(`\n   🔎 VERIFY — textarea now contains (${wordCount(verify)} words):\n${'─'.repeat(60)}\n${verify}\n${'─'.repeat(60)}`);
  if (verify.trim() === finalText.trim()) {
    log('   ✅ Paste verified — content matches exactly.');
  } else {
    log('   ⚠️  Mismatch between pasted and textarea content. Check manually.');
  }

  return true;
}

// ─── 18. MAIN ─────────────────────────────────────────────────────────────────
(async () => {
  log('\n━━━ PASTE LAB v2 ━━━');
  log(`📄 Human log:   ${humanLogFile}`);
  log(`📄 Machine log: ${machineLogFile}`);

  if (DRY_RUN) log('🔬 DRY RUN mode — scoring only, will NOT paste anything.\n');
  if (BATCH_MODE) log('📦 BATCH mode — will analyse ALL open task tabs.\n');
  if (!DRY_RUN && !BATCH_MODE) log(`🖊️  Paste strategy: "${CONFIG.PASTE_MODE}"\n`);

  // Connect
  log(`🔌 Connecting to Chrome on ${CONFIG.CDP_URL}...`);
  let browser;
  try {
    browser = await chromium.connectOverCDP(CONFIG.CDP_URL);
  } catch (e) {
    log('❌ Connection failed. Make sure chrome_launcher.js is running (port 9222).');
    process.exit(1);
  }

  const context = browser.contexts()[0];

  // Load scripts (detect project ID from the first DingTalk tab)
  const allPages = context.pages();
  const dingtalkTab = allPages.find(p => p.url().includes('scale.dingtalk.com/projects'));
  if (!dingtalkTab) {
    log('❌ No DingTalk tab found. Please open DingTalk in Chrome first.');
    process.exit(1);
  }
  log(`✅ Attached to ${allPages.length} tab(s). DingTalk tab: ${dingtalkTab.url()}`);

  const projMatch = dingtalkTab.url().match(/projects\/(\d+)/);
  const projID = projMatch ? projMatch[1] : null;
  const loaded = loadScripts(projID);
  if (!loaded) process.exit(1);

  // ── BATCH MODE: analyse every task tab ──────────────────────────────────
  if (BATCH_MODE) {
    const taskPages = allPages.filter(p =>
      p.url().includes('scale.dingtalk.com') &&
      (p.url().includes('task=') || p.url().includes('/tasks/'))
    );

    if (taskPages.length === 0) {
      log('⚠️  No task tabs found for batch mode. Open some task pages first.');
      process.exit(0);
    }

    log(`\n📦 Found ${taskPages.length} task tab(s) to analyse...\n`);
    let success = 0;
    for (const tp of taskPages) {
      const ok = await analyseTask(tp, false);
      if (ok) success++;
    }
    log(`\n📦 Batch complete: ${success}/${taskPages.length} tasks analysed.`);
    process.exit(0);
  }

  // ── SWEEP MODE: open first 5 tasks from table ────────────────────────────
  if (SWEEP_MODE) {
    const page = dingtalkTab;
    if (page.url().includes('task=') || page.url().includes('/tasks/')) {
      log('⚠️  Currently on a task page! Please go back to the table view first.');
      process.exit(0);
    }

    log(`\n🧹 SWEEP MODE: Finding first 5 untouched tasks...\n`);
    const rows = await page.locator('.lsf-table-row').all();
    let tasksAnalyzed = 0;

    for (const row of rows) {
      if (tasksAnalyzed >= 5) break;

      const cells = await row.locator('.lsf-table__cell').all();
      if (cells.length < 2) continue;

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

      log(`\n🎯 Row ${tasksAnalyzed + 1}: Found task ${taskID} with '0'. Opening...`);

      // Interaction (direct dblclick like ok.js)
      if (col1 === '0') await cells[1].dblclick({ force: true });
      else if (col2 === '0') await cells[2].dblclick({ force: true });
      else await row.dblclick({ force: true });

      await page.waitForURL(/task=/, { timeout: 10000 }).catch(() => { });
      await sleep(1500, 2000); // UI load time

      const ok = await analyseTask(page, false);
      if (ok) tasksAnalyzed++;

      log('   🔙 Going back to table view...');
      await page.keyboard.press('Escape').catch(() => { });
      await sleep(1500, 2000);
    }

    log(`\n🧹 Sweep complete: ${tasksAnalyzed} tasks analysed.`);
    process.exit(0);
  }

  // ── SINGLE MODE ──────────────────────────────────────────────────────────
  const page = dingtalkTab;

  if (!page.url().includes('task=') && !page.url().includes('/tasks/')) {
    log('\n⚠️  NOT on a task page! Double-click a table row first to open a task.');
    log('   Hint: URL should contain ?task= after opening the wrapper.');
    process.exit(0);
  }

  await analyseTask(page, true);
  log('\n✅ Lab session complete. (Submit manually or use ok.js for full automation.)');
  process.exit(0);
})();
