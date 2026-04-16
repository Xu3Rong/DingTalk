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

## 🤝 For Collaborators
1.  **Invite**: Add your friend as a collaborator in **Settings > Collaborators**.
2.  **Download**: They can then visit the repo and select **"Download ZIP"** from the green Code button.
3.  **AI Support**: They can drag their `/logs` into an AI for instant troubleshooting.
