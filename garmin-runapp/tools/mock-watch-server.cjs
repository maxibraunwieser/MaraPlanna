// Test-Server für den Hintergrund-Abgleich im Simulator (nur Demo-Build, Bg.base() zeigt auf http://localhost:8787/watch).
// Antwortet wie die Funktion "watch" von MaraPlanna, ohne Datenbank und ohne Konto:
//   GET /watch/run       ein Lauf-Feed mit einer anderen Einheit als die Demo ("Hintergrund 5x600"), damit man im Menü
//                        Training → Heute sieht, dass der Hintergrund geladen hat
//   GET /watch/strength  der Kraft-Feed der Demo, erzeugt vom echten Server-Code (bin/strength.cjs, tools/dump-strength.sh)
// Jede Anfrage steht in der Konsole.
//   node tools/mock-watch-server.cjs
const http = require('http');
const path = require('path');
const fs = require('fs');

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const runFeed = () => ({
  v: 1,
  paired: true,
  vdot: 46.3,
  units: 'km',
  goal: { m: 42195, s: 13500 },
  paces: { easy: [326, 360], long: [330, 360], recovery: [360, 381], marathon: 297, threshold: 272, interval: 250, repetition: 235 },
  workout: {
    title: 'Hintergrund 5x600',
    z: 6,
    steps: [
      { n: 'Einlaufen', t: 'w', d: 2000, lo: 326, hi: 360, z: 1 },
      ...[1, 2, 3, 4, 5].flatMap((i) => [
        { n: `Interval ${i}/5`, t: 'a', d: 600, lo: 245, hi: 255, z: 6 },
        ...(i < 5 ? [{ n: 'Trabpause', t: 'r', s: 90, z: 3 }] : []),
      ]),
      { n: 'Auslaufen', t: 'c', d: 1500, lo: 326, hi: 360, z: 1 },
    ],
  },
  week: null,
  days: [],
  race: null,
  strength: { ready: true, w: 'l', u: 'kg', auto: true, share: false },
});

// Kraft-Feed von heute, gebaut wie auf dem Server (gleiche Größengrenze für die Figuren) aus den Beispieldaten der Demo.
// Braucht bin/strength.cjs: bash tools/dump-strength.sh
function strengthFeed() {
  if (!fs.existsSync(path.join(__dirname, '..', 'bin', 'strength.cjs'))) return { ready: true, d: today(), sess: [], wo: [] };
  const { buildStrengthFeed, capFigures } = require('../bin/strength.cjs');
  const { prefs, workouts, sigs } = require('./gen-demo-strength.cjs');
  const date = today();
  const feed = capFigures(buildStrengthFeed({ prefs, workouts: workouts.map((w) => ({ ...w, date })), lastKg: {}, sigs, date }));
  // MOCK_BIG=1: so viel, wie der Server höchstens schickt (6 Workouts der Website), um den Speicher des Hintergrunds zu prüfen
  if (process.env.MOCK_BIG && feed.wo?.length) {
    while (feed.wo.length < 6) feed.wo.push({ ...feed.wo[feed.wo.length % 3], id: `copy-${feed.wo.length}`, t: `Workout ${feed.wo.length + 1}` });
  }
  return feed;
}

// Nur http: Der Simulator verlangt wie die Uhr HTTPS mit gültigem Zertifikat; für diesen Test im Simulator unter
// Settings "Use Device HTTPS Requirements" ausschalten (die echte Uhr spricht nur mit dem echten Server über HTTPS).
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = null;
    if (url.pathname === '/watch/run') body = runFeed();
    if (url.pathname === '/watch/strength') body = strengthFeed();
    const json = body ? JSON.stringify(body) : '{"error":"not found"}';
    console.log(`${new Date().toLocaleTimeString()}  ${req.method} ${url.pathname}${url.search}  secret=${req.headers['x-watch-secret'] ?? '-'}  -> ${body ? 200 : 404}, ${json.length} Bytes`);
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(json);
  })
  .listen(8787, () => console.log('Test-Server für den Hintergrund-Abgleich: http://localhost:8787/watch'));
