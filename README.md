# 🤖 DingTalk Task Automation Suite

A hardened, human-like automation tool for processing tasks on the DingTalk Scale platform. This suite is designed for 100% accuracy, stealth, and autonomous operation.

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
    - **Chat Integration**: You can now talk to Antigravity (the AI) by dragging the files or logs into the chat for instant help.
4.  **Open the Terminal**: 
    - Inside your editor, open a new **Terminal** window (usually at the bottom).
    - Verify by typing `dir`. You should see `ok.js` in the list.
5.  **Install Engine & Tools**:
    ```bash
    npm install
    npx playwright install chromium
    ```

---

## 🏎️ Usage Workflow (The Professional Process)
To achieve zero-error mapping at 100% accuracy, we now use a 3-step surgical workflow.

### 1. The Pre-Flight (Data Extraction)
Extract all raw ASR data from the project into a log file without typing anything.
```bash
node preflight.js
```
*   **Result**: Generates a `.jsonl` log in the `logs/` folder.

### 2. The Mapper (Script Alignment)
Align the extracted ASR with your master script (`scripts_XXXXX.txt`) to create a review file.
```bash
node mapper.js
```
*   **Result**: Generates `review_XXXXX.txt`.
*   **Action**: Open `review_XXXXX.txt`. Scan for `PLEASE REVIEW` or low confidence scores. If a mapping is wrong, manually fix the `MAP :` line. Your corrections here become the "Absolute Truth" for the bot.

### 3. The Audit (Final Submission)
Run the high-speed Sweep auditor which uses your review file to paste corrected text.
```bash
node ok_compare.js
```
*   **Action**: The bot will fast-track every task using your corrected `review_XXXXX.txt`.
*   **Failover**: If the bot finishes and lists **MISSING TASKS** (due to DingTalk ID mismatches), run `node ok_single_task.js --task <ID>` to finish them individually.

---

## 📍 The Genesis Alignment Engine
The suite now features the **Genesis Global Anchor** algorithm. Unlike simple sentence matching, it:
*   **Token Sliding**: Treats the entire 10-hour script as a single continuous timeline.
*   **Cross-Sentence Logic**: Never misses words like "Kesannya" just because they cut across audio boundaries.
*   **Genesis Anchoring**: Naturally finds your starting point anywhere in a million-word document, so you can start your sweep from any row in the table.


---

## ⚠️ The Golden Rules
*   **Browser Zoom**: MUST be set to **100%** (`Ctrl + 0`).
*   **Window Size**: Always keep the Chrome window **Maximized**.
*   **Multitasking**: You **CAN** use other tabs and apps! The bot uses isolated input events. Just do not click or type inside the specific DingTalk tab the bot is using.

---

## ⚙️ Advanced Configuration

### 1. Switching Projects
To change the target project, open `ok.js` and update the `PROJECT_ID` at the top:
```javascript
PROJECT_ID: '37727', // Change this to your new Project ID
```

### 2. Multi-Dataset Support (The Dataset Guide)
The bot intelligently selects your text data:
*   If `scripts_37727.txt` exists, it will use that specific dataset. This is for daily script, for each project id that recorded, so manually create a new script with the naming format accordingly.
*   Otherwise, it falls back to the default `scripts.txt`.
*   **Format Tip**: Your `scripts.txt` should be a plain list of sentences. One essay in a chunk, with line break without space in between paragraphs, space between essays, clean my available script inside first.
*   *   **Recommendation**: Create separate files for different projects to avoid confusion.
 
### 3. Tabs & Multitasking (New & Improved!)
**Can I use other tabs while the bot runs?**
*   **Yes!** The bot now uses **isolated input events**. This means it sends keystrokes directly to the DingTalk text box without affecting your global keyboard.
*   **Multitasking**: You can now safely type emails, chat on Discord, or work in other tabs while the bot is running. The bot's typing will not be interrupted by your typing.
*   **The only rule**: Do not manually click or type *inside* the specific DingTalk tab that the bot is using, or you might confuse its current task.

### 4. Changing the CDP Port
If port **9222** is in use, change it in **both** files:
*   **`chrome_launcher.js`**: Line 18 (`--remote-debugging-port=9222`).
*   **`ok.js`**: Line 50 (`CDP_URL: 'http://127.0.0.1:9222'`).

---
## 🛠 Advanced: Changing the Port
If the bot says "Connection Failed," it usually means Port **9222** is currently in use by another app. To change it:

### 1. Update the Launcher
Open **`chrome_launcher.js`** and look at **Line 18**:
```javascript
'--remote-debugging-port=9222', // Change 9222 to 9223
```

### 2. Update the Bot
Open **`ok.js`** and look at **Line 20**:
```javascript
CDP_URL: 'http://127.0.0.1:9222', // Change 9222 to 9223
```
*Note: The numbers in both files must match!*

---
## ⚙️ Portability & Technical Details

### Different Screen Resolutions
DingTalk is responsive. If you are on a smaller laptop or have a high zoom level, the bot might miss table columns.
*   **Rule 1**: Always maximize the Chrome window.
*   **Rule 2**: Set Chrome zoom to **100%** (`Ctrl + 0`).

### Handling Port Conflicts (Error: Connection Failed)
By default, the bot communicates over Port **9222**. If this port is being used by another app:
1.  Open `chrome_launcher.js` and change `9222` to `9223`.
2.  Open `ok.js` and change `9222` to `9223` in the `CONFIG` section at the top.

### Session Logs
Every run creates a timestamped log file in the folder (e.g., `session_2024-04-14.log`). This file contains the full history of what the bot read and what it submitted.

---

## 🛠 Troubleshooting
*   **Bot finds task but doesn't click**: Check if your browser zoom is exactly 100%. If column indices have shifted, run `node dump_table.js` to debug.
*   **"Update" Skip**: If you see the bot opening a task and immediately closing it with an `Escape` keypress, that's normal—it's a safety feature skipping a task that was already completed.

---

## 🧰 Utility Toolkit (Diagnostics)
Besides the main bot, this folder includes several diagnostic scripts used during development. These are useful if DingTalk updates their website and you need to "fix" the bot's eyes.

*   `preflight.js`: The "Scout" for rapid mass-extraction of ASR text.
*   `mapper.js`: The "Aligner" using the Genesis Global Anchor engine.
*   `ok_compare.js`: The "Auditor" for high-confidence final sweeps.
*   `ok_single_task.js`: The "Surgical" fallback for individual IDs.
*   `jump_first.js`: A specialized script that ONLY finds the first "0" and stops.
*   `dump_table.js`: Use this if the bot is clicking the wrong columns.
*   `logs/`: Contains `_human.log` (readable) and `_machine.jsonl` (for AI analysis).

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

## 🤝 For Collaborators (Sharing)
This is a **Private** repository. To share:
1.  **Invite**: Add your friend as a collaborator in **Settings > Collaborators**.
2.  **Download**: They can then visit the repo and select **"Download ZIP"** from the green Code button.
3.  **AI Support**: They can drag their `/logs` into an AI (like Antigravity / ChatGPT) for instant troubleshooting.
