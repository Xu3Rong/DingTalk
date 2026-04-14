# DingTalk Task Automation Bot

A hardened, human-like automation tool for processing tasks on the DingTalk Scale platform. Features aggressive zero-finding, smooth scrolling, and session-based logging.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   **Node.js** (Version 16 or higher): [Download here](https://nodejs.org/)
*   **Google Chrome**: [Download here](https://www.google.com/chrome/)

### 2. Installation
1.  Open your terminal or command prompt.
2.  Navigate to the `C:\DingTalk` folder.
3.  Install the required dependencies:
    ```bash
    npm install
    ```

### 3. Usage Workflow (The 2-Terminal Process)
To bypass bot detection, we run the browser and the script in two separate steps.

#### **Step A: Launch the Stealth Browser**
In your first terminal, run:
```bash
node chrome_launcher.js
```
*   **Action**: A Chrome window will open.
*   **Requirement**: Log into your DingTalk account manually in this window. Navigate to your project's data page.
*   **Crucial**: Keep this terminal open while you work.

#### **Step B: Start the Bot**
Once you are logged in and on the project page, open a second terminal and run:
```bash
node ok.js
```
*   **Action**: The bot will connect to the open Chrome window and start hunting for unprocessed ("0") tasks.

---

## ⚙️ Configuration Guide

### 1. Switching Projects
To move the bot to a new project (e.g., from project `37727` to `44556`):
1.  Open `ok.js`.
2.  In the `CONFIG` section at the top, change the `PROJECT_ID`:
    ```javascript
    PROJECT_ID: '44556', // Change this to your new Project ID
    ```
3.  The bot will automatically update its target URL to the new project.

### 2. Multi-Dataset Support (Script Files)
The bot is smart about which text data it uses. When it starts, it checks your current project ID:
*   **Specific Dataset**: If a file named `scripts_37727.txt` exists, the bot will use **only** that file for that specific project.
*   **General Dataset**: If the specific file doesn't exist, it falls back to the default `scripts.txt`.
*   **Recommendation**: Create separate files for different projects to avoid confusion.

### 3. Tabs & Multitasking (New & Improved!)
**Can I use other tabs while the bot runs?**
*   **Yes!** The bot now uses **isolated input events**. This means it sends keystrokes directly to the DingTalk text box without affecting your global keyboard.
*   **Multitasking**: You can now safely type emails, chat on Discord, or work in other tabs while the bot is running. The bot's typing will not be interrupted by your typing.
*   **The only rule**: Do not manually click or type *inside* the specific DingTalk tab that the bot is using, or you might confuse its current task.

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

---

## 📦 Project Structure
*   `ok.js`: The main automation engine.
*   `chrome_launcher.js`: Opens Chrome in stealth mode for manual login.
*   `scripts.txt`: Your source text dataset.
*   `logs/`: Where your session history (Human and Machine formats) is saved.
