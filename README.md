# 🤖 DingTalk Task Automation Suite

A hardened, human-like automation tool for processing tasks on the DingTalk Scale platform. This suite is designed for 100% accuracy, stealth, and autonomous operation.

This is whole thing is made by ai, they paidme, hence i just made it public, anyone can use this to helps out their side gig, its not polished, goodluck.

---

## 🚀 One-Time Installation
If you are setting up the bot for the first time, you must prepare your environment.

1.  **Install Node.js**: Download and install the **LTS** version from [nodejs.org](https://nodejs.org/).
2.  **Download & Extract**: 
    - Click the green **Code** button on GitHub and select **"Download ZIP"**.
    - Right-click the downloaded file and choose **"Extract All"**.
3.  **Open with Antigravity (AI Assistant)**: 
    - Open your **Antigravity / AI Code Editor**.
    - **UI Navigation**: Click on **"File"** > **"Open Folder"** and select your extracted `DingTalk` folder.
4.  **Install Engine & Tools**:
    ```bash
    npm install
    npx playwright install chromium
    ```

---

## 🔝 The Tool Hierarchy

### 1. Fully Automated (Legacy / Direct)
Best for quick tasks or when scripts are already high-fidelity and fixed.
*   **`ok.js`**: Features **Embedded Caching with Magnet Continuation**. It locks onto the timeline to ensure no gaps between sentences.
*   **`ok_single_task.js`**: The stable release for surgical, high-accuracy processing of single specific Task IDs. 

### 2. Professional 3-Step Workflow (Recommended)
This workflow ensures zero boundary errors and 100% human-verified accuracy.

#### Step 1: Pre-Flight (Extraction)
Run this once to grab all raw ASR data from the project.
```bash
node preflight.js
```
*   **Output**: Compiles everything into a `.jsonl` log. 
*   *Note: If it skips a task, don't worry—the Audit step has a built-in fallback.*

#### Step 2: The Mapper (Alignment)
Compares the raw logs against your fixed `scripts_XXXXX.txt`.
```bash
node mapper.js
```
*   **Output**: Generates `review_XXXXX.txt` containing:
    *   `TaskID`: The unique identifier.
    *   `RAW`: What the ASR heard.
    *   `MAP`: The proposed script text.
    *   `CTX`: ±15 words of context (Head/Tail) for easy visual verification.
    *    note : right click the review_xxxxx.txt and Open in File Explorer, then select any tools eg : Notepad, to update and then save (Ctrl + S).
    *    So now, the review_xxxxx.txt is your one stop update, and the automation will be based on this script. You may manually update by looking at the head or tail, if it deviates too much use the TaskID to search (Ctrl + F) on the DingTalk Annotation platform to be sure, but make sure you search in the table view, not the side panel view. Alternatively, you can copy the whole thing to AI to tally the RAW and MAP. 

#### Step 3: The Audit (Final Submission)
Automates the copy-pasting into the DingTalk UI.
```bash
node ok_compare.js
```
*   **Logic**: Fast-tracks every task from your `review_XXXXX.txt`.
*   **Fallback**: If a Task ID is missing from your review file, the auditor automatically triggers its internal scanning logic (same as `ok.js`) to find the best match on the fly. 

---

## 🧠 AI-Driven Review (Human-In-The-Loop)
Before running the final Audit (`ok_compare.js`), you can ensure 100% perfection:
1.  Open `review_projID.txt` in Notepad.
2.  Copy a few `RAW` vs `MAP` snippets into an AI (like Antigravity or ChatGPT).
3.  Ask: *"Compare the RAW vs MAP—does the MAP perfectly preserve the grammar while matching the spoken content?"*
4.  Optionally fix any `MAP :` lines manually in the text file.

---

## ⚠️ The Golden Rules
*   **Browser Zoom**: MUST be set to **100%** (`Ctrl + 0`).
*   **Window Size**: Always keep the Chrome window **Maximized**.
*   **Multitasking**: You **CAN** use other tabs! The bot uses isolated input events. Just do not click or type inside the specific DingTalk tab the bot is using.

---

## ⚙️ Project Configuration

### 1. Switching Projects
To change the target project, update the `PROJECT_ID` at the top of your `.js` files:
```javascript
PROJECT_ID: '39649', // Change this to your current Project ID
```

### 2. Changing the CDP Port
If port **9222** is in use, change it in **both** `chrome_launcher.js` and your bot script:
*   **`chrome_launcher.js`**: Line 18 (`--remote-debugging-port=9222`).
*   **Bot Script**: Update the `CDP_URL` accordingly.

---

## 📦 Project Structure
*   `ok_compare.js`: The high-speed auditor used for final submission sweeps.
*   `preflight.js`: Rapid raw-data extractor (no-edit mode).
*   `mapper.js`: The continuous-timeline script alignment engine.
*   `ok_single_task.js`: Surgical fallback tool for specific Task IDs.
*   `chrome_launcher.js`: Opens Chrome in stealth mode for manual login.
*   `scripts_XXXXX.txt`: Your source text dataset for Project XXXXX.
*   `review_XXXXX.txt`: The Human-In-The-Loop review file (The "Absolute Truth").
*   `logs/`: Where your session history (Human and Machine formats) is saved.
*   `debug_*.js`: Diagnostic scripts for troubleshooting UI alignment.

---

## 🤖 AI Prompt Library

Copy and paste these prompts directly into any AI (Antigravity, ChatGPT, Claude) for each step of your workflow.

---

### 📝 Prompt 1 — Essay Generation (Script Writing)

Use this to generate a new 3,500–5,000 word Malay technical essay for recording.

> **Instructions**: Paste this into AI, then fill in your topic in the `[MASUKKAN SENARIO]` placeholder.

```
Sila bertindak sebagai pakar penulisan akademik global. Tugas anda adalah untuk membantu saya menjana esei teknikal yang mendalam dalam bahasa Melayu (Bidang: Perubatan, Kewangan, atau Undang-undang) dengan sasaran 3,500 hingga 5,000 patah perkataan.

ARAHAN FASA 1:
Sila berikan satu senario teknikal yang unik dan spesifik bagi bidang tersebut, diikuti dengan rangka esei terperinci yang mengandungi 20 (dua puluh) isi fakta teknikal. Selepas memberikan rangka ini, sila tunggu arahan saya untuk memulakan pengembangan teks.

KEKANGAN WAJIB (SOP):
1. Tanpa Unsur Malaysia: Jangan sebut lokasi, organisasi, mata wang tempatan, atau isu berkaitan Malaysia. Gunakan konteks global (cth: dolar, euro, yen) dan lokasi antarabangsa (cth: Amerika Syarikat, Kesatuan Eropah).
2. Format Nombor & Peratus:
   - Data Tepat: Gunakan angka untuk tarikh, masa, ukuran, dan data teknikal tepat.
   - Peratus: Gunakan simbol % sahaja tanpa perkataan peratus.
   - Nombor Bulat (Satu): Hanya seratus, seribu, dan sejuta ditulis dalam perkataan sahaja.
   - Nombor Kompleks & Mata Wang: Tulis angka diikuti cara baca dalam kurungan. Contoh: 150 (seratus lima puluh), 2000 (dua ribu) dolar.
   - Tahun: Tulis angka dan cara baca berpasangan. Contoh: 1987 (sembilan belas lapan puluh tujuh), 2026 (dua puluh dua puluh enam).
3. Tatabahasa & Tanda Baca:
   - Gunakan sempang (-) untuk kata ganda seperti faktor-faktor atau besar-besaran.
   - Dilarang menggunakan tanda em-dash (—) atau tanda petik ("") untuk istilah teknikal.
   - Gunakan istilah bahasa Melayu formal sepenuhnya daripada Kamus Dewan.
4. Struktur Pengembangan (Fasa 2): Setiap perenggan fakta mesti mengandungi variasi ayat: Rangsangan, Sejarah, Semasa, Persoalan, Kesan, Mengapa, Bagaimana, Penegasan Isi, Penyimpul, Cadangan Khusus, dan Harapan.
5. Format Perenggan: Gunakan hanya satu baris baharu (line break) antara perenggan tanpa ruang kosong tambahan.
6. Output: Berikan teks mentah tanpa label heading atau petunjuk jenis ayat.

TEMA UNTUK ESEI INI: [MASUKKAN SENARIO SPESIFIK DI SINI]
```

> **💡 Tip**: After the AI gives you the outline, just say **"Kembangkan isi 1 hingga 5"** then **"Sambung"** for each subsequent batch.

---

### 🔬 Prompt 2 — Review File Auditor (mapper.js output)

Use this **after running mapper.js** to QA-check your `review_XXXXX.txt` before the final submission run.

> **Instructions**: Open `review_XXXXX.txt`, copy a block of `[Task ...]` entries, and paste them at the bottom of this prompt.

```
You are an expert audio transcription auditor and data cleaner. I will provide you with data snippets containing three crucial elements:

RAW: The raw, unedited audio transcription (which may contain phonetic errors, missing punctuation, or AI hallucinations).
CTX: The surrounding textual context for the snippet.
MAP: The proposed cleaned, corrected, and formatted target text.

Your task is to act as a Quality Assurance check. Compare the RAW and MAP texts, using the CTX as your guide. Evaluate if the MAP perfectly captures the intended spoken content from the RAW audio while applying perfect grammar, correct terminology, and proper formatting.

For each snippet provided, respond using only one of the following formats:

✅ PASS
[Optional: Brief 1-sentence note if a particularly clever phonetic correction was made.]

⚠️ MINOR FIX NEEDED
[Explain the minor issue, e.g., "The MAP missed a required comma after 'Kesannya'."]

❌ FAIL (MISMATCH)
[Explain the critical failure, e.g., "The MAP completely diverges from the RAW and discusses a different topic."]

Here are the snippets to review:

(Paste your copied snippets from review_XXXXX.txt here)
```

---

### 📋 Prompt 3 — Legacy Log Auditor (ok.js / ok_compare.js)

After a live `ok.js` or `ok_compare.js` run, use this to verify the session log is accurate.

> **Instructions**: Open your `logs/proj_XXXXX_human.log`, copy the lines for each task (from `🎯 Task found` to `✅ Submitted`), and paste them at the bottom of this prompt.

```
You are an expert data-entry quality auditor for audio transcription tasks.

I will provide you with session log entries from an automation bot. Each entry contains two key fields:

SNIPPET EXTRACTED: The raw text the bot read from the audio transcription box.
CONFIRMING PASTE CONTENT: The final cleaned text the bot submitted.

Your task is to verify each submission. Compare the SNIPPET and the PASTE CONTENT and tell me:

✅ PASS — The pasted content correctly cleans and formats the raw snippet, preserving all meaning.

⚠️ MINOR ISSUE — The pasted content has a trivial difference (e.g., a minor punctuation fix or a single extra/missing word at the boundary) that does not affect meaning.

❌ FAIL (CRITICAL ERROR) — The pasted content significantly diverges from the snippet, introduces new words not in the original, or omits a key idea.

For failures, also suggest what the correct text should have been.

Here are the log entries to audit:

(Paste your copied log entries here)
```

---

### 🎯 Prompt 4 — Single Task Verifier (ok_single_task.js)

Use this when `ok_single_task.js` processes a specific Task ID and you want to verify that one result before approving it.

> **Instructions**: Copy the full terminal output of a single `ok_single_task.js` run and paste it at the bottom.

```
You are a strict transcription QA specialist. I will provide you with the output of a single-task automation run. It includes:

- The Task ID processed.
- The RAW SNIPPET from the audio transcription box.
- The FINAL PASTED TEXT after cleaning and alignment.
- The confidence score and alignment mode used.

Your job is to evaluate this single submission on three criteria:

1. ACCURACY — Does the pasted text faithfully represent the spoken content in the raw snippet?
2. GRAMMAR — Is the pasted text grammatically correct Malay? (Check for proper punctuation, capitalization, and formal vocabulary.)
3. BOUNDARY — Does the text start and end at natural sentence boundaries, or does it cut off mid-sentence?

Respond with:
✅ APPROVED — Ready to submit.
⚠️ NEEDS REVIEW — [Describe the specific issue and suggest the fix.]
❌ REJECT — [Explain why and provide the corrected text.]

Here is the task output to verify:

(Paste your ok_single_task.js terminal output here)
```

---

## 🤝 For Collaborators
1.  **Invite**: Add your friend as a collaborator in **Settings > Collaborators**.
2.  **Download**: They can then visit the repo and select **"Download ZIP"** from the green Code button.
3.  **AI Support**: They can drag their `/logs` or `review_XXXXX.txt` into any AI using Prompt 2 or 3 above for instant quality checking.
