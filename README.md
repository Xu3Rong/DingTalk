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
*   If `scripts_37727.txt` exists, it will use that specific dataset.
*   Otherwise, it falls back to the default `scripts.txt`.
*   **Format Tip**: Your `scripts.txt` should be a plain list of sentences. The bot will automatically "chunk" them to find the best match for each task. No special formatting is needed!

### 3. Changing the CDP Port
If port **9222** is in use, change it in **both** files:
*   **`chrome_launcher.js`**: Line 18 (`--remote-debugging-port=9222`).
*   **`ok.js`**: Line 50 (`CDP_URL: 'http://127.0.0.1:9222'`).

---

## 🧰 Utility Toolkit (Diagnostics)
If DingTalk updates their website, use these tools to "re-calibrate" the bot:
*   `ok.js`: The main automation engine.
*   `inspector.js`: Use this "X-ray" tool to find the exact coordinates and IDs of UI elements like the waveform or text boxes.
*   `dump_table.js`: Run this to see exactly how the bot maps the task rows and columns.
*   `jump_first.js`: A diagnostic tool that only finds the first "0" task and stops.
*   `logs/`: Contains `_human.log` (readable) and `_machine.jsonl` (for AI analysis).

---

## 🤝 For Collaborators (Sharing)
This is a **Private** repository. To share:
1.  **Invite**: Add your friend as a collaborator in **Settings > Collaborators**.
2.  **Download**: They can then visit the repo and select **"Download ZIP"** from the green Code button.
3.  **AI Support**: They can drag their `/logs` into an AI (like Antigravity / ChatGPT) for instant troubleshooting.
