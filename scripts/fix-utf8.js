const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'games.html');
let content = fs.readFileSync(file, 'utf8');

// Fix corrupted UTF-8 em-dashes and middle dots
content = content.replace(/\u00e2\u0080\u0093/g, '&ndash;');
content = content.replace(/\u00e2\u0080\u0094/g, '&mdash;');
content = content.replace(/\u00c2\u00b7/g, '&middot;');

// Also fix the common mojibake patterns
content = content.replace(/â€"/g, '&mdash;');
content = content.replace(/â€"/g, '&ndash;');
content = content.replace(/Â·/g, '&middot;');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed games.html UTF-8 issues');
