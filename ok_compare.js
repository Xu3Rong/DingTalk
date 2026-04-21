/**
 * submitter.js — CDP-Only Master Build
 * Connects to an already-running stealth Opera browser on port 9222.
 * Features: Aggressive Zero-Finder, Elastic Trimming, Smart Ambiguity.
 */

'use strict';

const { chromium } = require('playwright'); // Standard playwright is fine via CDP
const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');

// ─── 0. PERSONAL CONFIG (Tune here!) ──────────────────────────────────────────
const USER_CONFIG = {
  // 🎙️ Average words per second (Lower = slow speech, Higher = fast speech)
  WORDS_PER_SECOND: 1.55,

  // 📏 How much "elasticity" to allow in length matching (3.5 = allows very slow speech)
  LENGTH_TOLERANCE: 3.5,

  // 🖱️ Submit method (fill, type, clipboard)
  PASTE_MODE: 'fill',

  // 📊 How many words to use for the fuzzy "Entry Point" and "Exit Point"
  ANCHOR_SIZE: 6,

  // 🛡️ Confidence floors
  HIGH_CONFIDENCE: 0.40,
  LOW_CONFIDENCE: 0.24,
  AMBIGUITY_GAP: 0.04,
};

// ─── 0.1 SYSTEM CONFIG ────────────────────────────────────────────────────────
const CONFIG = {
  PROJECT_ID: '42652',
  get PROJECT_URL() { return `https://scale.dingtalk.com/projects/${this.PROJECT_ID}/data`; },
  CDP_URL: 'http://127.0.0.1:9222',
  TOP_N_CANDIDATES: 3,
  SHOW_TRIM_WINDOWS: 5,
  POLL_INTERVAL_MS: 1500,
  BEEP: '\u0007',

  // Inherit from personal config
  ...USER_CONFIG
};

// ─── 1. LOGGING SETUP ────────────────────────────────────────────────────────
const logDir = path.join(__dirname, 'logs');
const verboseDir = path.join(logDir, 'verbose');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
if (!fs.existsSync(verboseDir)) fs.mkdirSync(verboseDir);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const humanLogFile = path.join(logDir, `proj${CONFIG.PROJECT_ID}_${timestamp}_human.log`);
const machineLogFile = path.join(logDir, `proj${CONFIG.PROJECT_ID}_${timestamp}_machine.jsonl`);
const verboseLogFile = path.join(verboseDir, `proj${CONFIG.PROJECT_ID}_${timestamp}_verbose.jsonl`);

function log(msg, data = null) {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${msg}`;

  // 1. Terminal + Human Log
  console.log(line);
  try {
    fs.appendFileSync(humanLogFile, line + '\n', 'utf8');
  } catch (err) { }

  // 2. Machine Logs (JSONL)
  if (data) {
    try {
      const timestampISO = new Date().toISOString();

      // A. Verbose Log: Save EVERYTHING
      const verboseEntry = JSON.stringify({
        timestamp: timestampISO,
        message: msg,
        ...data
      });
      fs.appendFileSync(verboseLogFile, verboseEntry + '\n', 'utf8');

      // B. Strict Log: Only actionable triplet for manual edits
      if (data.originalSnippet || data.pastedContent) {
        const strictEntry = JSON.stringify({
          taskID: data.taskID,
          originalSnippet: data.originalSnippet,
          pastedContent: data.pastedContent
        });
        fs.appendFileSync(machineLogFile, strictEntry + '\n', 'utf8');
      }
    } catch (err) { }
  }
}

// (CONFIG moved up to Logging Setup)

const sleep = (min, max = min) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

// ─── 0.5. CLI ARGS & SAFETY MODES ───────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const SWEEP_MODE = process.argv.includes('--sweep');

if (DRY_RUN) log('🔬 DRY RUN mode — scoring only, will NOT paste or submit.\n');
if (SWEEP_MODE) log('🧹 SWEEP mode — autonomous read-only cycle, will NOT paste or submit.\n');

/**
 * Simulates a human scrolling behavior by breaking large scrolls into smaller increments
 */
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

/**
 * Checks if a specific scrollable element has reached the absolute bottom.
 */
async function isScrollerAtBottom(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true;
    // Allow for a small 5px buffer for sub-pixel rendering
    return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 5);
  }, selector);
}

/**
 * Scrolls the table back to the absolute top.
 */
async function scrollToTop(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollTop = 0;
  }, selector);
}

// ─── 1. LOAD & CHUNK SCRIPTS.TXT ──────────────────────────────────────────────
let cleanChunks = [];
let lastMatchedChunkIndex = -1;
let currentProjectID = null;

let precomputedMap = new Map();
function loadReviewMap() {
  const mapPath = path.join(__dirname, `review_${CONFIG.PROJECT_ID}.txt`);
  if (!fs.existsSync(mapPath)) {
    log(`   ⚠️ No review text file found at ${mapPath}. Precomputed fast-track disabled.`);
    return;
  }
  const content = fs.readFileSync(mapPath, 'utf8');
  const lines = content.split('\n');
  let currentTaskID = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('[Task ')) {
      currentTaskID = line.match(/\[Task (\d+)\]/)[1];
    } else if (line.startsWith('MAP : ') && currentTaskID) {
      const mapVal = line.replace('MAP : ', '').trim();
      if (mapVal !== '<PLEASE REVIEW>') {
        precomputedMap.set(currentTaskID, mapVal);
      }
    }
  }
  log(`   📂 Loaded ${precomputedMap.size} precomputed mapped tasks from review file.`);
}

function loadScripts(projID) {
  let targetPath = path.join(__dirname, `scripts_${projID}.txt`);
  if (!fs.existsSync(targetPath)) {
    targetPath = path.join(__dirname, 'scripts.txt');
    log(`   ⚠️ scripts_${projID}.txt not found. Falling back to default scripts.txt`);
  } else {
    log(`\n   📂 Loaded dataset target: scripts_${projID}.txt`);
  }

  loadReviewMap();

  if (!fs.existsSync(targetPath)) return;

  const raw = fs.readFileSync(targetPath, 'utf8');
  const sentences = raw.replace(/\r\n/g, '\n').replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 15);

  cleanChunks = [];
  for (let i = 0; i < sentences.length; i++) {
    for (let len = 1; len <= 5 && i + len <= sentences.length; len++) {
      cleanChunks.push(sentences.slice(i, i + len).join(' '));
    }
  }
  log(`   └─ Parsed ${sentences.length} sentences → ${cleanChunks.length} window chunks`);
}

/**
 * Extracts the Absolute Truth of a Task ID from the Browser URL or the UI Header.
 */
async function getVerifiedTaskID(page) {
  // 1. Try URL (?task=xxxxx)
  const url = page.url();
  const match = url.match(/[?&]task=(\d+)/);
  if (match) return match[1];

  // 2. Try UI Element (.lsf-current-task__task-id)
  try {
    const uiID = await page.locator('.lsf-current-task__task-id').innerText({ timeout: 2000 });
    if (uiID && uiID.trim()) return uiID.trim().replace('#', '').trim();
  } catch (e) {
    // Fallback if UI is slow
  }
  return null;
}

// ─── 2. TEXT NORMALISATION ────────────────────────────────────────────────────
function normalize(text) {
  let norm = text.toLowerCase()
    // Treat "peratus" as % (consume leading space if present)
    .replace(/\s*peratus\b/g, '%')
    // Normalize reduplicated words to hyphenated form (user preference)
    // "sama sama" -> "sama-sama", "besar besaran" -> "besar-besaran"
    .replace(/\b([a-zA-Z]+)\s+(\1\w*)\b/gi, '$1-$2')
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

// ─── 2.5 FINAL PASTE FORMATTER (Grammar & Numbers) ───────────────────────
function formatForPasting(text) {
  let out = text;

  // 1. Convert specific number sequences to digits
  const units = { 'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4, 'lima': 5, 'enam': 6, 'tujuh': 7, 'lapan': 8, 'sembilan': 9 };
  const mags = { 'puluh': 10, 'belas': 1, 'ratus': 100, 'ribu': 1000, 'juta': 1000000, 'bilion': 1000000000 };
  out = out.replace(/\bseratus\s+peratus\b/gi, '100%');

  let words = out.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    const prev = i > 0 ? words[i - 1].toLowerCase() : '';
    if (units[w] !== undefined || w === 'sepuluh' || w === 'sebelas' || w === 'dua') {
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
      if (j > i + 1 || prev === 'ke') {
        words.splice(i, j - i, val.toString());
      }
    }
  }
  out = words.join(' ');

  // 2. Kata Ganda Penuh & Berimbuhan
  out = out.replace(/\b([a-zA-Z]+)\s+(\1\w*)\b/gi, '$1-$2');

  // Kata Ganda Berentak
  const berentak = {
    'sayur mayur': 'sayur-mayur', 'kuih muih': 'kuih-muih', 'batu batan': 'batu-batan',
    'saudara mara': 'saudara-mara', 'gunung ganang': 'gunung-ganang', 'lauk pauk': 'lauk-pauk',
    'warna warni': 'warna-warni', 'tolong menolong': 'tolong-menolong',
    'anai anai': 'anai-anai', 'rama rama': 'rama-rama', 'kura kura': 'kura-kura',
    'labah labah': 'labah-labah', 'agar agar': 'agar-agar', 'anting anting': 'anting-anting',
    'layang layang': 'layang-layang', 'undang undang': 'undang-undang',
    'sekali sekala': 'sekali-sekala', 'tiba tiba': 'tiba-tiba'
  };
  for (const [k, v] of Object.entries(berentak)) {
    out = out.replace(new RegExp(`\\b${k}\\b`, 'gi'), (match) => {
      return match[0] === match[0].toUpperCase() ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    });
  }

  // 3. Numerical Expressions
  out = out.replace(/\b(ke)\s+(\d+)\b/gi, '$1-$2');
  out = out.replace(/\b(\d+)\s+(an)\b/gi, '$1-$2');
  out = out.replace(/\b(COVID)\s*(19)\b/gi, 'COVID-19');
  out = out.replace(/\b(H5)\s*(N1)\b/gi, 'H5-N1');
  out = out.replace(/\b([A-Z]\w+)\s+(\d+)\b/g, '$1-$2');
  out = out.replace(/\b(\d+)\s+peratus\b/gi, '$1%');

  // 4. Prefixes with Proper Nouns
  out = out.replace(/\b(pro|anti|se|sub)\s+([A-Z]\w+)\b/g, '$1-$2');

  // 5. Divine Pronouns
  out = out.replace(/\b(\w+)\s+(Nya|Mu|Ku)\b/g, '$1-$2');

  // 6. e-terms
  out = out.replace(/\be\s+(mel|dagang|dompet|kasih|buku)\b/gi, 'e-$1');

  return out;
}

/**
 * Prefix-stripped variant for Malay morphology.
 * Prevents common prefixes from diluting the core keyword match.
 * Uses a conservative "Prefix-Only" approach to avoid over-stripping roots.
 */
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
function wordCount(text) { return text.trim().split(/\s+/).length; }

function sanityCheck(text, sec) {
  if (!sec) return { ok: true };
  const exp = expectedWords(sec), act = wordCount(text), ratio = act / exp;
  if (ratio < 0.35 || ratio > 2.8)
    return { ok: false, reason: `Word count mismatch: ${act} pasted, ~${exp} expected for ${sec.toFixed(1)}s` };
  return { ok: true };
}

// ─── 4. FINGERPRINT SCORER & BEST MATCH ──────────────────────────────────────
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
  'mampu', 'ditunjukkan', 'kegunaan', 'ditujukan', 'melibatkan', 'mempunyai', 'meningkatkan', 'peratus'
]);

/**
 * Calculates a fuzzy score for snippet 'anchors' (starts and ends).
 * Uses an adaptive size (6 to 10 words) to verify entry/exit points.
 */
function getFuzzyAnchorScore(messyWords, chunkText, type = 'head') {
  const sizes = [6, 10]; // Adaptive check: start small, scale up if needed
  let bestGlobalSim = 0;

  for (const size of sizes) {
    if (messyWords.length < size) continue;

    const snippet = messyWords.slice(type === 'head' ? 0 : -size, type === 'head' ? size : undefined).join(' ');
    const normSnippet = normalize(snippet);
    const chunkWords = normalize(chunkText).split(/\s+/);

    if (chunkWords.length < size) continue;

    let bestSizeSim = 0;
    const searchRange = Math.max(size, Math.floor(chunkWords.length * 0.40));

    if (type === 'head') {
      for (let i = 0; i <= searchRange; i++) {
        const window = chunkWords.slice(i, i + size).join(' ');
        const sim = stringSimilarity.compareTwoStrings(normSnippet, window);
        if (sim > bestSizeSim) bestSizeSim = sim;
        if (bestSizeSim > 0.95) break;
      }
    } else {
      const start = Math.max(0, chunkWords.length - searchRange - size);
      for (let i = start; i <= chunkWords.length - size; i++) {
        const window = chunkWords.slice(i, i + size).join(' ');
        const sim = stringSimilarity.compareTwoStrings(normSnippet, window);
        if (sim > bestSizeSim) bestSizeSim = sim;
        if (bestSizeSim > 0.95) break;
      }
    }

    // We take the average or the best found across sizes
    if (bestSizeSim > bestGlobalSim) bestGlobalSim = bestSizeSim;
    if (bestGlobalSim > 0.90) break; // If 6 words are perfect, no need for 10
  }

  return bestGlobalSim;
}

function scoreChunkVerbose(messy, chunk, normFn = normalize) {
  const nm = normFn(messy), nc = normFn(chunk);
  const mArr = nm.split(/\s+/);
  const kw = [...new Set(mArr.filter(w => (w.length > 3 || !isNaN(w)) && !FILLER.has(w)))];

  const overlap = kw.length ? kw.filter(w => nc.includes(w)).length / kw.length : 0;
  const sim = stringSimilarity.compareTwoStrings(nm, nc);

  let tri = 0, bi = 0;
  for (let i = 0; i < mArr.length - 2; i++) if (nc.includes(mArr.slice(i, i + 3).join(' '))) tri += 0.10;
  for (let i = 0; i < mArr.length - 1; i++) if (nc.includes(mArr.slice(i, i + 2).join(' '))) bi += 0.03;

  // --- ADAPTIVE FUZZY ANCHOR LOGIC ---
  const headAnchor = getFuzzyAnchorScore(mArr, chunk, 'head');
  const tailAnchor = getFuzzyAnchorScore(mArr, chunk, 'tail');

  // Balance Penalty: If Head matches but Tail is a total miss, it's not a tally!
  let anchorAvg = (headAnchor + tailAnchor) / 2;
  const imbalance = Math.abs(headAnchor - tailAnchor);

  if (imbalance > 0.5 || Math.min(headAnchor, tailAnchor) < 0.25) {
    anchorAvg *= 0.40; // Heavy penalty for "One-sided" matches
  }

  const triCapped = Math.min(tri, 0.40);
  const biCapped = Math.min(bi, 0.15);

  const total = overlap * 0.25 + sim * 0.10 + triCapped * 0.30 + biCapped * 0.10 + anchorAvg * 0.25;
  return { total, overlap, sim, trigram: triCapped, bigram: biCapped, anchor: anchorAvg, headAnchor, tailAnchor };
}

function scoreChunk(messy, chunk) {
  return scoreChunkVerbose(messy, chunk).total;
}

function bestMatch(snippet, durationSec) {
  const candidates = [];
  const expWords = durationSec ? expectedWords(durationSec) : null;

  for (let index = 0; index < cleanChunks.length; index++) {
    const chunk = cleanChunks[index];

    // [ELASTIC] Duration as a SIGNAL, not a hard disqualifier
    // We only skip if the chunk is MASSIVELY different (e.g., 5x longer)
    const cw = wordCount(chunk);
    if (expWords && (cw < expWords * 0.2 || cw > expWords * 5.0)) continue;

    const scores = scoreChunkVerbose(snippet, chunk);

    // Duration-aware length bonus (max +0.05 for perfect length match)
    let lengthBonus = 0;
    if (expWords) {
      const ratio = cw > expWords ? expWords / cw : cw / expWords;
      lengthBonus = ratio * 0.05;
      scores.total += lengthBonus;
    }

    // Prefix-stripped scoring (from paste_lab.js)
    const strippedScores = scoreChunkVerbose(snippet, chunk, normalizeStripped);
    const strippedTotal = strippedScores.total + lengthBonus;

    candidates.push({ chunk, index, strippedTotal, ...scores });
  }

  candidates.sort((a, b) => b.total - a.total);

  if (candidates.length === 0) return { best: 0, second: 0, gap: 0, chunk: '', secondChunk: '', strippedAgrees: false, index: -1, secondIndex: -1 };

  const best = candidates[0];
  const second = candidates[1] || { total: 0, chunk: '', index: -1 };

  // Agreement check
  const strippedWinner = best.total < CONFIG.HIGH_CONFIDENCE
    ? [...candidates].sort((a, b) => b.strippedTotal - a.strippedTotal)[0]
    : candidates[0];
  const strippedAgrees = strippedWinner && strippedWinner.chunk === best.chunk;

  return {
    best: best.total,
    second: second.total,
    gap: best.total - (second.total || 0),
    chunk: best.chunk,
    index: best.index,
    secondChunk: second.chunk,
    secondIndex: second.index,
    strippedAgrees
  };
}

// ─── 5. HEAD-LOCK TRIMMER ────────────────────────────────────────────────────
/**
 * Finds where the snippet's head best aligns inside the chunk.
 * Returns the best starting position and its confidence score.
 */
function findHeadAnchorPosition(snippetText, chunkWords) {
  const normSnipHead = normalize(snippetText).split(/\s+/).slice(0, 5).join(' ');
  const normChunk = chunkWords.map(w => normalize(w));

  let bestSim = -1, bestPos = 0;
  // Search the first 60% of the chunk to safely catch heads in longer spanning chunks
  const searchLimit = Math.min(chunkWords.length - 5, Math.ceil(chunkWords.length * 0.60));

  for (let i = 0; i <= searchLimit; i++) {
    const win = normChunk.slice(i, i + 5).join(' ');
    const sim = stringSimilarity.compareTwoStrings(normSnipHead, win);
    if (sim > bestSim) { bestSim = sim; bestPos = i; }
  }
  return { pos: bestPos, confidence: bestSim };
}

function trimToSnippetLength(snippetText, matchedChunk) {
  const snippetWords = snippetText.trim().split(/\s+/), chunkWords = matchedChunk.trim().split(/\s+/);

  const normSnippet = normalize(snippetText), snippetArr = normSnippet.split(/\s+/);
  const minLen = Math.max(1, Math.floor(snippetWords.length * 0.75));
  const maxLen = Math.min(chunkWords.length, Math.ceil(snippetWords.length * 1.35));

  // HEAD-LOCK: Find where snippet starts in chunk
  const { pos: anchorPos, confidence: anchorConf } = findHeadAnchorPosition(snippetText, chunkWords);

  // Allow ±N positions around the anchor (tighter when confident)
  const tolerance = anchorConf > 0.80 ? 1 : anchorConf > 0.55 ? 2 : 3;
  const iMin = Math.max(0, anchorPos - tolerance);
  const iMax = Math.min(anchorPos + tolerance, chunkWords.length - minLen);

  let bestScore = -1, bestSeg = matchedChunk;

  for (let size = minLen; size <= maxLen; size++) {
    for (let i = iMin; i <= iMax; i++) {
      if (i + size > chunkWords.length) continue;

      const windowText = chunkWords.slice(i, i + size).join(' ');
      const normWin = normalize(windowText);

      let s = stringSimilarity.compareTwoStrings(normSnippet, normWin);
      let tri = 0;
      for (let j = 0; j < snippetArr.length - 2; j++) {
        if (normWin.includes(snippetArr.slice(j, j + 3).join(' '))) tri += 0.05;
      }

      // Fuzzy Anchor Preservation
      const headSim = getFuzzyAnchorScore(snippetArr, windowText, 'head');
      const tailSim = getFuzzyAnchorScore(snippetArr, windowText, 'tail');
      const anchorBonus = (headSim + tailSim) * 0.40;

      // Penalize floating away from the detected anchor point (prevents skipping garbled start words)
      const distancePenalty = Math.abs(i - anchorPos) * 0.05;

      const totalWinScore = s + Math.min(tri, 0.25) + anchorBonus - distancePenalty;
      if (totalWinScore > bestScore) {
        bestScore = totalWinScore;
        bestSeg = windowText;
      }
    }
  }
  return bestSeg;
}

// ─── 6. ROBUST DOM UI HELPERS ────────────────────────────────────────────────
const TEXTAREA_SEL = 'textarea[name="Annotation Result"]';

async function pauseForReview(reason) {
  process.stdout.write(CONFIG.BEEP);
  log(`\n🚨 PAUSED — ${reason}\n   Press ENTER to skip and continue…`);
  return new Promise(resolve => process.stdin.once('data', resolve));
}

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

async function pasteText(page, text) {
  const box = page.locator(TEXTAREA_SEL).first();
  await box.focus();

  // Use locator.press (isolated) instead of page.keyboard (global)
  await box.press('Control+A'); await sleep(80, 150);
  await box.press('Backspace');

  // "Thinking pause" between clearing and pasting
  await sleep(600, 1200);

  await box.fill(text.trim()); await sleep(100, 150);
  await box.press('Space'); await sleep(60, 100);
  await box.press('Backspace');
}

async function safeSubmit(page) {
  const submitBtn = page.locator('button[aria-label*="submit" i], button:has-text("Submit"), button:has-text("Save")').first();
  await submitBtn.click();
  await sleep(500, 800);
  try {
    const dialogBtn = page.locator('[data-testid*="ok" i], [data-testid*="confirm" i], button:has-text("Ignore"), button:has-text("OK")').first();
    await dialogBtn.waitFor({ state: 'visible', timeout: 1500 });
    await dialogBtn.click();
  } catch { }
}

async function safeGoBack(page) {
  try {
    await page.goBack({ timeout: 5000 });
    await sleep(400, 700);
  } catch {
    const m = page.url().match(/\/projects\/(\d+)/);
    if (m) await page.goto(`https://scale.dingtalk.com/projects/${m[1]}/data`, { timeout: 8000 });
  }
}

// ─── 7. MAIN LAUNCH & LOOP ───────────────────────────────────────────────────
(async () => {
  console.log(`🔌 Connecting to Opera on ${CONFIG.CDP_URL}...`);

  let browser;
  try {
    browser = await chromium.connectOverCDP(CONFIG.CDP_URL);
  } catch (e) {
    console.error(`❌ Connection failed. Make sure your Opera launcher is running on port 9222.`);
    process.exit(1);
  }

  const context = browser.contexts()[0];

  // Find the DingTalk tab, or fallback to the first tab
  let page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects'));

  if (!page) {
    log("❌ DingTalk tab not found. Please open the DingTalk URL in your browser first!");
    process.exit(1);
  } else {
    log(`✅ Attached to DingTalk tab: ${page.url()}`);
    // If we landed on the projects LIST page (not a task /data page), navigate there now
    if (!page.url().includes('/data')) {
      log(`   🚀 Not on a data page. Navigating to project ${CONFIG.PROJECT_ID}...`);
      await page.goto(CONFIG.PROJECT_URL, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await sleep(2000);
      log(`   ✅ Now on: ${page.url()}`);
    }
  }

  if (process.stdin.isTTY) { require('readline').emitKeypressEvents(process.stdin); process.stdin.setRawMode(false); }

  log("\n━━━ BOT ACTIVE ━━━\n");
  log(`📄 Logging (Human): ${humanLogFile}`);
  log(`📄 Logging (Machine): ${machineLogFile}\n`);
  let lastTaskID = '';
  const skippedTaskIDs = new Set(); // Permanent memory of all Update-skipped tasks
  const sweepHistory = new Set();   // Memory of analyzed tasks in SWEEP mode

  let isVerifying = false; // "Sweep & Verify" state
  const missingTasks = new Set();
  const sessionStats = {
    startTime: Date.now(),
    processed: 0,
    skipped: 0,
    mismatches: 0
  };

  const TABLE_SCROLLER = '.lsf-table [style*="overflow: auto"]';

  while (true) {
    try {

      const urlMatch = page.url().match(/projects\/(\d+)/);
      const projID = urlMatch ? urlMatch[1] : "unknown";
      if (projID !== currentProjectID) {
        loadScripts(projID);
        currentProjectID = projID;
      }
      await sleep(CONFIG.POLL_INTERVAL_MS);
      let processed = false;
      let targetTaskID = null;

      // ─── LADDER CRAWLER (QUICK SIBLING JUMP) ───
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

              if (!sweepHistory.has(taskID) && taskID !== lastTaskID && !skippedTaskIDs.has(taskID)) {
                log(`\n🪜 Climbing natively to next valid sibling (Task ${taskID})...`);

                if (cell1.trim() === '0') await pCells[1].dblclick({ force: true }).catch(() => { });
                else if (cell2.trim() === '0') await pCells[2].dblclick({ force: true }).catch(() => { });
                else await nextRow.dblclick({ force: true }).catch(() => { });

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

          // --- ZERO-FINDER (Adopted from jump_first.js) ---
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

          // --- MEMORY EXTRACTION (FAST SKIP) ---
          const checkbox = row.locator('.lsf-select-row input, input[aria-label^="Select Task"]').first();
          const ariaLabel = await checkbox.getAttribute('aria-label').catch(() => '');
          let taskID = ariaLabel ? ariaLabel.replace('Select Task ', '').trim() : 'Unknown';

          if (taskID === lastTaskID || skippedTaskIDs.has(taskID) || sweepHistory.has(taskID)) continue;

          // --- PRE-AIM & DOM STABILITY FIX ---
          await cells[1].hover({ force: true }).catch(() => { });
          await sleep(350, 650);

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

          if (true) {
            log(`\n🎯 Task ${taskID} found. [col1='${stableCol1}' col2='${stableCol2}' col10='${stableCol10}']`, {
              event: "task_discovered",
              taskID,
              col1: stableCol1,
              col2: stableCol2,
              col10: stableCol10
            });

            // --- INTERACTION ---
            if (stableCol1 === '0') await cells[1].dblclick({ force: true });
            else if (stableCol2 === '0') await cells[2].dblclick({ force: true });
            else await row.dblclick({ force: true });

            await page.evaluate(() => window.getSelection().removeAllRanges()).catch(() => { });
            lastTaskID = taskID;
            targetTaskID = taskID;
            processed = true;
            break;
          }
        }
      }

      // ─── UNIFIED TASK PROCESSOR ───
      if (processed && targetTaskID) {
        log(`\n🎯 Task ${targetTaskID} found and opened...`);

        // --- LOADING (Adopted from test_duration.js) ---
        log("   ⏳ Waiting for Wrapper & Waveform UI to load...");
        await page.waitForSelector('#waveform-layer-main', { timeout: 15000 }).catch(() => { });

        // --- VERIFY ID (The "Absolute Truth" fix) ---
        const verifiedID = await getVerifiedTaskID(page);
        if (verifiedID && verifiedID !== targetTaskID) {
          log(`   ⚠️ ID MISMATCH! Table said ${targetTaskID}, but UI/URL confirms ${verifiedID}. Correcting...`, {
            event: "id_mismatch",
            oldID: targetTaskID,
            newID: verifiedID
          });
          missingTasks.add(targetTaskID); // Failover: Record that the Table ID was phantom
          sweepHistory.add(targetTaskID); // Block the "Wrong" ID from the table row
          targetTaskID = verifiedID; // Update to the real ID
          sessionStats.mismatches++;
        }
        lastTaskID = targetTaskID;
        sweepHistory.add(targetTaskID); // Block the "Verified" ID

        log("   ⏳ Polling audio duration metadata...");
        const durationInput = page.locator('[data-testid="timebox-end-time"] input').first();
        let rawDur = "";
        for (let i = 0; i < 40; i++) {
          rawDur = await durationInput.inputValue().catch(e => "");
          if (rawDur && rawDur.length >= 5 && rawDur !== "00:00:00" && rawDur !== "00:00:00:000") break;
          process.stdout.write(".");
          await sleep(500);
        }
        log(""); // newline after dots

        // --- CLICK WAVEFORM (Natively, aligned with test_click.js) ---
        log(`   🖱️ Audio duration confirmed [${rawDur.trim()}]. Clicking waveform...`);
        await page.click('#waveform-layer-main').catch(() => { });
        await sleep(1000, 1500);

        // Check for Update button
        if (await page.locator('button:has-text("Update")').isVisible().catch(() => false)) {
          log("   ⏭️ Wrapper shows 'Update'! Task already done. Skipping.", {
            event: "skipped_completed",
            taskID: targetTaskID
          });
          skippedTaskIDs.add(targetTaskID);
          sessionStats.skipped++;

          await sleep(1000);
          processed = true; continue;
        }

        // 4. Parse the extracted Duration & Text
        let clipDur = parseDuration(rawDur);
        const snippet = await readTextarea(page);

        if (!snippet || snippet.length < 5) {
          log(`   ⚠ Textarea empty. Skipping.`);
          await safeGoBack(page); processed = true; continue;
        }

        log(`   📋 FULL SNIPPET EXTRACTED:\n--------------------------------------------------\n${snippet}\n--------------------------------------------------`);

        let finalPastedText = "";
        let mode = "";

        // --- 3. PRECOMPUTED FAST-TRACK ---
        if (precomputedMap.has(targetTaskID)) {
          finalPastedText = formatForPasting(precomputedMap.get(targetTaskID));
          mode = "precomputed map";
          log(`   ⚡ FAST-TRACK: Task ${targetTaskID} maps directly to review file. Bypassing scoring.`);
        } else {
          // 3.5 DYNAMIC MATCH AND TRIM (Fallback)
          let { best, second, gap, chunk, index: matchIndex, secondChunk, secondIndex, strippedAgrees } = bestMatch(snippet, clipDur);

          let matchModeLog = '';
          if (lastMatchedChunkIndex !== -1 && Math.abs(matchIndex - lastMatchedChunkIndex) > 3 && best > CONFIG.HIGH_CONFIDENCE) {
            matchModeLog = ` | 🦘 [Jump Detected: ${lastMatchedChunkIndex} -> ${matchIndex}]`;
          }

          log(`   📊 Score: ${best.toFixed(4)} | Gap: ${gap.toFixed(4)}${strippedAgrees ? ' | ✅ Stripped Agrees' : ' | ⚠️ Stripped Disagrees'}${matchModeLog}`, {
            event: "match_calculation",
            taskID: targetTaskID,
            bestScore: best,
            gap,
            matchIndex,
            strippedAgrees
          });

          // Tally Check: Warning for the "p j kita" case
          const results = scoreChunkVerbose(snippet, chunk);
          if (results.headAnchor < 0.3 || results.tailAnchor < 0.3) {
            log(`   ⚠️ TALLY WARNING: Anchor imbalance detected (H:${results.headAnchor.toFixed(2)}, T:${results.tailAnchor.toFixed(2)}). Possible ASR hallucination.`);
            if (!SWEEP_MODE && !DRY_RUN) {
              await pauseForReview(`Anchor imbalance too high. Verify before pasting. Press Enter to skip.`);
              await safeGoBack(page); processed = true; continue;
            }
          }

          let isAmbiguous = false;
          if (best > CONFIG.LOW_CONFIDENCE && gap < CONFIG.AMBIGUITY_GAP) {
            const sim12 = stringSimilarity.compareTwoStrings(normalize(chunk), normalize(secondChunk));
            if (sim12 > 0.40) {
              log(`   💡 Ambiguity ignored (Overlapping/Similar sentences, sim=${sim12.toFixed(3)}).`);
            } else {
              // --- TIE-BREAKER MAGNET ---
              log(`   🚨 AMBIGUOUS (Different sentences, gap=${gap.toFixed(4)}). Calculating Tie-Breaker...`);

              const distance1 = Math.abs(matchIndex - (lastMatchedChunkIndex + 1));
              const distance2 = Math.abs(secondIndex - (lastMatchedChunkIndex + 1));

              if (lastMatchedChunkIndex !== -1 && distance2 <= 3 && distance1 > 3) {
                log(`   🧲 [MAGNET RESOLVED] Candidate 2 (${secondIndex}) logically aligns with Timeline (Last: ${lastMatchedChunkIndex}). Overriding Candidate 1 (${matchIndex})!`);
                chunk = secondChunk;
                matchIndex = secondIndex;
                best = second;
              } else if (lastMatchedChunkIndex !== -1 && distance1 <= 3 && distance2 > 3) {
                log(`   🧲 [MAGNET RESOLVED] Candidate 1 (${matchIndex}) logically aligns with Timeline (Last: ${lastMatchedChunkIndex}). Overriding Ambiguity pause!`);
              } else {
                isAmbiguous = true;
                await pauseForReview(`No Timeline Resolution possible. Press Enter to skip.`);
                await safeGoBack(page); processed = true; continue;
              }
            }
          }

          if (!isAmbiguous && (best >= CONFIG.LOW_CONFIDENCE || SWEEP_MODE)) {
            finalPastedText = formatForPasting(snippet);
            mode = "low-confidence fallback";

            if (best >= CONFIG.HIGH_CONFIDENCE) {
              const trimmed = trimToSnippetLength(snippet, chunk);
              finalPastedText = formatForPasting(trimmed);
              mode = "high-confidence (trimmed)";

              // --- SMART TRIM REVERT (Anchor-Aware) ---
              const postTrimScore = scoreChunk(snippet, trimmed);
              const expWords = expectedWords(clipDur);
              const fullErr = Math.abs(wordCount(chunk) - expWords);
              const trimErr = Math.abs(wordCount(trimmed) - expWords);

              // Fuzzy anchor check: did trimming lose our lock on the beginning or end?
              const snippetArr = normalize(snippet).split(/\s+/);
              const headSim = getFuzzyAnchorScore(snippetArr, trimmed, 'head');
              const tailSim = getFuzzyAnchorScore(snippetArr, trimmed, 'tail');
              const chunkHeadSim = getFuzzyAnchorScore(snippetArr, chunk, 'head');
              const chunkTailSim = getFuzzyAnchorScore(snippetArr, chunk, 'tail');

              const lostAnchor = (headSim < chunkHeadSim - 0.2) || (tailSim < chunkTailSim - 0.2);

              // Revert ONLY if (similarity dropped significantly AND length match didn't improve) OR anchor was lost
              if (lostAnchor) {
                log(`   ↩️ Trim lost fuzzy anchors (H:${headSim.toFixed(2)} vs ${chunkHeadSim.toFixed(2)}, T:${tailSim.toFixed(2)} vs ${chunkTailSim.toFixed(2)}). Reverting.`);
                finalPastedText = formatForPasting(chunk);
                mode = "high-confidence (full chunk — trim reverted)";
              } else if (postTrimScore < best - 0.05 && trimErr >= fullErr) {
                log(`   ↩️ Trim lowered score significantly (${postTrimScore.toFixed(4)} vs ${best.toFixed(4)}) and length didn't improve. Reverting.`);
                finalPastedText = formatForPasting(chunk);
                mode = "high-confidence (full chunk — trim reverted)";
              } else if (postTrimScore < best - 0.02) {
                log(`   💡 Trim lowered similarity slightly, but length alignment improved (Err: ${trimErr} vs ${fullErr}). Keeping trim.`);
              }
            }

            const sanity = sanityCheck(finalPastedText, clipDur);
            if (!sanity.ok) {
              log(`   🚨 Sanity Check Failed: ${sanity.reason}`);

              // Auto-revert: if trim was too aggressive, try the full un-trimmed chunk
              if (mode.includes('trimmed') && finalPastedText !== snippet) {
                const fullSanity = sanityCheck(chunk, clipDur);
                const errTrim = Math.abs(wordCount(finalPastedText) - expectedWords(clipDur));
                const errFull = Math.abs(wordCount(chunk) - expectedWords(clipDur));
                if (fullSanity.ok || errFull < errTrim) {
                  log(`   ↩️ Reverting to full un-trimmed chunk (better duration match).`);
                  finalPastedText = chunk;
                  mode = 'high-confidence (full chunk — trim reverted)';
                } else {
                  await pauseForReview(`Sanity failed and trim revert didn't help. Press Enter to skip.`);
                  await safeGoBack(page); processed = true; continue;
                }
              } else {
                await pauseForReview(`Sanity failed. Press Enter to skip.`);
                await safeGoBack(page); processed = true; continue;
              }
            }

            // [STATEFUL TRACKING] Update the bookmark for the next chronological task
            if (matchIndex !== undefined && matchIndex !== -1) {
              lastMatchedChunkIndex = matchIndex;
            }
          } else if (!isAmbiguous && !SWEEP_MODE) {
            log(`   ❌ LOW CONFIDENCE. Skipping.`);
            await safeGoBack(page); processed = true; continue;
          }
        } // === END OF DYNAMIC MATCHING ===

        if (!finalPastedText && !SWEEP_MODE) continue;

        log(`   📝 CONFIRMING PASTE CONTENT:\n--------------------------------------------------\n${finalPastedText}\n--------------------------------------------------`);

        if (DRY_RUN || SWEEP_MODE) {
          log('\n   🔬 READ-ONLY (DRY RUN / SWEEP) — not pasting.', {
            taskID: targetTaskID,
            originalSnippet: snippet,
            pastedContent: finalPastedText
          });
          if (SWEEP_MODE) {
            await sleep(1500);
            await page.keyboard.press('Escape').catch(() => { });
            await sleep(1000);
            sweepHistory.add(targetTaskID); // Remember we saw this!
            processed = true; continue;
          }
          // For standalone dry-run, we just stop here
          process.exit(0);
        }

        await pasteText(page, finalPastedText);

        // Humanize: Add random 'lost focus' staring delay
        const staringJitter = Math.floor(Math.random() * 4000) + 1500;
        const reviewTime = Math.max(3000, wordCount(finalPastedText) * 200) + staringJitter;
        log(`   🤔 Added Human Staring Jitter: +${(staringJitter / 1000).toFixed(1)}s`);
        log(`   ⏳ Review pause: ${(reviewTime / 1000).toFixed(1)}s...`);
        await sleep(reviewTime, reviewTime + 1000);

        log('   ⏳ WAITING 3 SECONDS... PRESS CTRL+C NOW TO CANCEL IF WRONG!');
        await sleep(3000);
        log('   🖱 Submitting...');
        await safeSubmit(page);
        log('   ✅ Submitted.', {
          taskID: targetTaskID,
          originalSnippet: snippet,
          pastedContent: finalPastedText
        });
        missingTasks.delete(targetTaskID); // If it was previously marked as missing, it's found now!
        sessionStats.processed++;
        await sleep(2000, 3000);
        processed = true;
        isVerifying = false; // Reset verification if we found something
        continue;
      }
      // --- COMPLETION DETECTION ('Sweep & Verify' logic) ---
      if (!processed) {
        const atBottom = await isScrollerAtBottom(page, TABLE_SCROLLER);

        if (atBottom) {
          if (!isVerifying) {
            log("\n🔍 REACHED BOTTOM. Performing one final 'Sweep & Verify' from top...");
            await scrollToTop(page, TABLE_SCROLLER);
            await sleep(2000);
            isVerifying = true; // Enter verification mode
          } else {
            // We were ALREADY verifying and reached the bottom again = TRULY DONE!
            process.stdout.write(CONFIG.BEEP);
            const durationMin = ((Date.now() - sessionStats.startTime) / 60000).toFixed(1);

            log(`\n━━━━━━━━━━━━━━━━━━━━ SESSION COMPLETE ━━━━━━━━━━━━━━━━━━━━`);
            log(`🏁 No more tasks found after a full sweep.`);
            log(`📊 Successes:  ${sessionStats.processed}`);
            log(`⏭️  Skipped:    ${sessionStats.skipped}`);
            log(`⚠️  Mismatches: ${sessionStats.mismatches}`);

            if (missingTasks.size > 0) {
              log(`🕵️  MISSING TASKS: ${Array.from(missingTasks).join(', ')} (Skipped due to ID Mismatch)`);
            }

            log(`⏳ Duration:   ${durationMin} minutes`);
            log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`, {
              event: "session_summary",
              ...sessionStats,
              missingTasks: Array.from(missingTasks),
              durationMin
            });

            process.exit(0);
          }
        } else {
          // Not at bottom yet, keep scrolling down
          await smoothScroll(page, TABLE_SCROLLER, 800);
          await sleep(600, 900);
        }
      }
    } catch (e) {
      log(`   ❌ Loop error: ${e.message}`);
      await sleep(2000);
    }
  }
})();