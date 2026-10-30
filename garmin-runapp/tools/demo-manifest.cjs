// manifest.xml with another app id, so demo builds never touch the real app's storage.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
const xml = fs.readFileSync(path.join(dir, 'manifest.xml'), 'utf8').replace(/id="[0-9a-f]{32}"/, 'id="0000000000000000000000000000de71"');
fs.writeFileSync(path.join(dir, 'bin', 'demo-manifest.xml'), xml);
