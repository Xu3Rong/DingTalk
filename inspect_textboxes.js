const { chromium } = require('playwright');

(async () => {
  console.log("🔍 Connecting to inspect all Text Boxes...");
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects')) || context.pages()[0];
    
    if (!page.url().includes('task=')) {
      console.log("⚠️ PLEASE OPEN A TASK FIRST!");
      process.exit(0);
    }

    console.log("⏳ Scanning for every single text box on the page...\n");
    
    const boxes = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]'));
        
        return elements.map((el, i) => {
            let info = `Textbox #${i + 1}:\n`;
            info += `  - Type: <${el.tagName.toLowerCase()}>\n`;
            info += `  - Class: "${typeof el.className === 'string' ? el.className.substring(0, 30) : ''}"\n`;
            
            // Try to find what label text is sitting right above or next to this box
            let parentText = "None";
            if (el.closest('.lsf-text-area, .ant-form-item, div[class*="label"]')) {
                parentText = el.closest('.lsf-text-area, .ant-form-item, div[class*="label"]').innerText.split('\n')[0];
            } else if (el.parentElement) {
                parentText = el.parentElement.innerText.split('\n')[0];
            }
            
            info += `  - Label/Context Text: "${parentText.substring(0, 50)}"\n`;
            return info;
        });
    });
    
    console.log(boxes.length > 0 ? boxes.join("\n") : "No text boxes found!");
    
    console.log("✅ Done! Paste this output.");
    process.exit(0);

  } catch(e) {
    console.log("\n❌ Error:", e.message);
  }
})();
