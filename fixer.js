const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => 
    f.endsWith('.js') && 
    f !== 'fixer.js' && 
    !f.includes('node_modules')
);

let count = 0;
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('position: { x: 115, y: 173 }')) {
    // 1. Fix single-line objects like: { position: { x: 115, y: 173 } }
    content = content.replace(/\{\s*position:\s*\{\s*x:\s*115,\s*y:\s*173\s*\}\s*\}/g, '');
    
    // 2. Fix multi-line objects where it's a property
    content = content.replace(/position:\s*\{\s*x:\s*115,\s*y:\s*173\s*\},\n?\s*/g, '');
    
    // 3. Fix comma-separated single lines: , { position: { x: 115, y: 173 } }
    content = content.replace(/,\s*\{\s*position:\s*\{\s*x:\s*115,\s*y:\s*173\s*\}\s*\}/g, '');
    
    // Fix any leftover empty click objects: click('#waveform-layer-main', ) -> click('#waveform-layer-main')
    content = content.replace(/click\('(#waveform-layer-main)',\s*\)/g, "click('$1')");
    
    fs.writeFileSync(filePath, content);
    console.log(`✅ Stripped hardcoded coordinates from: ${file}`);
    count++;
  }
}

console.log(`\n🎉 Success! I removed the coordinates from ${count} scripts. Option 3 is now officially implemented everywhere.`);
