// Writes source/DemoStrength.mc: the strength part of the demo exactly as the server sends it (GET /watch/strength), made by the
// real feed code (supabase/functions/_shared/strength.ts) from sample prefs and three sample sessions of today:
//   Oberkörper   three exercises whose movement matches the demo's three sample sets (Demo.pattern), so the recognition shows
//   Unterkörper  a set of leg exercises with different equipment (their figures)
//   Core         core exercises, one of them a hold
//   bash tools/dump-strength.sh && node tools/gen-demo-strength.cjs
const fs = require('fs');
const path = require('path');
const { buildStrengthFeed, normalizePrefs, capFigures, libraryRows } = require('../bin/strength.cjs');

const prefs = normalizePrefs({
  wrist: 'left', styles: ['free'], exercises: ['squat', 'bench_press', 'row', 'bicep_curl'], weightUnit: 'kg', savedAt: '2026-11-07T08:00:00Z',
  autoConfirm: true, animation: true,
});

const ex = (name, sets, reps, extra = {}) => ({ type: 'exercise', name, sets, reps, ...extra });
const session = (id, kind, title, steps) => ({ id, date: '2026-11-07', kind, title, steps, distance_km: null, duration_min: 40, key_session: false, status: 'planned', note: null });
const workouts = [
  session('00000000-0000-0000-0000-000000000001', 'strength_upper', 'Upper body', [ex('Bench press', 1, '8', { kg: 60 }), ex('Barbell row', 1, '8', { kg: 50 }), ex('Dumbbell curl', 1, '10', { kg: 14 })]),
  session('00000000-0000-0000-0000-000000000002', 'strength_lower', 'Lower body', [ex('Goblet squat', 3, '10', { kg: 20 }), ex('Dumbbell Romanian deadlift', 3, '10', { kg: 24 }), ex('Bulgarian split squat', 3, '8'), ex('Dumbbell hip thrust', 3, '12', { kg: 24 }), ex('Single-leg calf raise (holding DB)', 3, '12')]),
  session('00000000-0000-0000-0000-000000000003', 'core', 'Core stability', [ex('Dead bug', 3, '10 / side'), ex('Plank', 2, '45 s'), ex('Side plank', 2, '30 s / side'), ex('Bird dog', 2, '10 / side')]),
];

// What the three sample sets of the demo feel like on the wrist (RepCounter.features, see testDemoPatternFeatures).
const spread = [2, 12, 3, 3, 3, 3];
const sigs = {
  bench_press: [5, 29, 173, 99, 100, 100, 200, ...spread],
  row: [5, 14, 134, 18, 100, 200, 100, ...spread],
  bicep_curl: [5, 19, 147, 19, 100, 151, 186, ...spread],
};

const feed = capFigures(buildStrengthFeed({ prefs, workouts, lastKg: {}, sigs, date: '2026-11-07' }), 60000);
// short pauses and a short hold, for the demonstration
for (const s of feed.sess) for (const e of s.ex) {
  e.rest = 20;
  if (e.h) e.h = Math.min(e.h, 15);
}
const { an, ...core } = feed;

// the lists of three muscle groups for "Kraft frei" (the real watch loads all sixteen, one request each)
const libPrefs = normalizePrefs({ ...prefs, equipment: 'mixed', gear: ['barbell', 'dumbbell', 'bench', 'rack', 'pullup', 'cable', 'machines', 'kettlebell', 'bands'] });
const libGroups = { chest: libraryRows(libPrefs, 'chest').slice(0, 12), quads: libraryRows(libPrefs, 'quads').slice(0, 12), core: libraryRows(libPrefs, 'core').slice(0, 12) };
delete core.d;
delete core.today;

const lit = (v) => {
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`;
  if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `"${k}" => ${lit(x)}`).join(', ')} }`;
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
};

const code = `// Erzeugt von tools/gen-demo-strength.cjs (nicht von Hand ändern): der Kraft-Teil der Demo wie vom Server (GET /watch/strength).
// Nur im Demo-Build vorhanden.

import Toybox.Application;
import Toybox.Lang;

(:demo)
module DemoStrength {
    function str() as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType> {
        return ${lit(core)} as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>;
    }

    function figs() as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType> {
        return ${lit(an)} as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>;
    }

    // Übungslisten für "Kraft frei": Gruppe -> { d, ex }
    function lib(group as String) as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>? {
${Object.entries(libGroups).map(([g, rows]) => `        if (group.equals("${g}")) {\n            return { "ex" => ${lit(rows)} } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>;\n        }`).join('\n')}
        return null;
    }
}
`;
fs.writeFileSync(path.join(__dirname, '..', 'source', 'DemoStrength.mc'), code);
console.log('source/DemoStrength.mc written:', feed.sess.map((s) => `${s.t} (${s.ex.length})`).join(', '), '·', Object.keys(an).length, 'figures,', JSON.stringify(an).length, 'bytes');
