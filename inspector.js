const { chromium } = require('playwright');

(async () => {
  console.log("🔍 Connecting to your open browser...");
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('scale.dingtalk.com/projects')) || context.pages()[0];
    
    console.log(`✅ Connected to tab: ${page.url()}`);
    
    if (!page.url().includes('task=')) {
      console.log("⚠️ PLEASE OPEN A TASK FIRST!");
      process.exit(0);
    }

    const waveform = page.locator('#waveform-layer-main');
    await waveform.waitFor({ state: 'visible', timeout: 5000 });
    
    const boundingBox = await waveform.boundingBox();
    console.log(`✅ Found waveform at X:${boundingBox.x}, Y:${boundingBox.y}`);

    console.log("\n--- 🎯 X-RAY AT X:115, Y:173 ---");
    // We are going to use Javascript's elementFromPoint to find EXACTLY what is sitting there!
    const targetInfo = await page.evaluate((box) => {
        const absX = box.x + 115;
        const absY = box.y + 173;
        
        let el = document.elementFromPoint(absX, absY);
        
        if (!el) return "Nothing found at that coordinate!";
        
        let path = [];
        let curr = el;
        // Walk up the family tree to see exactly what this element belongs to
        for(let i=0; i<6 && curr && curr.tagName; i++) {
            let ident = curr.tagName.toLowerCase();
            if (curr.id) ident += '#' + curr.id;
            
            // Safely get classname (SVGs behave differently)
            let cls = (typeof curr.className === 'string') ? curr.className : (typeof curr.className.baseVal === 'string' ? curr.className.baseVal : '');
            if (cls) ident += '.' + cls.trim().replace(/\s+/g, '.');
            
            if (curr.getAttribute('data-testid')) ident += `[data-testid="${curr.getAttribute('data-testid')}"]`;
            if (curr.getAttribute('aria-label')) ident += `[aria-label="${curr.getAttribute('aria-label')}"]`;
            
            path.unshift(ident);
            curr = curr.parentElement;
        }
        
        return "Family Tree under your exact cursor:\n" + path.join('\n ↳ ');
    }, boundingBox);
    
    console.log(targetInfo);

    // Let's also look broadly for any audio segments/regions anywhere
    const segments = await page.evaluate(() => {
       const segs = document.querySelectorAll('[class*="segment"], [class*="region" i], [class*="play"], [data-testid*="region" i]');
       return Array.from(segs).filter(e => e.tagName !== 'svg' && e.tagName !== 'g').slice(0, 5).map(el => {
           let cls = (typeof el.className === 'string') ? el.className : (typeof el.className.baseVal === 'string' ? el.className.baseVal : '');
           return `<${el.tagName.toLowerCase()} class="${cls.trim()}"> (ID: ${el.id || 'none'})`;
       });
    });
    
    console.log("\n--- 🔍 POTENTIAL AUDIO REGIONS FOUND ---");
    console.log(segments.length ? segments.join("\n") : "No obvious region classes found.");

    console.log("\n✅ Diagnostics finished.");
    process.exit(0);

  } catch(e) {
    console.log("\n❌ Error:", e.message);
  }
})();
