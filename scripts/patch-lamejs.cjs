const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', 'lamejs', 'src', 'js', 'Lame.js');
let code = fs.readFileSync(file, 'utf8');

if (!code.includes("require('./MPEGMode.js')")) {
  code = "var MPEGMode = require('./MPEGMode.js');\n" + code;
  fs.writeFileSync(file, code);
  console.log('Patched lamejs: added MPEGMode import to Lame.js');
} else {
  console.log('lamejs already patched');
}
