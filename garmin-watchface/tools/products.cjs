// Writes every installed watch that can run this watch face into manifest.xml:
// watch-face support, Connect IQ ≥ 3.2 (background web requests) and a round
// or rectangular screen (the Instinct-style screens with a sub-window are left out).
//
//   node tools/products.cjs            (run in garmin-watchface/)
//   node tools/products.cjs --dry-run  (just list them)

const fs = require('fs');
const path = require('path');

const root = process.env.CIQ_DEVICES ?? path.join(process.env.APPDATA ?? path.join(require('os').homedir(), '.Garmin'), 'Garmin', 'ConnectIQ', 'Devices');
const manifest = path.join(__dirname, '..', 'manifest.xml');
if (!fs.existsSync(root)) throw new Error(`No device files at ${root} – download them with the Connect IQ SDK Manager first.`);

const version = (v) => String(v ?? '0').split('.').map(Number).reduce((s, n, i) => s + n * 1000 ** (2 - i), 0);
const min = version('3.2.0');
const picked = [];
const skipped = [];
for (const id of fs.readdirSync(root).sort()) {
  const file = path.join(root, id, 'compiler.json');
  if (!fs.existsSync(file)) continue;
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const watchFace = (c.appTypes ?? []).some((t) => String(t.type ?? t).toLowerCase() === 'watchface');
  const ciq = Math.max(...(c.partNumbers ?? [{ connectIQVersion: c.connectIQVersion }]).map((p) => version(p.connectIQVersion)));
  const shape = String(c.deviceFamily ?? '').toLowerCase().includes('semioctagon') || String(c.screenShape ?? '').toLowerCase().includes('octagon') ? 'semi-octagon' : String(c.screenShape ?? 'round').toLowerCase();
  const isWatch = String(c.deviceGroup ?? c.type ?? 'watch').toLowerCase().includes('watch') || !String(c.deviceGroup ?? '').length;
  if (watchFace && ciq >= min && isWatch && shape !== 'semi-octagon') picked.push(id);
  else skipped.push(`${id} (${!watchFace ? 'no watch faces' : ciq < min ? 'Connect IQ < 3.2' : shape === 'semi-octagon' ? 'sub-window screen' : 'not a watch'})`);
}

console.log(`${picked.length} watches:\n  ${picked.join(', ')}`);
console.log(`\nLeft out (${skipped.length}):\n  ${skipped.join(', ')}`);
if (process.argv.includes('--dry-run')) process.exit(0);

const xml = fs.readFileSync(manifest, 'utf8');
const products = picked.map((id) => `            <iq:product id="${id}"/>`).join('\n');
fs.writeFileSync(manifest, xml.replace(/<iq:products>[\s\S]*?<\/iq:products>/, `<iq:products>\n${products}\n        </iq:products>`));
console.log(`\nmanifest.xml updated.`);
