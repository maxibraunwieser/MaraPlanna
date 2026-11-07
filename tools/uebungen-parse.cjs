// Liest docs/uebungen/liste.txt (Quelle: die Liste des Nutzers) und schreibt docs/uebungen/bibliothek-roh.json:
// je Übung Name, Muskelgruppen und Geräte als { need: Pflicht, any: wahlweise (eines davon), bodyweight: auch ohne Gerät }.
// Regel: BK, BR, TA, Tisch, Pfosten, KS sind Pflicht, wenn sie dastehen; die Lasten sind Alternativen.
// KG zusammen mit genau einer Last heißt: die Last ist Pflicht (der Körper ist ohnehin dabei).
const fs = require('fs');
const path = require('path');
const GROUPS = {
  'Brust': 'chest', 'Rücken (Breite, Mitte, oberer Rücken)': 'back', 'Trapez und Nacken': 'traps', 'Schultern': 'shoulders', 'Bizeps': 'biceps',
  'Trizeps': 'triceps', 'Unterarme': 'forearms', 'Quadrizeps': 'quads', 'Hamstrings': 'hamstrings', 'Gesäß und Hüfte': 'glutes', 'Waden': 'calves',
  'Bauch und Rumpf': 'core', 'Hüftbeuger': 'hipflexors', 'Calisthenics mit Fokus Oberkörper und Rumpf': 'calisthenics', 'Ganzkörperübungen': 'fullbody',
  'Flexband-Ganzkörper': 'bandfull',
};
const FIXTURE = new Set(['BK', 'BR', 'TA', 'Tisch', 'Pfosten', 'KS']);
// Ausnahmen von der Regel, wo die Klammer anders gemeint ist (Name -> { need, any, bodyweight })
const OVERRIDE = {
  'Hyperextension': { need: [], any: ['MA', 'BK'] },
  'T-Bar-Rudern': { need: ['LH'], any: [] },
  'L-Sit': { need: [], any: ['BR'], bodyweight: true },
  'Inverted Rows': { need: [], any: ['Tisch', 'KS'] },
  'Klimmzüge einarmig oder mit Hilfe': { need: ['KS'], any: [] },
  'Glute-Ham-Raise': { need: [], any: ['MA'], bodyweight: true },
  'Einbeiniges Kreuzheben': { need: [], any: ['KH'], bodyweight: true },
  'Slider-Curls': { need: [], any: ['GR'], bodyweight: true },
  'Plyometrie: Box Jumps': { need: ['BK'], any: [] },
  'Battle Ropes': { need: ['SB'], any: [], note: 'braucht Seile (nicht in der Legende)' },
};
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/’/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const gearOf = (name, codes) => {
  if (OVERRIDE[name]) return { bodyweight: false, ...OVERRIDE[name] };
  const bw = codes.includes('KG');
  const rest = codes.filter((c) => c !== 'KG');
  const need = rest.filter((c) => FIXTURE.has(c));
  const loads = rest.filter((c) => !FIXTURE.has(c));
  if (bw && loads.length === 1) return { need: [...need, ...loads], any: [], bodyweight: false };
  if (loads.length === 1 && need.length) return { need: [...need, ...loads], any: [], bodyweight: false };
  return { need, any: loads.length > 1 || bw ? loads : [], bodyweight: bw, ...(loads.length === 1 && !bw ? { need: [...need, ...loads], any: [] } : {}) };
};
const out = [];
const seen = new Map();
let g = null;
for (const line of fs.readFileSync(path.join(__dirname, '..', 'docs', 'uebungen', 'liste.txt'), 'utf8').split('\n').filter(Boolean)) {
  const m = line.match(/^(.*) \[(.*)\]$/);
  if (!m) { g = GROUPS[line]; if (!g) throw new Error('Gruppe unbekannt: ' + line); continue; }
  const name = m[1];
  if (seen.has(name)) { seen.get(name).groups.push(g); continue; }
  const codes = m[2].split(',').map((s) => s.trim());
  const e = { key: slug(name), name, groups: [g], codes, gear: gearOf(name, codes) };
  seen.set(name, e);
  out.push(e);
}
const keys = new Set();
for (const e of out) { if (keys.has(e.key)) throw new Error('doppelter Schlüssel ' + e.key); keys.add(e.key); }
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'uebungen', 'bibliothek-roh.json'), JSON.stringify(out, null, 1));
console.log(out.length, 'Übungen,', out.filter((e) => e.groups.length > 1).length, 'in zwei Gruppen');
const cnt = (f) => out.filter(f).length;
console.log('ohne jedes Gerät (Körpergewicht):', cnt((e) => !e.gear.need.length && !e.gear.any.length));
console.log('mit Pflicht-Gerät:', cnt((e) => e.gear.need.length), ' mit wahlweise-Gerät:', cnt((e) => e.gear.any.length));

// Auch als Code für die App: supabase/functions/_shared/exerciseListData.ts (nicht von Hand ändern, siehe docs/uebungen/liste.txt)
const GEAR_OF = { LH: 'barbell', KH: 'dumbbell', BK: 'bench', KS: 'pullup', KT: 'cable', MA: 'machines', KB: 'kettlebell', BD: 'bands', EZ: 'ez', SM: 'smith', BR: 'parallel', MB: 'medball', GR: 'plate', SB: 'sandbag', SCH: 'sled', AB: 'abwheel', TA: 'anchor', Tisch: 'table', Pfosten: 'post' };
const g2 = (codes) => codes.map((c) => GEAR_OF[c]);
const rows = out.map((e) => `  { name: ${JSON.stringify(e.name)}, groups: ${JSON.stringify(e.groups)}, need: ${JSON.stringify(g2(e.gear.need))}, any: ${JSON.stringify(g2(e.gear.any))}, body: ${e.gear.bodyweight}${e.gear.note ? ', note: ' + JSON.stringify(e.gear.note) : ''} },`).join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'exerciseListData.ts'), `// Erzeugt von tools/uebungen-parse.cjs aus docs/uebungen/liste.txt (nicht von Hand ändern).
// Die Übungsliste des Nutzers: Name (deutsch), Muskelgruppen und Geräte (need = Pflicht, any = eines davon, body = auch ohne Gerät).

export type ListGear = 'barbell' | 'dumbbell' | 'bench' | 'pullup' | 'cable' | 'machines' | 'kettlebell' | 'bands' | 'ez' | 'smith' | 'parallel' | 'medball' | 'plate' | 'sandbag' | 'sled' | 'abwheel' | 'anchor' | 'table' | 'post';
export type ListGroup = ${Object.values(GROUPS).map((g) => `'${g}'`).join(' | ')};
export interface ListEntry { name: string; groups: ListGroup[]; need: ListGear[]; any: ListGear[]; body: boolean; note?: string }

export const EXERCISE_LIST: ListEntry[] = [
${rows}
];
`);
console.log('exerciseListData.ts geschrieben');
