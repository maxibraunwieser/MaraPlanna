// Writes every installed watch that can run this device app into manifest.xml:
// device-app support, Connect IQ ≥ 3.2 (minApiLevel in the manifest) and a round
// or rectangular screen (Instinct-style screens with a sub-window are left out).
//
//   node tools/products.cjs            (run in garmin-runapp/)
//   node tools/products.cjs --dry-run  (just list them)

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = process.env.CIQ_DEVICES ?? path.join(process.env.APPDATA ?? path.join(os.homedir(), '.Garmin'), 'Garmin', 'ConnectIQ', 'Devices');
const manifest = path.join(__dirname, '..', 'manifest.xml');
if (!fs.existsSync(root)) throw new Error(`No device files at ${root} – download them with the Connect IQ SDK Manager first.`);

const version = (v) => String(v ?? '0').split('.').map(Number).reduce((s, n, i) => s + (n || 0) * 1000 ** (2 - i), 0);
const MIN = version('3.2.0');
const picked = [];
const skipped = [];
for (const id of fs.readdirSync(root).sort()) {
  const file = path.join(root, id, 'compiler.json');
  if (!fs.existsSync(file)) continue;
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const deviceApp = (c.appTypes ?? []).some((t) => String(t.type).toLowerCase() === 'watchapp');
  const ciq = Math.max(0, ...(c.partNumbers ?? []).map((p) => version(p.connectIQVersion)));
  const shape = String(c.deviceFamily ?? '').split('-')[0];
  const watch = String(c.webDocDeviceGroup ?? '').toLowerCase().includes('watch');
  const why = !watch ? 'not a watch' : !deviceApp ? 'no device apps' : ciq < MIN ? `Connect IQ ${c.partNumbers?.[0]?.connectIQVersion}` : !['round', 'rectangle'].includes(shape) ? `${shape} screen` : null;
  if (why) skipped.push(`${id} (${why})`);
  else picked.push({ id, name: c.displayName, display: c.displayType, family: c.deviceFamily });
}

console.log(`${picked.length} watches:`);
for (const p of picked) console.log(`  ${p.id.padEnd(24)} ${p.family.padEnd(18)} ${String(p.display).padEnd(7)} ${p.name}`);
console.log(`\nLeft out (${skipped.length}): ${skipped.join(', ') || '–'}`);
if (process.argv.includes('--dry-run')) process.exit(0);

const xml = fs.readFileSync(manifest, 'utf8');
const products = picked.map((p) => `            <iq:product id="${p.id}"/>`).join('\n');
fs.writeFileSync(manifest, xml.replace(/<iq:products>[\s\S]*?<\/iq:products>/, `<iq:products>\n${products}\n        </iq:products>`));
console.log('\nmanifest.xml updated.');
