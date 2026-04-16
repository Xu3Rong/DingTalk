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

// ─── 1. CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  PROJECT_ID: '39649',
  CDP_URL: 'http://127.0.0.1:9222',

  // ── Scorer thresholds (tune here, then copy to ok.js when happy) ──
  HIGH_CONFIDENCE: 0.40,
  LOW_CONFIDENCE: 0.24,
  AMBIGUITY_GAP: 0.04,

  // ── Duration / word-count ──
  WORDS_PER_SECOND: 1.55,
  LENGTH_TOLERANCE: 3.5,

  // ── Lab display ──
  TOP_N_CANDIDATES: 3,
  SHOW_TRIM_WINDOWS: 5,

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

// ─── 2. LOGGING (mirrors ok.js dual-log) ─────────────────────────────────────
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const humanLogFile = path.join(logDir, `lab_proj${CONFIG.PROJECT_ID}_${timestamp}_human.log`);
const machineLogFile = path.join(logDir, `lab_proj${CONFIG.PROJECT_ID}_${timestamp}_machine.jsonl`);

function log(msg, data = null) {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(humanLogFile, line + '\n', 'utf8');
  } catch (_) { }
  if (data) {
    try {
      const entry = JSON.stringify({ timestamp: new Date().toISOString(), ...data });
      fs.appendFileSync(machineLogFile, entry + '\n', 'utf8');
    } catch (_) { }
  }
}
