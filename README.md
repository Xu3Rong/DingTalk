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

## 🏎️ Usage Workflow (The 2-Terminal Process)
To bypass bot detection, the system runs in two separate processes.

### Step A: Launch the Stealth Browser
In your **first terminal**, run:
```bash
node chrome_launcher.js
```
*   **Action**: A Chrome window will open.
*   **Requirement**: Log into your Google/DingTalk account manually.
*   **Crucial**: Navigate to your project tasks page and **keep this terminal open**.
*   **Privacy**: Your login session is saved in the local `chrome_user_data/` folder, not on the cloud.

### Step B: Start the Bot
Once logged in, open a **second terminal** and run:
```bash
node ok.js
```
*   **Action**: The bot will connect to Chrome and begin hunting for unprocessed ("0") tasks.
*   **Verification**: The bot cross-references Task IDs with the URL and UI to ensure zero data-entry errors.
*   **Completion**: After reaching the end, the bot performs a final "Safety Sweep" from the top, plays a beep, and prints a session summary.

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

*   `jump_first.js`: A specialized script that ONLY finds the first "0" and stops. Great for testing if the bot can see the table.
*   `test_textbox.js`: Tests if the bot can correctly clear and type into the transcription box.
*   `test_duration.js`: Tests the audio metadata polling (waiting for the waveform to load).
*   `test_submit.js`: Tests the "Submit/Save" buttons.
*   `inspector.js` & `inspect_wrapper.js`: Diagnostic tools to print out the technical details of the DingTalk UI.
*   `fixer.js`: A script used to patch specific text issues in the dataset.
*   `dump_table.js`: The most important diagnostic—run this if the bot is clicking the wrong columns.
*   `logs/`: Contains `_human.log` (readable) and `_machine.jsonl` (for AI analysis).

---

## 📦 Project Structure
*   `ok.js`: The main automation engine.
*   `chrome_launcher.js`: Opens Chrome in stealth mode for manual login.
*   `scripts.txt`: Your source text dataset.
*   `logs/`: Where your session history (Human and Machine formats) is saved.

## 🤝 For Collaborators (Sharing)
This is a **Private** repository. To share:
1.  **Invite**: Add your friend as a collaborator in **Settings > Collaborators**.
2.  **Download**: They can then visit the repo and select **"Download ZIP"** from the green Code button.
3.  **AI Support**: They can drag their `/logs` into an AI (like Antigravity / ChatGPT) for instant troubleshooting.
