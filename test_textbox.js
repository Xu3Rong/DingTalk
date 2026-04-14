const { chromium } = require('playwright');

(async () => {
  console.log("🔍 Connecting to your browser to test the Text Box...");
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects')) || context.pages()[0];
    
    if (!page.url().includes('task=')) {
      console.log("⚠️ PLEASE OPEN A TASK FIRST! The script needs the wrapper active.");
      process.exit(0);
    }

    console.log("⏳ Hunting for the transcription text box...");
    
    // This is the hardened selector your master script uses
    const TEXTAREA_SEL = 'textarea[name="Annotation Result"]';
    const textBox = page.locator(TEXTAREA_SEL).first();
    
    // Wait up to 5 seconds for it to appear
    await textBox.waitFor({ state: 'visible', timeout: 5000 });
    
    console.log("✅ Text box found!");

    // 1. Try to read what is currently inside it
    let snippet = await textBox.inputValue().catch(() => null);
    if (!snippet) {
        snippet = await textBox.textContent().catch(() => "");
    }
    
    console.log(`\n📄 Current snippet inside box: [${snippet.substring(0, 50)}...]`);

    // 2. Try to type into it (using the React/Vue workaround)
    console.log("\n🖱️ Injecting test text and triggering React state...");
    await textBox.click();
    await textBox.focus();
    
    // Select all and clear
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    
    // Inject the text
    await textBox.fill("=== BROWSER AUTOMATION TEST WORKED ===");
    
    // The Space-Backspace ping to force DingTalk to save the text
    await page.keyboard.press('Space');
    await page.keyboard.press('Backspace');

    console.log("✅ Test complete! Look at your browser—is the text correctly inside the box?");
    process.exit(0);

  } catch(e) {
    console.log("\n❌ Error:", e.message);
  }
})();
