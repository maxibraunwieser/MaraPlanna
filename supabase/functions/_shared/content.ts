// Plan content is written in English by the planner (titles, step labels, notes, messages) and stored that way, because the code
// compares some of those texts and the database holds them. This module turns that English into German for display, so the whole
// app is in one language. English passes through unchanged. No imports of other app code: it runs in the Edge Functions (Deno),
// in the browser and in the tests (Node).
//
// Every text the planner can produce has a rule here; content.test.ts generates plans for every goal and checks that nothing
// English is left over.

import { LIBRARY } from './exerciseLibrary.ts';

export type ContentLang = 'en' | 'de';

const dot2comma = (s: string) => s.replace(/(\d)\.(\d)/g, '$1,$2');
const NUM = '(\\d+(?:\\.\\d+)?)';

type Rule = [RegExp, (m: RegExpExecArray) => string];
const rx = (src: string, to: (m: RegExpExecArray) => string): Rule => [new RegExp(`^${src}$`), to];

function apply(rules: Rule[], text: string): string | null {
  for (const [re, to] of rules) {
    const m = re.exec(text);
    if (m) return to(m);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Distances and units inside texts
// ---------------------------------------------------------------------------------------------------------------------------

const DISTANCE_DE: Record<string, string> = { Marathon: 'Marathon', 'Half marathon': 'Halbmarathon' };

/** "Half marathon" -> "Halbmarathon"; "10 km" stays. */
export const distanceName = (name: string, lang: ContentLang): string => (lang === 'de' ? (DISTANCE_DE[name] ?? name) : name);

/** Repetitions and amounts: "10 / side", "8 / leg", "8 each", "45 min". */
export function repsText(reps: string, lang: ContentLang): string {
  if (lang === 'en') return reps;
  return dot2comma(reps.replace('/ side', '/ Seite').replace('/ leg', '/ Bein').replace(/ each$/, ' je').replace(/(\d) min\b/, '$1 Min.'));
}

// ---------------------------------------------------------------------------------------------------------------------------
// Exercise names
// ---------------------------------------------------------------------------------------------------------------------------

const EXERCISE_DE: Record<string, string> = {
  'Back squat': 'Kniebeuge (Langhantel)',
  'Goblet squat': 'Goblet-Kniebeuge',
  'Leg press': 'Beinpresse',
  'Tempo squat (3 s down)': 'Kniebeuge mit Tempo (3 s runter)',
  Deadlift: 'Kreuzheben',
  'Romanian deadlift': 'Rumänisches Kreuzheben',
  'Dumbbell Romanian deadlift': 'Rumänisches Kreuzheben mit Kurzhanteln',
  'Kettlebell swing': 'Kettlebell-Swing',
  'Single-leg Romanian deadlift': 'Einbeiniges rumänisches Kreuzheben',
  'Lying leg curl': 'Beinbeuger liegend',
  'Bulgarian split squat': 'Bulgarische Kniebeuge',
  'Dumbbell reverse lunge': 'Ausfallschritt rückwärts mit Kurzhanteln',
  'Reverse lunge': 'Ausfallschritt rückwärts',
  'Dumbbell step-up': 'Step-up mit Kurzhanteln',
  'Leg extension': 'Beinstrecker',
  'Barbell hip thrust': 'Hip Thrust mit Langhantel',
  'Dumbbell hip thrust': 'Hip Thrust mit Kurzhantel',
  'Hip thrust': 'Hip Thrust',
  'Single-leg glute bridge': 'Einbeinige Glute Bridge',
  'Glute bridge march': 'Glute-Bridge-Marsch',
  'Standing calf raise': 'Wadenheben stehend',
  'Single-leg calf raise (holding DB)': 'Einbeiniges Wadenheben (mit Kurzhantel)',
  'Single-leg calf raise': 'Einbeiniges Wadenheben',
  'Bench press': 'Bankdrücken',
  'Dumbbell bench press': 'Bankdrücken mit Kurzhanteln',
  'Dumbbell floor press': 'Floor Press mit Kurzhanteln',
  'Chest press machine': 'Brustpresse (Maschine)',
  'Push-up': 'Liegestütz',
  'Incline dumbbell press': 'Schrägbankdrücken mit Kurzhanteln',
  'Overhead press': 'Schulterdrücken (Langhantel)',
  'Dumbbell shoulder press': 'Schulterdrücken mit Kurzhanteln',
  'Shoulder press machine': 'Schulterpresse (Maschine)',
  'Pike push-up': 'Pike-Liegestütz',
  'Barbell row': 'Langhantelrudern',
  'One-arm dumbbell row': 'Einarmiges Kurzhantelrudern',
  'Seated cable row': 'Kabelrudern sitzend',
  'Chest-supported row machine': 'Rudermaschine (Brust gestützt)',
  'Inverted row (table or bar)': 'Rudern unter Tisch oder Stange',
  'Suspension row (TRX)': 'TRX-Rudern',
  'Box step-up': 'Step-up auf die Box',
  'Pull-up': 'Klimmzug',
  'Pull-up / lat pulldown': 'Klimmzug / Latzug',
  'Lat pulldown': 'Latzug',
  'Assisted pull-up machine': 'Klimmzugmaschine (unterstützt)',
  'Band pull-down': 'Latzug mit Band',
  'Lateral raise': 'Seitheben',
  'Face pull': 'Face Pull',
  'Reverse fly': 'Reverse Fly',
  'Reverse pec deck': 'Reverse Butterfly (Maschine)',
  'Y-T-W raises': 'Y-T-W-Heben',
  'Band pull-apart': 'Band Pull-Apart',
  'Dumbbell curl': 'Bizepscurl mit Kurzhanteln',
  'Barbell curl': 'Bizepscurl mit Langhantel',
  'Cable curl': 'Bizepscurl am Kabel',
  'Triceps pushdown': 'Trizepsdrücken am Kabel',
  'Overhead triceps extension': 'Trizepsstrecken über Kopf',
  Dips: 'Dips',
  Plank: 'Unterarmstütz',
  'Front plank': 'Unterarmstütz',
  'Side plank': 'Seitstütz',
  'Dead bug': 'Dead Bug',
  'Bird dog': 'Bird Dog',
  'Pallof press': 'Pallof Press',
  'Cable Pallof press': 'Pallof Press am Kabel',
  'Pallof press (band/cable)': 'Pallof Press (Band/Kabel)',
  'Hanging knee raise': 'Hängendes Knieheben',
  'Copenhagen plank': 'Copenhagen-Plank',
  'Plank shoulder taps': 'Unterarmstütz mit Schulter-Taps',
  'Hollow hold': 'Hollow Hold',
  'Hip flexor stretch (half kneeling)': 'Hüftbeuger-Dehnung (halb kniend)',
  '90/90 hip switches': '90/90-Hüftwechsel',
  'Ankle dorsiflexion rocks': 'Sprunggelenk-Mobilisation (Schaukeln)',
  'Thoracic rotations': 'Brustwirbelsäulen-Rotationen',
  "World's greatest stretch": "World's Greatest Stretch",
  'Calf & soleus stretch': 'Waden- und Soleus-Dehnung',
  'A-skips': 'Skipping A',
  'B-skips': 'Skipping B',
  'Pogo hops (stiff ankles)': 'Pogo-Sprünge (steife Sprunggelenke)',
  'Pogo hops': 'Pogo-Sprünge',
  Strides: 'Steigerungen',
  'Skipping for height': 'Skipping in die Höhe',
  Bounding: 'Sprunglauf',
  'Box / tuck jumps': 'Box- und Hocksprünge',
  'Single-leg hops': 'Einbeinige Sprünge',
  'Ride in zone 2 (conversational)': 'Fahrt in Zone 2 (locker, Gespräch möglich)',
  'Continuous easy swimming, focus on technique': 'Locker durchschwimmen, Fokus auf Technik',
  'Own workout': 'Eigenes Training',
  // the watch library (see strength.ts)
  Squat: 'Kniebeuge',
  Row: 'Rudern',
  Lunge: 'Ausfallschritt',
  'Shoulder press': 'Schulterdrücken',
  'Biceps curl': 'Bizepscurl',
  'Triceps extension': 'Trizepsstrecken',
  'Leg press machine': 'Beinpresse',
  'Chest press': 'Brustpresse',
  Exercise: 'Übung',
};

// the exercise library (docs/uebungen/liste.txt): the German name is the one of the list
for (const x of LIBRARY) EXERCISE_DE[x.en] = x.de;

/** The German name of an exercise; names the person typed stay as they are. */
export function exerciseName(name: string, lang: ContentLang): string {
  return lang === 'de' ? (EXERCISE_DE[name] ?? name) : name;
}

/** Every exercise name this module knows (for the completeness tests). */
export const KNOWN_EXERCISES = Object.keys(EXERCISE_DE);

// ---------------------------------------------------------------------------------------------------------------------------
// Step labels and notes
// ---------------------------------------------------------------------------------------------------------------------------

const LABEL_DE: Record<string, string> = {
  'Warm-up': 'Einlaufen',
  'Cool-down': 'Auslaufen',
  Fast: 'Schnell',
  Threshold: 'Schwelle',
  Interval: 'Intervall',
  'Marathon pace': 'Marathontempo',
  'Marathon pace finish': 'Marathontempo-Finish',
  'Race pace': 'Wettkampftempo',
  Easy: 'Locker',
  'Long run': 'Langer Lauf',
  Recovery: 'Regeneration',
  'Very easy': 'Sehr locker',
  'Strides (20 s fast, relaxed)': 'Steigerungen (20 s schnell, locker)',
  'Half marathon': 'Halbmarathon',
  Marathon: 'Marathon',
  Workout: 'Training',
};

/** Label of a run step ("Warm-up", "Interval", a race distance). */
export function stepLabel(label: string, lang: ContentLang): string {
  return lang === 'de' ? (LABEL_DE[label] ?? label) : label;
}

const NOTE_DE: Record<string, string> = {
  'slow 3 s lowering': 'langsam, 3 s absenken',
  'moderate load, 2–3 reps in reserve': 'moderate Last, 2–3 Wiederholungen in Reserve',
  'heavy (~80–85 % 1RM), 2 reps in reserve': 'schwer (~80–85 % 1RM), 2 Wiederholungen in Reserve',
  'keep the load, fewer sets': 'Last halten, weniger Sätze',
  'light, no fatigue': 'leicht, ohne Ermüdung',
  'land softly, full recovery between sets': 'weich landen, volle Erholung zwischen den Sätzen',
  'cadence 85–95 rpm': 'Trittfrequenz 85–95 U/min',
  'counts as a hard day': 'zählt als harter Tag',
  'lighter week: one set less': 'leichtere Woche: ein Satz weniger',
  'Not made up – protecting recovery before your next key session.': 'Nicht nachgeholt – die Erholung vor deiner nächsten Schlüsseleinheit hat Vorrang.',
};

/** A note on a step or a planned session; what the person wrote themselves stays as it is. */
export function noteText(note: string, lang: ContentLang): string {
  if (lang === 'en') return note;
  // a note can carry several parts, joined by " · "
  return note
    .split(' · ')
    .map((part) => {
      const known = NOTE_DE[part];
      if (known) return known;
      const replaced = apply(MESSAGE_RULES, part);
      return replaced ?? part;
    })
    .join(' · ');
}

// ---------------------------------------------------------------------------------------------------------------------------
// Titles of planned sessions
// ---------------------------------------------------------------------------------------------------------------------------

const TITLE_DE: Record<string, string> = {
  Workout: 'Training',
  'Long run': 'Langer Lauf',
  'Easy run': 'Lockerer Lauf',
  'Easy run + strides': 'Lockerer Lauf + Steigerungen',
  'Recovery run': 'Regenerationslauf',
  'Shakeout run': 'Lockerungslauf',
  'Race-pace sharpener': 'Wettkampftempo-Schärfung',
  'Race day!': 'Wettkampftag!',
  'Core stability': 'Rumpfstabilität',
  Mobility: 'Mobilität',
  'Easy ride': 'Lockere Radfahrt',
  'Easy swim': 'Lockeres Schwimmen',
  'Own workout': 'Eigenes Training',
  'Strength test': 'Krafttest',
};

const SUFFIX = (s: string) => (s === ' (maintenance)' ? ' (Erhalt)' : s);

const TITLE_RULES: Rule[] = [
  rx(`Fartlek (\\d+) × ${NUM} min`, (m) => `Fahrtspiel ${m[1]} × ${m[2]} Min.`),
  rx(`Tempo run ${NUM} km`, (m) => `Tempolauf ${m[1]} km`),
  rx(`Threshold (\\d+) × (.+)`, (m) => `Schwelle ${m[1]} × ${m[2]}`),
  rx(`Intervals (\\d+) × (.+)`, (m) => `Intervalle ${m[1]} × ${m[2]}`),
  rx(`Marathon pace ${NUM} km`, (m) => `Marathontempo ${m[1]} km`),
  rx(`Long run with ${NUM} km @ marathon pace`, (m) => `Langer Lauf mit ${m[1]} km @ Marathontempo`),
  rx('Time trial: (.+)', (m) => `Zeitlauf: ${distanceName(m[1], 'de')}`),
  rx('Race day: (.+)', (m) => `Wettkampftag: ${m[1]}`),
  rx('(Lower|Upper|Full) body strength( \\(maintenance\\))?', (m) => `${{ Lower: 'Unterkörper', Upper: 'Oberkörper', Full: 'Ganzkörper' }[m[1] as 'Lower']}-Krafttraining${SUFFIX(m[2] ?? '')}`),
  rx('Plyometrics & drills( \\(maintenance\\))?', (m) => `Plyometrie & Lauf-ABC${SUFFIX(m[1] ?? '')}`),
  rx('Strength test.*', (m) => m[0].replace('Strength test', 'Krafttest')),
];

/** Title of a planned session. A name the person chose (a workout, an own session) stays. */
export function workoutTitle(title: string, lang: ContentLang): string {
  if (lang === 'en') return title;
  return TITLE_DE[title] ?? apply(TITLE_RULES, title) ?? title;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Messages: adjustments, warnings, reasons
// ---------------------------------------------------------------------------------------------------------------------------

const REASON_DE: Record<string, string> = {
  'Plan created': 'Plan erstellt',
  'Recent runs faster at same effort': 'Letzte Läufe bei gleicher Anstrengung schneller',
  'Recent runs slower at same effort': 'Letzte Läufe bei gleicher Anstrengung langsamer',
};

const MESSAGE_RULES: Rule[] = [
  rx('(\\d+) (?:session falls|sessions fall) into your planned breaks and (?:was|were) left out\\.', (m) => `${m[1]} ${m[1] === '1' ? 'Einheit fällt' : 'Einheiten fallen'} in deine geplanten Pausen und ${m[1] === '1' ? 'wurde' : 'wurden'} weggelassen.`),
  rx('Plan created: (\\d+) weeks to race day\\.', (m) => `Plan erstellt: ${m[1]} Wochen bis zum Wettkampftag.`),
  rx('Plan created: (\\d+) weeks to (.+)\\.', (m) => `Plan erstellt: ${m[1]} Wochen bis ${m[2]}.`),
  rx('Plan created: (\\d+) weeks\\.', (m) => `Plan erstellt: ${m[1]} Wochen.`),
  rx('Strength added: (\\d+) per week\\. Your running plan stays as it is\\.', (m) => `Kraft hinzugefügt: ${m[1]} pro Woche. Dein Laufplan bleibt unverändert.`),
  rx(`No runs logged for (\\d+) days\\. The plan restarts gently at about ${NUM} km/week( and paces were eased)?\\.`, (m) => `Seit ${m[1]} Tagen kein Lauf aufgezeichnet. Der Plan startet sanft neu bei etwa ${m[2]} km/Woche${m[3] ? ' und die Tempi wurden etwas gelockert' : ''}.`),
  rx(`You ran ${NUM} of ${NUM} planned km in the last 2 weeks\\. Upcoming weeks were rebuilt from your current level \\(~${NUM} km/week\\)\\.`, (m) => `Du bist ${m[1]} von ${m[2]} geplanten km der letzten 2 Wochen gelaufen. Die kommenden Wochen wurden von deinem aktuellen Niveau aus neu aufgebaut (~${m[3]} km/Woche).`),
  rx(`Your recent runs suggest your fitness (improved|dipped) \\(VDOT ${NUM} → ${NUM}\\)\\. Training paces were updated\\.`, (m) => `Deine letzten Läufe zeigen, dass deine Fitness ${m[1] === 'improved' ? 'gestiegen' : 'gesunken'} ist (VDOT ${m[2]} → ${m[3]}). Die Trainingstempi wurden angepasst.`),
  rx('Replaced by your rescheduled (.+)', (m) => `Ersetzt durch deine verschobene Einheit: ${workoutTitle(m[1], 'de')}`),
  rx('Not made up – protecting recovery before your next key session\\.', () => NOTE_DE['Not made up – protecting recovery before your next key session.']),
  rx('Plan rebuilt from (\\S+) at your coach\'s suggestion \\(about ' + NUM + ' km/week to start\\)\\.', (m) => `Plan ab ${m[1]} auf Vorschlag deines Coachs neu aufgebaut (Start bei etwa ${m[2]} km/Woche).`),
  rx('Your goal time is ambitious\\. Race-pace sessions start a bit slower than goal pace; they speed up if your runs show you are improving\\.', () => 'Deine Zielzeit ist ehrgeizig. Die Einheiten im Wettkampftempo starten etwas langsamer als das Zieltempo und werden schneller, wenn deine Läufe Fortschritte zeigen.'),
  rx('Your goal time is a big stretch for your current fitness\\. Race-pace sessions use your projected pace instead; it is updated as your fitness improves\\.', () => 'Deine Zielzeit ist für deine aktuelle Fitness sehr ehrgeizig. Die Einheiten im Wettkampftempo nutzen stattdessen dein prognostiziertes Tempo; es wird angepasst, wenn deine Fitness steigt.'),
  rx(`Your longest runs \\(${NUM} km\\) will take about ${NUM} h\\. Short walk breaks are fine – practise fuelling \\(60–90 g carbs per hour\\) on them\\.`, (m) => `Deine längsten Läufe (${m[1]} km) dauern etwa ${m[2]} Std. Kurze Gehpausen sind in Ordnung – übe auf ihnen die Verpflegung (60–90 g Kohlenhydrate pro Stunde).`),
  rx('Only (\\d+) weeks until race day – the plan focuses on arriving healthy rather than building a lot of new fitness\\.', (m) => `Nur noch ${m[1]} Wochen bis zum Wettkampftag – der Plan konzentriert sich darauf, gesund anzukommen, statt viel neue Fitness aufzubauen.`),
  rx('Your week has leg training the day before the long run – expect heavier legs on long runs\\.', () => 'Deine Woche hat Beintraining am Tag vor dem langen Lauf – rechne mit schwereren Beinen bei langen Läufen.'),
  rx(`With (\\d+) weeks your longest run reaches ${NUM} km instead of the ideal ${NUM} km – building the long run faster would raise injury risk\\.`, (m) => `Mit ${m[1]} Wochen erreicht dein längster Lauf ${m[2]} km statt der idealen ${m[3]} km – den langen Lauf schneller aufzubauen würde das Verletzungsrisiko erhöhen.`),
  rx('Missed "(.+)" on (\\w+) – moved to (today|\\w+)( in place of an easy run)?\\.', (m) => `„${workoutTitle(m[1], 'de')}“ am ${DAY_DE[m[2]] ?? m[2]} verpasst – verschoben auf ${m[3] === 'today' ? 'heute' : (DAY_DE[m[3]] ?? m[3])}${m[4] ? ' anstelle eines lockeren Laufs' : ''}.`),
  rx('Missed "(.+)" on (\\w+)\\. It was not squeezed in so you stay fresh for the next key session\\.', (m) => `„${workoutTitle(m[1], 'de')}“ am ${DAY_DE[m[2]] ?? m[2]} verpasst. Er wurde nicht noch eingeschoben, damit du für die nächste Schlüsseleinheit frisch bleibst.`),
  rx('Low readiness: "(.+)" moved to (\\w+), easy run today instead\\.', (m) => `Geringe Bereitschaft: „${workoutTitle(m[1], 'de')}“ auf ${DAY_DE[m[2]] ?? m[2]} verschoben, heute stattdessen ein lockerer Lauf.`),
  rx('Coach: (.+)', (m) => `Coach: ${coachLine(m[1], 'de')}`),
];

const DAY_DE: Record<string, string> = {
  Monday: 'Montag', Tuesday: 'Dienstag', Wednesday: 'Mittwoch', Thursday: 'Donnerstag', Friday: 'Freitag', Saturday: 'Samstag', Sunday: 'Sonntag',
};

/** A message of the planner (adjustment log, warning, note). */
export function messageText(message: string, lang: ContentLang): string {
  if (lang === 'en') return message;
  const known = apply(MESSAGE_RULES, message);
  return known === null ? message : dot2comma(known);
}

/** "Plan created", "Recent runs faster …": the reasons in a plan's fitness history. */
export function reasonText(reason: string, lang: ContentLang): string {
  return lang === 'de' ? (REASON_DE[reason] ?? reason) : reason;
}

const ZONE_DE: Record<string, string> = {
  recovery: 'Regeneration', easy: 'locker', long: 'langer Lauf', marathon: 'Marathontempo', threshold: 'Schwelle', interval: 'Intervall', repetition: 'schnell',
};
const ZONE_EN: Record<string, string> = {
  recovery: 'recovery', easy: 'easy', long: 'long-run', marathon: 'marathon pace', threshold: 'threshold', interval: 'interval', repetition: 'fast',
};

/** Name of a pace zone ("long-run" / "langer Lauf"). */
export const zoneName = (zone: string, lang: ContentLang): string => (lang === 'de' ? ZONE_DE : ZONE_EN)[zone] ?? zone;

/** Decimal separator of the language. */
export const decimal = (text: string, lang: ContentLang): string => (lang === 'de' ? text.replace(/(\d)\.(\d)/g, '$1,$2') : text);

// ---------------------------------------------------------------------------------------------------------------------------
// The coach's proposals (written by supabase/functions/_shared/coachTools.ts in English, shown on the confirmation card)
// ---------------------------------------------------------------------------------------------------------------------------

const DAY3_DE: Record<string, string> = { Mon: 'Mo', Tue: 'Di', Wed: 'Mi', Thu: 'Do', Fri: 'Fr', Sat: 'Sa', Sun: 'So' };
const d3 = (s: string) => DAY3_DE[s] ?? s;
const dayList = (s: string) => s.split(', ').map(d3).join(', ');
const YN = (s: string) => (s === 'yes' ? 'ja' : s === 'no' ? 'nein' : s);
const NONE = (s: string) => (s === 'none' ? 'keiner' : s.replace(/ min$/, ' Min.'));
const DAY = '(\\w{3}) (\\d{4}-\\d{2}-\\d{2})';

const EDIT_PART_DE = (part: string) =>
  part
    .replace('remove the strides (the easy part gets their distance)', 'Steigerungen entfernen (der lockere Teil bekommt ihre Distanz)')
    .replace('add strides (the easy part gets shorter)', 'Steigerungen hinzufügen (der lockere Teil wird kürzer)')
    .replace('turn into an easy run', 'in einen lockeren Lauf umwandeln')
    .replace(/^total distance /, 'Gesamtdistanz ');

const COACH_RULES: Rule[] = [
  rx(`Move "(.+)" from ${DAY} to ${DAY}`, (m) => `„${workoutTitle(m[1], 'de')}“ von ${d3(m[2])} ${m[3]} auf ${d3(m[4])} ${m[5]} verschieben`),
  rx(`Skip "(.+)" on ${DAY}`, (m) => `„${workoutTitle(m[1], 'de')}“ am ${d3(m[2])} ${m[3]} überspringen`),
  rx(`Change "(.+)" on ${DAY}: about ${NUM} km → ${NUM} km \\(([+-]?\\d+) %\\)`, (m) => `„${workoutTitle(m[1], 'de')}“ am ${d3(m[2])} ${m[3]} ändern: etwa ${m[4]} km → ${m[5]} km (${m[6]} %)`),
  rx('From now on, easy runs on (.+) get no strides, also when the plan is rebuilt\\.', (m) => `Ab jetzt bekommen lockere Läufe am ${dayList(m[1])} keine Steigerungen, auch wenn der Plan neu aufgebaut wird.`),
  rx('Easy runs may get strides again when the plan is rebuilt\\.', () => 'Lockere Läufe dürfen beim Neuaufbau des Plans wieder Steigerungen bekommen.'),
  rx('Runs per week: (\\d+) → (\\d+)', (m) => `Läufe pro Woche: ${m[1]} → ${m[2]}`),
  rx('Days you can run: (.+) → (.+)', (m) => `Tage, an denen du laufen kannst: ${dayList(m[1])} → ${dayList(m[2])}`),
  rx('Long run day: (\\w{3}) → (\\w{3})', (m) => `Tag des langen Laufs: ${d3(m[1])} → ${d3(m[2])}`),
  rx('Weekday session limit: (.+) → (.+)', (m) => `Zeitlimit unter der Woche: ${NONE(m[1])} → ${NONE(m[2])}`),
  rx('Approach: (\\w+) → (\\w+)', (m) => `Aufbau: ${m[1]} → ${m[2]}`.replace('conservative', 'vorsichtig').replace('balanced', 'ausgewogen').replace('ambitious', 'ehrgeizig')),
  rx('Injury-prone: (\\w+) → (\\w+)', (m) => `Verletzungsanfällig: ${YN(m[1])} → ${YN(m[2])}`),
  rx('Injury note: "(.*)"', (m) => `Verletzungshinweis: „${m[1]}“`),
  rx('\\(Only (\\d+) days are available, so (\\d+) runs per week\\)', (m) => `(Es sind nur ${m[1]} Tage verfügbar, daher ${m[2]} Läufe pro Woche)`),
  rx(`The weeks from ${DAY} on are rebuilt with these settings\\. Sessions you already did stay in your history\\.`, (m) => `Die Wochen ab ${d3(m[1])} ${m[2]} werden mit diesen Einstellungen neu aufgebaut. Bereits absolvierte Einheiten bleiben in deinem Verlauf.`),
  rx(`(.+) on ${DAY}: (.+)`, (m) => `${workoutTitle(m[1], 'de')} am ${d3(m[2])} ${m[3]}: ${m[4].split(', ').map(EDIT_PART_DE).join(', ')}`),
  rx('… and (\\d+) more sessions like these', (m) => `… und ${m[1]} weitere Einheiten wie diese`),
];

/** One line of a coach proposal (the confirmation card), in the language of the page. */
export function coachLine(line: string, lang: ContentLang): string {
  if (lang === 'en') return line;
  const hit = apply(COACH_RULES, line);
  return hit === null ? line : decimal(hit, 'de');
}

// ---------------------------------------------------------------------------------------------------------------------------
// Where the fitness estimate comes from (stored with the plan) and the messages of the Edge Functions
// ---------------------------------------------------------------------------------------------------------------------------

const SOURCE_RULES: Rule[] = [
  rx('your recent race result', () => 'deinem aktuellen Wettkampfergebnis'),
  rx('your best race time \\(PB\\)', () => 'deiner Bestzeit'),
  rx('heart rate & pace on (\\d+) recent Garmin runs', (m) => `Puls und Tempo von ${m[1]} aktuellen Garmin-Läufen`),
  rx('your Garmin VO2max', () => 'deiner Garmin-VO₂max'),
  rx('the race predictions of your Garmin', () => 'den Wettkampfprognosen deiner Garmin'),
  rx('your comfortable pace', () => 'deinem Wohlfühltempo'),
  rx('a typical (beginner|intermediate|advanced) runner \\(connect Garmin or add a race result to personalise\\)', (m) => `einem typischen ${({ beginner: 'Einsteiger', intermediate: 'fortgeschrittenen', advanced: 'erfahrenen' } as Record<string, string>)[m[1]]} Läufer (verbinde Garmin oder trag ein Wettkampfergebnis ein, um es zu personalisieren)`),
];

/** "heart rate & pace on 20 recent Garmin runs" and the like: the basis of a fitness estimate. */
export function sourceText(source: string, lang: ContentLang): string {
  if (lang === 'en') return source;
  const [base, raised] = source.split(' – raised, your recent runs were faster');
  const hit = apply(SOURCE_RULES, base);
  return (hit ?? base) + (raised !== undefined ? ' – angehoben, weil deine letzten Läufe schneller waren' : '');
}

const SERVER_RULES: Rule[] = [
  rx('Garmin rejected this Personal API key\\. Make sure you copied the whole key and that it has not expired or been deleted\\.', () => 'Garmin hat diesen Personal-API-Schlüssel abgelehnt. Prüfe, ob du den ganzen Schlüssel kopiert hast und ob er nicht abgelaufen oder gelöscht wurde.'),
  rx('Garmin rate limit reached – try syncing again in a few minutes\\.', () => 'Das Garmin-Limit ist erreicht – versuche die Synchronisierung in ein paar Minuten erneut.'),
  rx('Garmin is not connected\\.', () => 'Garmin ist nicht verbunden.'),
  rx('That does not look like a Garmin Personal API key\\.', () => 'Das sieht nicht nach einem Garmin-Personal-API-Schlüssel aus.'),
  rx("Garmin's token service answered (\\d+)\\. Please try again in a moment\\.", (m) => `Der Token-Dienst von Garmin hat mit ${m[1]} geantwortet. Bitte versuche es gleich noch einmal.`),
  rx('Your Garmin Personal API key expired or was deleted\\. Create a new key in Garmin Connect and reconnect\\.', () => 'Dein Garmin-Personal-API-Schlüssel ist abgelaufen oder wurde gelöscht. Erstelle in Garmin Connect einen neuen Schlüssel und verbinde dich erneut.'),
  rx('Please sign in again\\.', () => 'Bitte melde dich erneut an.'),
  rx('Confirmation missing\\.', () => 'Die Bestätigung fehlt.'),
  rx('The code has 6 digits – it is shown on the watch face\\.', () => 'Der Code hat 6 Ziffern – er wird auf dem Zifferblatt der Uhr angezeigt.'),
  rx('Code not found or expired\\. The watch shows a new code by itself – check it again\\.', () => 'Code nicht gefunden oder abgelaufen. Die Uhr zeigt von selbst einen neuen Code an – sieh noch einmal nach.'),
  rx('The coach is not set up yet: the owner of this installation has to add the ANTHROPIC_API_KEY secret\\.', () => 'Der Coach ist noch nicht eingerichtet: Der Betreiber dieser Installation muss das Secret ANTHROPIC_API_KEY hinzufügen.'),
  rx('Write a message first\\.', () => 'Schreibe zuerst eine Nachricht.'),
  rx('Please keep a message under (\\d+) characters\\.', (m) => `Bitte halte eine Nachricht unter ${m[1]} Zeichen.`),
  rx('Unexpected error\\.', () => 'Unerwarteter Fehler.'),
  rx('Activity not found\\.', () => 'Aktivität nicht gefunden.'),
];

/** A message from an Edge Function, in the language of the page (unknown messages stay as they are). */
export function serverText(message: string, lang: ContentLang): string {
  if (lang === 'en') return message;
  return apply(SERVER_RULES, message) ?? message;
}

/** The English words that must not survive a translation (used by the completeness tests). */
export const ENGLISH_MARKERS = [
  'the', 'and', 'your', 'you', 'run', 'runs', 'easy', 'long', 'week', 'weeks', 'plan', 'with', 'for', 'from', 'pace', 'strength', 'body',
  'warm-up', 'cool-down', 'interval', 'intervals', 'threshold', 'tempo', 'recovery', 'rest', 'set', 'sets', 'reps', 'side', 'leg', 'hold',
  'press', 'row', 'curl', 'raise', 'raises', 'squat', 'lunge', 'stretch', 'jump', 'jumps', 'hops', 'ride', 'swim', 'swimming', 'light',
  'heavy', 'load', 'slow', 'fast', 'race', 'day', 'created', 'rebuilt', 'recent', 'faster', 'slower', 'effort', 'same',
];
