const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\123\\Desktop\\члок-схема\\1.txt', 'utf8').split('\n');

let inString = false;
let inComment = false;
let depth = 0;

for (let i = 0; i < 82; i++) {
  const line = lines[i];
  inString = false;
  inComment = false;
  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    if (inComment) continue;
    if (c === "'" && !inString) { inString = true; continue; }
    if (c === "'" && inString) { inString = false; continue; }
    if (c === '/' && line[j+1] === '/') { inComment = true; continue; }
    if (inString) continue;
    if (c === '(') depth++;
    if (c === ')') depth--;
  }
  if (depth !== 0) {
    console.log(`Line ${i+1}: depth=${depth} | ${line.trim()}`);
  }
}
console.log(`Final depth: ${depth}`);
