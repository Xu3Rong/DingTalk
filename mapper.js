/**
 * mapper.js — Continuous Token Alignment Engine
 * Matches raw ASR extractions to the master script on a continuous timeline.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');

const CONFIG = {
  PROJECT_ID: '39649',
  HIGH_CONFIDENCE: 0.40,  // Exact scale from ok.js
  LOW_CONFIDENCE: 0.24,   // Exact scale from ok.js
};

const FILLER = new Set([
  'yang', 'dan', 'dia', 'ini', 'itu', 'akan', 'untuk', 'dengan', 'dari', 'pada', 'oleh',
  'ke', 'di', 'ia', 'si', 'tu', 'ni', 'juga', 'atau', 'pun', 'saja', 'sahaja', 'lagi',
  'sudah', 'telah', 'sedang', 'boleh', 'tidak', 'tak', 'ada', 'satu', 'kami', 'kita',
  'anda', 'saya', 'mereka', 'kamu', 'merupakan', 'iaitu', 'adalah', 'sebagai', 'bagi', 'secara', 'setiap', 'serta',
  'dalam', 'paling', 'hal', 'maka', 'bagaimana', 'dicapai', 'natijahnya', 'kesannya',
  'perkara', 'penegasan', 'terhadap', 'harapan', 'harus', 'sedar',
  'bahawa', 'menjadi', 'melalui', 'seterusnya', 'lebih',
  'mampu', 'ditunjukkan', 'kegunaan', 'ditujukan', 'melibatkan', 'mempunyai', 'meningkatkan', 'peratus'
]);

// ─── 1. CORE UTILS ────────────────────────────────────────────────────────
function normalize(text) {
  let norm = text.toLowerCase()
    .replace(/\s*peratus\b/g, '%')
    .replace(/\b([a-zA-Z]+)\s+(\1\w*)\b/gi, '$1-$2')
    .replace(/[^\w\s\-%]/gi, '')
    .replace(/\s+/g, ' ').trim();

  const magMap = {
    'sebilion': '1000000000', 'sejuta': '1000000', 'seribu': '1000', 'seratus': '100', 'sepuluh': '10',
    'satu': '1', 'dua': '2', 'tiga': '3', 'empat': '4', 'lima': '5',
    'enam': '6', 'tujuh': '7', 'lapan': '8', 'sembilan': '9',
    'bilion': '000000000', 'juta': '000000', 'ribu': '000',
    'ratus': '00', 'puluh': '0', 'sebelas': '11',
    'sifar': '0', 'kosong': '0', 'setengah': '0.5'
  };
  Object.keys(magMap).forEach(word => {
    norm = norm.replace(new RegExp(`\\b${word}\\b`, 'g'), magMap[word]);
  });
  norm = norm.replace(/(\d)\s+(?=\d)/g, '$1');
  return norm;
}

function getFuzzyAnchorScore(snippetArr, chunkText, type = 'head') {
  const sizes = [6, 10];
  let bestGlobalSim = 0;
  for (const size of sizes) {
    if (snippetArr.length < size) continue;
    const snippet = snippetArr.slice(type === 'head' ? 0 : -size, type === 'head' ? size : undefined).join(' ');
    const normSnippet = normalize(snippet);
    const chunkWords = chunkText.split(/\s+/);
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
    if (bestSizeSim > bestGlobalSim) bestGlobalSim = bestSizeSim;
    if (bestGlobalSim > 0.90) break;
  }
  return bestGlobalSim;
}

function scoreChunkVerbose(nm, nc, snippetArr) {
  const kw = [...new Set(snippetArr.filter(w => (w.length > 3 || !isNaN(w)) && !FILLER.has(w)))];
  const overlap = kw.length ? kw.filter(w => nc.includes(w)).length / kw.length : 0;
  const sim = stringSimilarity.compareTwoStrings(nm, nc);

  let tri = 0, bi = 0;
  for (let i = 0; i < snippetArr.length - 2; i++) if (nc.includes(snippetArr.slice(i, i + 3).join(' '))) tri += 0.10;
  for (let i = 0; i < snippetArr.length - 1; i++) if (nc.includes(snippetArr.slice(i, i + 2).join(' '))) bi += 0.03;

  const headAnchor = getFuzzyAnchorScore(snippetArr, nc, 'head');
  const tailAnchor = getFuzzyAnchorScore(snippetArr, nc, 'tail');
  
  let anchorAvg = (headAnchor + tailAnchor) / 2;
  const imbalance = Math.abs(headAnchor - tailAnchor);
  if (imbalance > 0.5 || Math.min(headAnchor, tailAnchor) < 0.25) anchorAvg *= 0.40; 

  const triCapped = Math.min(tri, 0.40);
  const biCapped = Math.min(bi, 0.15);
  
  return overlap * 0.25 + sim * 0.10 + triCapped * 0.30 + biCapped * 0.10 + anchorAvg * 0.25;
}

// ─── 2. CONTINUOUS ALIGNMENT ALGORITHM ────────────────────────────────────
let masterWordsRaw = [];
let masterWordsNorm = [];

function loadScripts(projID) {
  let targetPath = path.join(__dirname, `scripts_${projID}.txt`);
  if (!fs.existsSync(targetPath)) targetPath = path.join(__dirname, 'scripts.txt');
  if (!fs.existsSync(targetPath)) {
    console.error("❌ No scripts.txt found.");
    process.exit(1);
  }
  const raw = fs.readFileSync(targetPath, 'utf8');
  masterWordsRaw = raw.replace(/\r\n/g, '\n').replace(/\n+/g, ' ').split(/\s+/).filter(w => w.trim().length > 0);
  masterWordsNorm = masterWordsRaw.map(w => normalize(w));
  console.log(`✅ Loaded Master Script: ${masterWordsRaw.length} continuous words.`);
}

function findGlobalHead(normSnipHeadArr) {
   const normSnipHead = normSnipHeadArr.join(' ');
   let bestSim = -1, bestIndex = 0;
   // Jump by 2 words for speed across the entire document
   for (let i = 0; i <= masterWordsNorm.length - 5; i += 2) {
      const win = masterWordsNorm.slice(i, i + 5).join(' ');
      const sim = stringSimilarity.compareTwoStrings(normSnipHead, win);
      if (sim > bestSim) { bestSim = sim; bestIndex = i; }
   }
   return { bestIndex, bestSim };
}

function mapSnippet(snippet, currentAnchorIndex) {
  const normSnippet = normalize(snippet);
  const snippetArr = normSnippet.split(/\s+/);
  const snippetLen = snippetArr.length;

  if (snippetLen < 5) {
      return { score: 0, mappedText: "<Fragment Too Small>", context: "", newAnchor: currentAnchorIndex };
  }

  // 1. Defind Chronological Local Search Window
  let windowStart = Math.max(0, currentAnchorIndex - 30); // Slight overlap backward
  let windowEnd = Math.min(masterWordsNorm.length, currentAnchorIndex + 600); 

  // 2. Find Head Anchor inside Local Window
  let normSnipHeadArr = snippetArr.slice(0, 5);
  let normSnipHead = normSnipHeadArr.join(' ');
  let bestHeadSim = -1, bestHeadIndex = windowStart;
  
  for (let i = windowStart; i <= windowEnd - 5; i++) {
    const win = masterWordsNorm.slice(i, i + 5).join(' ');
    const sim = stringSimilarity.compareTwoStrings(normSnipHead, win);
    if (sim > bestHeadSim) { bestHeadSim = sim; bestHeadIndex = i; }
  }

  // 3. Fallback to Global if Local is completely lost (e.g. user skipped 10 audio files)
  if (bestHeadSim < 0.40) {
      process.stdout.write('💫 (Global Recenter) ');
      const global = findGlobalHead(normSnipHeadArr);
      if (global.bestSim > 0.50) {
          bestHeadSim = global.bestSim;
          bestHeadIndex = global.bestIndex;
          windowStart = Math.max(0, bestHeadIndex - 10);
          windowEnd = Math.min(masterWordsNorm.length, bestHeadIndex + 600);
      }
  }

  // 4. Elastic Expansion (Slide from Head to Tail)
  const minLen = Math.max(1, Math.floor(snippetLen * 0.75));
  const maxLen = Math.min(windowEnd - windowStart, Math.ceil(snippetLen * 1.50));

  const tolerance = bestHeadSim > 0.80 ? 2 : 5;
  const iMin = Math.max(windowStart, bestHeadIndex - tolerance);
  const iMax = Math.min(windowEnd - minLen, bestHeadIndex + tolerance);

  let bestScore = -1;
  let bestRawText = "";
  let bestContextText = "";
  let bestMappingIndex = currentAnchorIndex; 

  for (let size = minLen; size <= maxLen; size++) {
    for (let i = iMin; i <= iMax; i++) {
      if (i + size > masterWordsNorm.length) continue;
      
      const windowNormWords = masterWordsNorm.slice(i, i + size);
      const normWin = windowNormWords.join(' ');
      
      const algorithmRawScore = scoreChunkVerbose(normSnippet, normWin, snippetArr);

      // Distance Penalty to discourage roaming away from the discovered head anchor
      const distancePenalty = Math.abs(i - bestHeadIndex) * 0.05;
      const totalWinScore = algorithmRawScore - distancePenalty;
      
      if (totalWinScore > bestScore) {
        bestScore = totalWinScore;
        bestRawText = masterWordsRaw.slice(i, i + size).join(' ');
        
        const ctxStart = Math.max(0, i - 15);
        const ctxEnd = Math.min(masterWordsRaw.length, i + size + 15);
        bestContextText = masterWordsRaw.slice(ctxStart, ctxEnd).join(' ');
        
        bestMappingIndex = i;
      }
    }
  }

  // 5. Hard Global Recovery: If score is absolutely terrible, the Head we found was likely an ASR hallucination or irrelevant repetition.
  if (bestScore < 0.24) {
      process.stdout.write('🚑(Global) ');
      const global = findGlobalHead(normSnipHeadArr);
      if (global.bestSim > 0.50 && Math.abs(global.bestIndex - currentAnchorIndex) > 100) {
          // Recurse with the new global anchor exactly once
          return mapSnippet(snippet, Math.max(0, global.bestIndex - 10)); 
      }
  }

  // Do not advance anchor timeline if confidence is horrible (prevents wandering off track)
  const nextAnchor = bestScore >= CONFIG.LOW_CONFIDENCE ? (bestMappingIndex + Math.floor(snippetLen * 0.80)) : currentAnchorIndex;

  return { score: bestScore, mappedText: bestRawText, context: bestContextText, newAnchor: nextAnchor };
}

// ─── 3. RUNNER ─────────────────────────────────────────────────────────────
(async () => {
  loadScripts(CONFIG.PROJECT_ID);

  let jsonlPath = process.argv[2];
  if (!jsonlPath) {
    const preflightDir = path.join(__dirname, 'logs', 'preflight');
    if (fs.existsSync(preflightDir)) {
      const files = fs.readdirSync(preflightDir).filter(f => f.endsWith('.jsonl'));
      if (files.length > 0) {
        files.sort();
        jsonlPath = path.join(preflightDir, files[files.length - 1]);
      }
    }
  }

  if (!jsonlPath || !fs.existsSync(jsonlPath)) {
    console.error("❌ No preflight JSONL found. Path required: node mapper.js <path>");
    process.exit(1);
  }

  console.log(`📂 Analyzing: ${path.basename(jsonlPath)}`);
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(l => l.trim());
  const outputLines = [];

  let currentAnchorIndex = -1; // Unanchored until first task

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (!data.taskID || !data.rawSnippet) continue;

      const snippet = data.rawSnippet;
      
      if (currentAnchorIndex === -1) {
          const headArr = normalize(snippet).split(/\s+/).slice(0, 5);
          const global = findGlobalHead(headArr);
          if (global.bestSim > 0.50) {
              currentAnchorIndex = Math.max(0, global.bestIndex - 20);
              console.log(`📍 Session anchored dynamically near word index ${global.bestIndex}`);
          } else {
              currentAnchorIndex = 0;
          }
      }

      process.stdout.write(`Task ${data.taskID} `); // Progress dot
      const result = mapSnippet(snippet, currentAnchorIndex);
      
      // Update our sliding timeline pointer
      currentAnchorIndex = result.newAnchor;
      process.stdout.write(`✓\n`);

      let status = "🚨 LOW CONFIDENCE - PLEASE REVIEW";
      let mappedText = "<PLEASE REVIEW>";

      if (result.score >= CONFIG.HIGH_CONFIDENCE) {
        mappedText = result.mappedText;
        status = `✅ High Confidence (${result.score.toFixed(2)})`;
      } else if (result.score >= CONFIG.LOW_CONFIDENCE) {
        mappedText = result.mappedText;
        status = `⚠️ Medium Confidence (${result.score.toFixed(2)}) - Verify Boundaries!`;
      }

      outputLines.push(`[Task ${data.taskID}]`);
      outputLines.push(`RAW : ${snippet}`);
      outputLines.push(`MAP : ${mappedText}`);
      outputLines.push(`STAT: ${status}`);
      outputLines.push(`CTX : ... ${result.context.replace(/\n/g, ' ')} ...`);
      outputLines.push(`--------------------------------------------------\n`);

    } catch (e) {}
  }

  const outPath = path.join(__dirname, `review_${CONFIG.PROJECT_ID}.txt`);
  fs.writeFileSync(outPath, outputLines.join('\n'));
  console.log(`\n🎉 DONE! Generated review file at: ${outPath}`);
})();