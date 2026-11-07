// The exercise library: the 279 exercises of docs/uebungen/liste.txt, each with its English name, the movement (an archetype of
// exerciseLibraryMoves.ts), the muscles it trains and how it fits the plan. Exercises that the website already had are only
// linked ("=key"): they get their muscle group, nothing else changes. Everything else becomes a catalogue exercise, a watch
// library entry and a figure.
//
// Fields: [English name, movement "archetype:options", muscles "main;secondary", pattern, level 0..2, what to avoid (k knee, b back, s shoulder, w wrist)]
// Muscles: ch chest, bk back, tr traps, de delts, bi biceps, ti triceps, fo forearms, qu quads, ha hamstrings, gl glutes, ca calves,
// ab abs, lb low back, hf hip flexors, ad adductors.
//
// No imports of app code (types only): it runs in the Edge Function (Deno), in the tests (Node) and in the website.

import { EXERCISE_LIST, type ListEntry, type ListGear, type ListGroup } from './exerciseListData.ts';
import { FINE_OWN, MUSCLES_OWN, MUSCLE_IDS, bitOf, maskOf, type CoarseMuscle, type FineMuscle } from './figureMuscles.ts';
import type { Pattern } from './exerciseCatalog.ts';
import type { CountMode, Family } from './strength.ts';

type Def = [string, string, string, Pattern, 0 | 1 | 2, string];
const DEFS: Record<string, string | Def> = {
  // ---------------------------------------------------------------- Brust
  'Liegestütze': '=push_up',
  'Liegestütze erhöht (Decline)': ['Decline push-up', 'pushupvar:decline', 'ch;ti,de,ab', 'push_h', 1, 'w'],
  'Liegestütze mit Handgriffen auf Kettlebells': ['Push-up on kettlebells', 'pushupvar:kb', 'ch;ti,de,ab', 'push_h', 1, 'w'],
  'Archer Push-ups': ['Archer push-up', 'pushupvar:archer', 'ch;ti,de,ab', 'push_h', 2, 'sw'],
  'Pseudo-Planche-Push-ups': ['Pseudo planche push-up', 'pushupvar:planche', 'ch,de;ti,ab', 'push_h', 2, 'sw'],
  'Pike-Push-ups': '=pike_push_up',
  'Dips am Barren, brustbetont': ['Chest dips', 'dipschest', 'ch;ti,de', 'push_h', 1, 'sw'],
  'Bankdrücken flach': '=bench_press',
  'Bankdrücken schräg': ['Incline barbell bench press', 'press:incline,bb', 'ch;de,ti', 'push_h', 1, 's'],
  'Bankdrücken negativ': ['Decline barbell bench press', 'press:decline,bb', 'ch;ti,de', 'push_h', 1, 's'],
  'Bankdrücken mit Pausen': ['Paused bench press', 'press:flat,bb', 'ch;ti,de', 'push_h', 1, 's'],
  'Kurzhantel-Bankdrücken flach': '=db_bench',
  'Kurzhantel-Bankdrücken schräg': '=incline_db',
  'Kettlebell-Bankdrücken': ['Kettlebell bench press', 'press:flat,kb', 'ch;ti,de', 'push_h', 1, 's'],
  'Kurzhantel-Fliegende flach': ['Dumbbell fly', 'fly:flat,db', 'ch;de', 'push_h', 1, 's'],
  'Kurzhantel-Fliegende schräg': ['Incline dumbbell fly', 'fly:incline,db', 'ch;de', 'push_h', 1, 's'],
  'Kettlebell-Fliegende liegend': ['Kettlebell fly', 'fly:flat,kb', 'ch;de', 'push_h', 1, 's'],
  'Kabelzug-Fliegende hoch, mittel, tief': ['Cable fly (high, mid, low)', 'cablefly:mid', 'ch;de', 'push_h', 0, 's'],
  'Kabelzug-Crossover': ['Cable crossover', 'cablefly:high', 'ch;de', 'push_h', 1, 's'],
  'Einarmiges Drücken am Kabel': ['One-arm cable press', 'cablepress1', 'ch;ti,de', 'push_h', 0, ''],
  'Butterfly': ['Pec deck fly', 'pecdeck', 'ch;de', 'push_h', 0, 's'],
  'Brustpresse': '=chest_press',
  'Chest Press an der Smith-Maschine': ['Smith machine chest press', 'press:flat,smith', 'ch;ti,de', 'push_h', 0, 's'],
  'Pullover mit Kurzhantel oder Langhantel': ['Pullover', 'pullover:db', 'ch,bk;ti', 'push_h', 1, 's'],
  'Kettlebell-Pullover': ['Kettlebell pullover', 'pullover:kb', 'ch,bk;ti', 'push_h', 1, 's'],
  'Band-Liegestütze': ['Banded push-up', 'pushupvar:band', 'ch;ti,de,ab', 'push_h', 1, 'w'],
  'Band-Fliegende stehend': ['Standing band fly', 'bandfly', 'ch;de', 'push_h', 0, ''],
  'Band-Brustpresse': ['Band chest press', 'bandpress', 'ch;ti,de', 'push_h', 0, ''],
  // ---------------------------------------------------------------- Rücken
  'Klimmzüge Obergriff': '=pull_up',
  'Klimmzüge Untergriff': ['Chin-up', 'pullup', 'bk,bi;fo', 'pull_v', 1, ''],
  'Klimmzüge neutraler Griff': ['Neutral-grip pull-up', 'pullup', 'bk;bi,fo', 'pull_v', 1, ''],
  'Klimmzüge einarmig oder mit Hilfe': ['Band-assisted pull-up', 'pullup:band', 'bk;bi,fo', 'pull_v', 1, ''],
  'Muscle-Ups': ['Muscle-up', 'muscleup', 'bk,ch;ti,bi,de', 'pull_v', 2, 'sw'],
  'Latzug vorne': '=lat_pulldown',
  'Latzug Untergriff': ['Underhand lat pulldown', 'pulldown:under,cable', 'bk,bi;fo', 'pull_v', 0, ''],
  'Latzug eng': ['Close-grip lat pulldown', 'pulldown:narrow,cable', 'bk;bi', 'pull_v', 0, ''],
  'Rudern sitzend am Kabelzug': '=cable_row',
  'Einarmiges Rudern am Kabelzug': ['One-arm cable row', 'cablerow1', 'bk;bi,tr', 'pull_h', 0, ''],
  'Rudern vorgebeugt mit Langhantel': '=bb_row',
  'Rudern vorgebeugt mit Kurzhantel': ['Bent-over dumbbell row', 'rowbent:db', 'bk;bi,tr,lb', 'pull_h', 0, 'b'],
  'Einarmiges Kurzhantelrudern auf Bank': '=db_row',
  'Chest-Supported Row': ['Chest-supported dumbbell row', 'chestrow:db', 'bk;bi,tr', 'pull_h', 0, ''],
  'T-Bar-Rudern': ['T-bar row', 'tbar', 'bk;bi,tr,lb', 'pull_h', 1, 'b'],
  'Rudern an der Maschine': '=chest_row',
  'Gorilla Row': ['Gorilla row', 'gorilla:kb', 'bk;bi,tr', 'pull_h', 1, 'b'],
  'Einarmiges Kettlebell-Rudern vorgebeugt': ['One-arm kettlebell row', 'rowbent:kb', 'bk;bi,tr', 'pull_h', 0, 'b'],
  'Renegade Row': ['Renegade row', 'renegade:kb', 'bk,ab;bi,de', 'pull_h', 2, 'sw'],
  'Kettlebell-Kreuzheben mit Rudern': ['Kettlebell deadlift to row', 'kbdlrow', 'bk,ha;gl,bi,lb', 'pull_h', 1, 'b'],
  'Hyperextension': ['Back extension', 'hyperext', 'lb;gl,ha', 'hinge', 0, 'b'],
  'Superman': ['Superman', 'superman', 'lb;gl,bk', 'hinge', 0, ''],
  'Reverse Snow Angels': ['Reverse snow angel', 'snowangel', 'bk,tr;lb,de', 'pull_h', 0, ''],
  'Band-Rudern': ['Band row', 'bandrow', 'bk;bi,tr', 'pull_h', 0, ''],
  'Band-Pull-Apart': '=band_pull_apart',
  'Band-Face-Pulls': ['Band face pull', 'bandface', 'de,tr;bk', 'delts', 0, ''],
  'Rudern am Türanker': ['Door-anchor band row', 'doorrow', 'bk;bi,tr', 'pull_h', 0, ''],
  // ---------------------------------------------------------------- Trapez und Nacken
  'Shrugs mit Langhantel': ['Barbell shrug', 'shrug:bb', 'tr;fo', 'delts', 0, ''],
  'Shrugs mit Kurzhantel': ['Dumbbell shrug', 'shrug:db', 'tr;fo', 'delts', 0, ''],
  'Shrugs mit Kettlebells': ['Kettlebell shrug', 'shrug:kb', 'tr;fo', 'delts', 0, ''],
  'Shrugs am Kabelzug': ['Cable shrug', 'shrug:cable', 'tr;fo', 'delts', 0, ''],
  'Shrugs an der Smith-Maschine': ['Smith machine shrug', 'shrug:smith', 'tr;fo', 'delts', 0, ''],
  'Face Pulls': '=face_pull',
  'Upright Rows': ['Upright row', 'upright:bb', 'tr,de;bi', 'delts', 1, 's'],
  'Nackenbeugen und Nackenstrecken': ['Neck flexion and extension', 'neckflex', 'tr;', 'delts', 0, ''],
  'Nackenübungen mit Band': ['Band neck extension', 'neckband:band', 'tr;', 'delts', 0, ''],
  'Nackenmaschine': ['Neck machine', 'neckmachine', 'tr;', 'delts', 0, ''],
  // ---------------------------------------------------------------- Schultern
  'Schulterdrücken stehend': '=ohp',
  'Schulterdrücken sitzend': ['Seated barbell shoulder press', 'presssit:bb', 'de;ti,tr', 'push_v', 1, 's'],
  'Schulterdrücken mit Kurzhantel sitzend': ['Seated dumbbell shoulder press', 'presssit:db', 'de;ti,tr', 'push_v', 0, 's'],
  'Schulterdrücken mit Kurzhantel stehend': '=db_shoulder_press',
  'Arnold Press': ['Arnold press', 'arnold', 'de;ti,tr', 'push_v', 1, 's'],
  'Schulterdrücken beidarmig mit Kettlebell': ['Two-kettlebell shoulder press', 'presstand:kb', 'de;ti,tr', 'push_v', 1, 's'],
  'Schulterdrücken einarmig mit Kettlebell': ['One-arm kettlebell press', 'presstand:kb', 'de;ti,ab', 'push_v', 1, 's'],
  'Bottoms-up Press': ['Bottoms-up kettlebell press', 'bottomsup', 'de;ti,fo', 'push_v', 2, 's'],
  'Kniender Press': ['Kneeling kettlebell press', 'presskneel:kb', 'de;ti,ab', 'push_v', 1, 's'],
  'Halbkniender Press': ['Half-kneeling kettlebell press', 'presskneel:half,kb', 'de;ti,ab', 'push_v', 1, 's'],
  'Kettlebell-Halo': ['Kettlebell halo', 'halo', 'de;tr,ab', 'delts', 1, 's'],
  'Schulterdrücken an der Maschine': '=shoulder_press_m',
  'Schulterdrücken an der Smith-Maschine': ['Smith machine shoulder press', 'presssit:smith', 'de;ti,tr', 'push_v', 0, 's'],
  'Seitheben mit Kurzhantel': '=lateral_raise',
  'Seitheben mit Kettlebell': ['Kettlebell lateral raise', 'raise:kb', 'de;tr', 'delts', 1, 's'],
  'Seitheben am Kabel': ['Cable lateral raise', 'raise:cable', 'de;tr', 'delts', 0, 's'],
  'Seitheben an der Maschine': ['Lateral raise machine', 'raise:machine', 'de;tr', 'delts', 0, 's'],
  'Frontheben mit Kurzhantel': ['Dumbbell front raise', 'raise:front,db', 'de;ch', 'delts', 0, 's'],
  'Frontheben mit Kettlebell': ['Kettlebell front raise', 'raise:front,kb', 'de;ch', 'delts', 0, 's'],
  'Frontheben am Kabel': ['Cable front raise', 'raise:front,cable', 'de;ch', 'delts', 0, 's'],
  'Frontheben mit Gewichtsscheibe': ['Plate front raise', 'raise:front,plate', 'de;ch', 'delts', 0, 's'],
  'Reverse Flys mit Kurzhantel': '=reverse_fly',
  'Reverse Flys an der Maschine': '=reverse_pec_deck',
  'Reverse Flys am Kabel': ['Cable reverse fly', 'reversecable', 'de,tr;bk', 'delts', 0, ''],
  'Handstand-Push-ups an der Wand': ['Wall handstand push-up', 'handstandpush', 'de;ti,tr', 'push_v', 2, 'sw'],
  'Band-Schulterdrücken': ['Band shoulder press', 'presstand:band', 'de;ti,tr', 'push_v', 0, ''],
  'Band-Seitheben': ['Band lateral raise', 'raise:band', 'de;tr', 'delts', 0, ''],
  'Band-Frontheben': ['Band front raise', 'raise:front,band', 'de;ch', 'delts', 0, ''],
  'Band-Außenrotation': ['Band external rotation', 'extrot:band', 'de;tr', 'delts', 0, ''],
  'Außen- und Innenrotation mit Kurzhantel oder Kabel': ['External and internal rotation', 'extrot:db', 'de;tr', 'delts', 0, ''],
  // ---------------------------------------------------------------- Bizeps
  'Langhantel-Curls': '=bb_curl',
  'Kurzhantel-Curls abwechselnd': '=db_curl',
  'Hammer Curls': ['Hammer curl', 'curl:db', 'bi;fo', 'arms', 0, ''],
  'Kettlebell-Curls': ['Kettlebell curl', 'curl:kb', 'bi;fo', 'arms', 0, ''],
  'Kettlebell-Hammer-Curls': ['Kettlebell hammer curl', 'curl:kb', 'bi;fo', 'arms', 0, ''],
  'Konzentrationscurls': ['Concentration curl', 'curl:concentration,db', 'bi;fo', 'arms', 0, ''],
  'Preacher Curls': ['Preacher curl', 'curl:preacher,ez', 'bi;fo', 'arms', 0, ''],
  'Incline Curls': ['Incline dumbbell curl', 'curl:incline,db', 'bi;fo', 'arms', 0, ''],
  'Kabelzug-Curls mit Stange': '=cable_curl',
  'Kabelzug-Curls mit Seil': ['Cable rope curl', 'curl:cable', 'bi;fo', 'arms', 0, ''],
  'Einarmige Kabelzug-Curls': ['One-arm cable curl', 'curl:cable', 'bi;fo', 'arms', 0, ''],
  'Bizeps-Maschine': ['Biceps curl machine', 'curl:machine', 'bi;fo', 'arms', 0, ''],
  'Band-Curls': ['Band curl', 'curl:band', 'bi;fo', 'arms', 0, ''],
  'Band-Hammer-Curls': ['Band hammer curl', 'curl:band', 'bi;fo', 'arms', 0, ''],
  // ---------------------------------------------------------------- Trizeps
  'Dips an Bank oder Stuhl': ['Bench dip', 'benchdips', 'ti;ch,de', 'arms', 0, 'sw'],
  'Diamond Push-ups': ['Diamond push-up', 'pushupvar:diamond', 'ti,ch;de,ab', 'push_h', 1, 'w'],
  'French Press mit Langhantel oder EZ': ['French press', 'skull:ez', 'ti;', 'arms', 1, 'w'],
  'French Press mit Kurzhantel': ['Dumbbell French press', 'skull:db', 'ti;', 'arms', 0, ''],
  'Skull Crusher mit Kettlebells': ['Kettlebell skull crusher', 'skull:kb', 'ti;', 'arms', 1, ''],
  'Kettlebell-Trizepsstrecken überkopf': ['Kettlebell overhead triceps extension', 'tricepsoh:kb', 'ti;de', 'arms', 0, 's'],
  'Trizepsdrücken am Kabel mit Seil': ['Rope triceps pushdown', 'pushdown:cable', 'ti;', 'arms', 0, ''],
  'Trizepsdrücken am Kabel mit Stange': '=pushdown',
  'Einarmiges Trizepsdrücken am Kabel': ['One-arm triceps pushdown', 'pushdown:cable', 'ti;', 'arms', 0, ''],
  'Überkopf-Trizepsstrecken am Kabel': ['Cable overhead triceps extension', 'ohcable', 'ti;de', 'arms', 0, 's'],
  'Overhead Extension mit Kurzhantel': '=oh_triceps',
  'Kickbacks mit Kurzhantel': ['Dumbbell triceps kickback', 'kickback:db', 'ti;de', 'arms', 0, ''],
  'Kickbacks am Kabel': ['Cable triceps kickback', 'kickback:cable', 'ti;', 'arms', 0, ''],
  'Trizepsmaschine': ['Triceps extension machine', 'tricepsmachine', 'ti;', 'arms', 0, ''],
  'Band-Trizepsdrücken': ['Band triceps pushdown', 'pushdown:band', 'ti;', 'arms', 0, ''],
  'Band-Overhead-Extension': ['Band overhead triceps extension', 'tricepsoh:band', 'ti;de', 'arms', 0, 's'],
  // ---------------------------------------------------------------- Unterarme
  'Handgelenkscurls sitzend': ['Seated wrist curl', 'wristcurl:db', 'fo;', 'arms', 0, 'w'],
  'Umgekehrte Handgelenkscurls': ['Reverse wrist curl', 'wristcurl:rev,bb', 'fo;', 'arms', 0, 'w'],
  'Kettlebell-Handgelenkscurls': ['Kettlebell wrist curl', 'wristcurl:kb', 'fo;', 'arms', 0, 'w'],
  'Dead Hang': ['Dead hang', 'deadhang', 'fo;bk,de', 'arms', 0, 's'],
  'Plate Pinch': ['Plate pinch', 'pinch', 'fo;', 'arms', 0, ''],
  'Handgelenkscurls am Kabel': ['Cable wrist curl', 'wristcable', 'fo;', 'arms', 0, 'w'],
  'Band-Handgelenksübungen': ['Band wrist exercises', 'wristcurl:band', 'fo;', 'arms', 0, ''],
  // ---------------------------------------------------------------- Quadrizeps
  'Kniebeuge mit Langhantel (Back Squat)': '=back_squat',
  'Front Squat': ['Front squat', 'squat:front,bb', 'qu;gl,ab,ad', 'squat', 2, 'b'],
  'Goblet Squat': '=goblet_squat',
  'Racked Squat mit Kettlebell': ['Racked kettlebell squat', 'squat:rack,kb', 'qu;gl,ab', 'squat', 1, ''],
  'Sumo-Kniebeuge mit Kettlebell': ['Kettlebell sumo squat', 'squat:sumo,kb', 'qu,ad;gl', 'squat', 0, ''],
  'Hack Squat': ['Hack squat', 'hack', 'qu;gl', 'squat', 0, 'k'],
  'Beinpresse': '=leg_press',
  'Beinstrecker': '=leg_ext',
  'Bulgarian Split Squat': '=bulgarian',
  'Ausfallschritt vorwärts oder rückwärts': '=reverse_lunge_db',
  'Reverse Lunge mit Kettlebell': ['Kettlebell reverse lunge', 'lunge:kb', 'qu,gl;ad', 'lunge', 0, 'k'],
  'Lateral Lunge mit Kettlebell': ['Kettlebell lateral lunge', 'lunge:lateral,kb', 'qu,ad;gl', 'lunge', 1, 'k'],
  'Walking Lunges': ['Walking lunge', 'lunge:walk,db', 'qu,gl;ad', 'lunge', 0, 'k'],
  'Step-ups': '=step_up',
  'Pistol Squat': ['Pistol squat', 'pistol:none', 'qu;gl,ab', 'squat', 2, 'k'],
  'Pistol Squat mit Gegengewicht': ['Counterweight pistol squat', 'pistol:kb', 'qu;gl,ab', 'squat', 2, 'k'],
  'Wall Sit': ['Wall sit', 'wallsit', 'qu;gl', 'squat', 0, 'k'],
  'Sissy Squat': ['Sissy squat', 'squat:sissy,none', 'qu;', 'squat', 2, 'k'],
  'Smith-Maschine-Kniebeuge': ['Smith machine squat', 'squat:smith', 'qu;gl,ad', 'squat', 0, 'k'],
  'Band-Kniebeuge': ['Band squat', 'squat:band', 'qu;gl,ad', 'squat', 0, ''],
  'Spanish Squat mit Band': ['Spanish squat', 'squat:spanish,none', 'qu;', 'squat', 1, 'k'],
  'Band-Beinstrecker': ['Band leg extension', 'legextband', 'qu;', 'lunge', 0, 'k'],
  // ---------------------------------------------------------------- Hamstrings
  'Rumänisches Kreuzheben': '=rdl_bb',
  'Single-Leg Romanian Deadlift': '=sl_rdl',
  'Stiff-Legged Deadlift': ['Stiff-leg deadlift', 'hamstring:stiff,bb', 'ha;gl,lb', 'hinge', 1, 'b'],
  'Beinbeuger liegend': '=leg_curl',
  'Beinbeuger sitzend': ['Seated leg curl', 'hamstring:curlseat', 'ha;ca', 'hinge', 0, ''],
  'Nordic Hamstring Curl': ['Nordic hamstring curl', 'hamstring:nordic', 'ha;gl', 'hinge', 2, 'k'],
  'Glute-Ham-Raise': ['Glute-ham raise', 'hamstring:ghr', 'ha,gl;lb', 'hinge', 2, 'b'],
  'Good Morning': ['Good morning', 'hamstring:goodmorning,bb', 'ha,lb;gl', 'hinge', 1, 'b'],
  'Kabelzug-Beinbeuger': ['Cable leg curl', 'hamstring:cable', 'ha;ca', 'hinge', 0, ''],
  'Einbeiniges Kreuzheben': ['Single-leg deadlift', 'singledl:db', 'ha,gl;lb', 'hinge', 1, ''],
  'Slider-Curls': ['Slider leg curl', 'hamstring:slider', 'ha;gl', 'hinge', 1, ''],
  'Band-Beinbeuger': ['Band leg curl', 'hamstring:band', 'ha;ca', 'hinge', 0, ''],
  // ---------------------------------------------------------------- Gesäß und Hüfte
  'Kreuzheben konventionell': '=deadlift',
  'Sumo-Kreuzheben': ['Sumo deadlift', 'sumodl:bb', 'gl,ha,qu;lb,ad,fo', 'hinge', 1, 'b'],
  'Hip Thrust mit Langhantel': '=hip_thrust',
  'Hip Thrust mit Kurzhantel': '=hip_thrust_db',
  'Kettlebell-Hip-Thrust': ['Kettlebell hip thrust', '~hip_thrust_db:kb', 'gl;ha,lb', 'glute', 0, ''],
  'Glute Bridge': ['Glute bridge', 'glute:bridge,none', 'gl;ha,lb', 'glute', 0, ''],
  'Single-Leg Glute Bridge': '=glute_bridge',
  'Glute-Kickback am Kabel': ['Cable glute kickback', 'glute:kickcable', 'gl;ha', 'glute', 0, ''],
  'Glute-Kickback an der Maschine': ['Glute kickback machine', 'glute:kickmachine', 'gl;ha', 'glute', 0, ''],
  'Abduktion an der Maschine': ['Hip abduction machine', 'glute:abduct', 'gl;', 'glute', 0, ''],
  'Adduktion an der Maschine': ['Hip adduction machine', 'glute:adduct', 'ad;', 'glute', 0, ''],
  'Kabelzug-Abduktion': ['Cable hip abduction', 'glute:cableabd', 'gl;', 'glute', 0, ''],
  'Kabelzug-Adduktion': ['Cable hip adduction', 'glute:cableabd', 'ad;', 'glute', 0, ''],
  'Band-Hip-Thrust': ['Band hip thrust', '~hip_thrust_db:band', 'gl;ha,lb', 'glute', 0, ''],
  'Band-Clamshells': ['Band clamshell', 'glute:clam', 'gl;', 'glute', 0, ''],
  'Band-Seitschritte': ['Band side step', 'glute:sidestep', 'gl;ad', 'glute', 0, ''],
  'Donkey Kicks': ['Donkey kick', 'glute:donkey', 'gl;ha', 'glute', 0, 'w'],
  'Fire Hydrants': ['Fire hydrant', 'glute:hydrant', 'gl;', 'glute', 0, 'w'],
  // ---------------------------------------------------------------- Waden
  'Wadenheben stehend': '=calf_machine',
  'Wadenheben sitzend': ['Seated calf raise', 'calfraise:seated,machine', 'ca;', 'calf', 0, ''],
  'Wadenheben einbeinig': '=calf_body',
  'Eselheben': ['Donkey calf raise', 'calfraise:donkey', 'ca;', 'calf', 0, ''],
  'Wadenheben an der Treppenstufe': ['Stair calf raise', 'calfraise:stair', 'ca;', 'calf', 0, ''],
  'Band-Waden': ['Band calf raise', 'calfraise:band', 'ca;', 'calf', 0, ''],
  // ---------------------------------------------------------------- Bauch und Rumpf
  'Crunches': ['Crunch', 'crunch', 'ab;', 'core', 0, ''],
  'Bicycle Crunches': ['Bicycle crunch', 'crunch:bicycle', 'ab;hf', 'core', 0, ''],
  'Beinheben liegend': ['Lying leg raise', 'legraise', 'ab,hf;', 'core', 0, 'b'],
  'Hängendes Beinheben': ['Hanging leg raise', 'legraise:hang', 'ab,hf;fo', 'core', 1, ''],
  'Knieheben hängend': '=hanging_knee',
  'Dragon Flag': ['Dragon flag', 'dragon', 'ab;hf,lb', 'core', 2, 'b'],
  'Plank': '=plank',
  'Seitlicher Plank': '=side_plank',
  'Plank mit Kettlebell-Drag': ['Plank with kettlebell drag', 'plankdrag', 'ab;de,bk', 'core', 1, ''],
  'Dead Bug': '=dead_bug',
  'Bird Dog': '=bird_dog',
  'Hollow Hold': ['Hollow hold', 'hollow', 'ab;hf', 'core', 0, ''],
  'Russian Twist': ['Russian twist', 'twist:mb', 'ab;hf', 'core', 0, ''],
  'Russian Twist mit Kettlebell': ['Kettlebell Russian twist', 'twist:kb', 'ab;hf', 'core', 0, ''],
  'Kettlebell-Woodchopper': ['Kettlebell woodchopper', 'chop:kb', 'ab;de,gl', 'core', 0, ''],
  'Kettlebell-Seitbeuge': ['Kettlebell side bend', 'sidebend:kb', 'ab;', 'core', 0, ''],
  'Kettlebell-Halbkniebeuge mit Gegengewicht': ['Counterbalance half squat', 'kbcounter', 'qu,ab;gl', 'core', 1, ''],
  'Kettlebell-Sit-up': ['Kettlebell sit-up', 'situp:kb', 'ab;hf', 'core', 1, ''],
  'Kabelzug-Crunches': ['Cable crunch', 'cablecrunch', 'ab;', 'core', 0, ''],
  'Kabelzug-Woodchopper': ['Cable woodchopper', 'chop:cable', 'ab;de', 'core', 0, ''],
  'Pallof Press': '=pallof',
  'Bauchpresse': ['Ab crunch machine', 'abmachine', 'ab;', 'core', 0, ''],
  'AB-Wheel Rollout': ['Ab wheel rollout', 'abwheel', 'ab;lb,de', 'core', 2, 'b'],
  'Mountain Climbers': ['Mountain climber', 'climbers', 'ab,hf;de,qu', 'core', 0, 'w'],
  'Toe Touches': ['Toe touch crunch', 'crunch:toe', 'ab;', 'core', 0, ''],
  'Schräge Crunches': ['Oblique crunch', 'crunch:oblique', 'ab;', 'core', 0, ''],
  'Seitliche Rumpfbeuge mit Kurzhantel': ['Dumbbell side bend', 'sidebend:db', 'ab;', 'core', 0, ''],
  'Band-Crunches': ['Band crunch', 'crunch:band', 'ab;', 'core', 0, ''],
  'Band-Anti-Rotation': ['Band anti-rotation press', 'antirot', 'ab;', 'core', 0, ''],
  // ---------------------------------------------------------------- Hüftbeuger
  'Hip Flexor Raises hängend': ['Hanging hip flexor raise', 'hipflex:hang', 'hf;ab', 'core', 1, ''],
  'Knieheben am Barren': ['Captain\'s chair knee raise', 'hipflex:bars', 'hf,ab;', 'core', 0, ''],
  'Hip Flexor Raises liegend': ['Lying hip flexor raise', 'hipflex:lying', 'hf;ab', 'core', 0, ''],
  'Kabelzug-Hüftbeugen': ['Cable hip flexion', 'hipflex:cable', 'hf;', 'core', 0, ''],
  'Band-Hüftbeugen': ['Band hip flexion', 'hipflex:band', 'hf;', 'core', 0, ''],
  // ---------------------------------------------------------------- Calisthenics
  'Front-Lever-Progressionen': ['Front lever progression', 'lever', 'bk,ab;bi,de', 'pull_v', 2, 's'],
  'Back-Lever-Progressionen': ['Back lever progression', 'lever:back', 'de,bi;ch,ab', 'pull_v', 2, 's'],
  'Human Flag': ['Human flag', 'flag', 'ab,de;bk', 'core', 2, 's'],
  'Planche-Progressionen': ['Planche progression', 'planche', 'de,ch;ab', 'push_h', 2, 'sw'],
  'L-Sit': ['L-sit', 'lsit', 'ab,hf;ti,qu', 'core', 1, 'w'],
  'V-Sit': ['V-sit', 'vsit', 'ab,hf;ti', 'core', 2, 'w'],
  'Handstand-Halten': ['Handstand hold', 'handstand', 'de;ti,tr,ab', 'push_v', 2, 'sw'],
  'Handstand-Liegestütze': ['Handstand push-up', 'handstand:push', 'de;ti,tr', 'push_v', 2, 'sw'],
  'Australian Pull-ups': ['Australian pull-up', 'australian', 'bk;bi,tr', 'pull_h', 0, ''],
  'Inverted Rows': '=inverted_row',
  // ---------------------------------------------------------------- Ganzkörper
  'Burpees': ['Burpee', 'burpee', 'qu,ch;de,ab,ti', 'squat', 0, 'w'],
  'Burpees mit Sprung': ['Burpee with jump', 'burpee:jump', 'qu,ch;de,ab', 'squat', 1, 'wk'],
  'Kettlebell-Swing beidhändig': '=kb_swing',
  'Kettlebell-Swing einarmig': ['One-arm kettlebell swing', 'swing:kb', 'gl,ha;lb,de,ab', 'hinge', 1, 'b'],
  'Russian Swing': ['Russian swing', 'swing:kb', 'gl,ha;lb,ab', 'hinge', 1, 'b'],
  'Clean': ['Kettlebell clean', 'clean:kb', 'gl,ha;bk,de,fo', 'hinge', 2, 'b'],
  'Hang Clean': ['Hang clean', 'clean:hang,kb', 'gl,ha;bk,de', 'hinge', 2, 'b'],
  'Snatch': ['Kettlebell snatch', 'clean:snatch,kb', 'gl,de;bk,ha,fo', 'hinge', 2, 'bs'],
  'Hang Snatch': ['Hang snatch', 'clean:snatch,hang,kb', 'gl,de;bk,ha', 'hinge', 2, 'bs'],
  'Jerk': ['Kettlebell jerk', 'clean:jerk,kb', 'de,qu;ti,gl', 'push_v', 2, 's'],
  'Clean and Press': ['Clean and press', 'clean:press,kb', 'gl,de;qu,ti,bk', 'push_v', 2, 'bs'],
  'Snatch Test': ['Snatch test', 'clean:snatch,kb', 'gl,de;bk,ha', 'hinge', 2, 'bs'],
  'Kettlebell-Clean-Squat': ['Clean squat', 'clean:squat,kb', 'qu,gl;de,bk', 'squat', 2, 'bk'],
  'Thruster mit Kurzhantel': ['Dumbbell thruster', 'thruster:db', 'qu,de;gl,ti', 'squat', 1, 'sk'],
  'Thruster mit Langhantel': ['Barbell thruster', 'thruster:bb', 'qu,de;gl,ti', 'squat', 2, 'sk'],
  'Thruster mit Kettlebells': ['Kettlebell thruster', 'thruster:kb', 'qu,de;gl,ti', 'squat', 1, 'sk'],
  'Man Maker': ['Man maker', 'manmaker:db', 'ch,bk;de,qu,ti', 'squat', 2, 'sw'],
  'High Pull': ['Kettlebell high pull', 'highpull:kb', 'tr,de;gl,ha', 'delts', 1, 's'],
  'Sumo High Pull': ['Sumo high pull', 'highpull:kb', 'tr,de;gl,qu,ad', 'delts', 1, 's'],
  'Turkish Get-Up': ['Turkish get-up', 'getup', 'de,ab;gl,qu,tr', 'core', 2, 's'],
  'Kettlebell-Pass zwischen den Beinen': ['Kettlebell pass between legs', 'kbpass', 'ab,fo;gl', 'core', 0, ''],
  'Kettlebell-Figure-8': ['Kettlebell figure 8', 'kbpass', 'ab;fo,gl', 'core', 0, ''],
  'Kettlebell-Around-the-World': ['Kettlebell around the world', 'kbpass', 'ab,de;fo', 'core', 0, ''],
  'Kreuzheben mit Trap-Bar': ['Trap bar deadlift', '~deadlift:bb', 'qu,gl,ha;lb,tr,fo', 'hinge', 1, 'b'],
  'Farmer’s Walk': ['Farmer\'s walk', 'carry:db', 'fo,tr;ab,gl', 'core', 0, ''],
  'Suitcase Carry': ['Suitcase carry', 'carry:kb', 'ab,fo;tr,gl', 'core', 0, ''],
  'Rack Carry': ['Rack carry', 'carry:rack,kb', 'ab,de;fo,tr', 'core', 1, ''],
  'Bottoms-up Carry': ['Bottoms-up carry', 'carry:bottomsup,kb', 'fo,de;ab', 'core', 2, ''],
  'Battle Ropes': ['Battle ropes', 'ropes', 'de,fo;ab,qu', 'core', 1, ''],
  'Wall Balls': ['Wall ball', 'wallball', 'qu,de;gl,ti', 'squat', 1, 'k'],
  'Medizinball-Slams': ['Medicine ball slam', 'slam', 'ab,bk;de,gl', 'core', 0, ''],
  'Medizinball-Würfe': ['Medicine ball throw', 'throw', 'ch,de;ab,ti', 'push_h', 0, ''],
  'Sled Push': ['Sled push', 'sled:push', 'qu,gl;ca,ab', 'squat', 0, ''],
  'Sled Pull': ['Sled pull', 'sled:pull', 'ha,gl;bk,bi', 'hinge', 0, ''],
  'Sandsack-Training': ['Sandbag training', 'sandbag', 'gl,qu;bk,ab', 'squat', 1, 'b'],
  'Bear Crawl': ['Bear crawl', 'bear', 'de,ab;qu,ch', 'core', 0, 'w'],
  'Crab Walk': ['Crab walk', 'crab', 'ti,gl;ha,ab', 'glute', 0, 'w'],
  'Plyometrie: Box Jumps': ['Box jump', 'jump:box', 'qu,gl;ca', 'squat', 1, 'k'],
  'Plyometrie: Squat Jumps': ['Squat jump', 'jump', 'qu,gl;ca', 'squat', 0, 'k'],
  'Plyometrie: Broad Jumps': ['Broad jump', 'jump:broad', 'qu,gl;ha,ca', 'squat', 1, 'k'],
  // ---------------------------------------------------------------- Flexband-Ganzkörper (Rest)
  'Band-Chest-Press': ['Band chest press (standing)', 'bandpress', 'ch;ti,de', 'push_h', 0, ''],
  'Band-Bizeps-Curls': ['Band biceps curl', 'curl:band', 'bi;fo', 'arms', 0, ''],
  'Band-Glute-Bridge': ['Band glute bridge', 'glute:band', 'gl;ha', 'glute', 0, ''],
  'Band-Woodchopper': ['Band woodchopper', 'bandwood', 'ab;de,gl', 'core', 0, ''],
  'Band-Pallof-Press': '=pallof',
};

const TOKEN: Record<string, FineMuscle> = { ch: 'chest', bk: 'back', tr: 'traps', de: 'delts', bi: 'biceps', ti: 'triceps', fo: 'forearms', qu: 'quads', ha: 'hamstrings', gl: 'glutes', ca: 'calves', ab: 'abs', lb: 'lowback', hf: 'hipflex', ad: 'adductors' };
const parseMuscles = (s: string): { p: FineMuscle[]; s: FineMuscle[] } => {
  const [a, b = ''] = s.split(';');
  const list = (t: string) => t.split(',').filter(Boolean).map((x) => TOKEN[x]);
  const out = { p: list(a), s: list(b) };
  if ([...out.p, ...out.s].some((m) => !m)) throw new Error(`unknown muscle in ${s}`);
  return out;
};

export interface LibItem {
  key: string;
  de: string;
  en: string;
  /** movement spec (see exerciseLibraryMoves.ts), or "~existingKey:implement" to reuse the move of a catalogue exercise */
  move: string;
  groups: ListGroup[];
  need: ListGear[];
  any: ListGear[];
  body: boolean;
  /** main and secondary muscles as bit masks */
  p: number;
  s: number;
  pattern: Pattern;
  level: 0 | 1 | 2;
  avoid: ('knee' | 'back' | 'shoulder' | 'wrist')[];
  /** held position (counted in seconds) */
  hold: boolean;
  family: Family;
  mode: CountMode;
  note?: string;
}

/** Keys that would collide with an exercise the website already had. */
const KEY_OVERRIDE: Record<string, string> = { 'Glute Bridge': 'glute_bridge_both' };
const slug = (s: string): string => KEY_OVERRIDE[s] ?? s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/’/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const AVOID: Record<string, 'knee' | 'back' | 'shoulder' | 'wrist'> = { k: 'knee', b: 'back', s: 'shoulder', w: 'wrist' };

/** The exercises that are new to the website (the list entries without a "=existing" link). */
const HOLD_IDS = ['wallsit', 'hollow', 'lever', 'flag', 'planche', 'lsit', 'vsit', 'deadhang'];
/** Movements the wrist cannot follow (lying, machines for the legs, small moves): the person starts and ends the set. */
const ASSIST_IDS = ['hamstring', 'glute', 'calfraise', 'crunch', 'legraise', 'dragon', 'climbers', 'bear', 'crab', 'hyperext', 'superman', 'snowangel', 'abwheel', 'neckflex', 'neckband', 'neckmachine', 'hipflex', 'getup', 'hack', 'abmachine', 'cablecrunch', 'wristcurl', 'wristcable', 'twist', 'situp', 'legextband', 'pinch', 'wallball'];
const FAMILY_OF: Record<Pattern, Family> = { squat: 'squat', hinge: 'hinge', lunge: 'lunge', glute: 'glute', calf: 'calf', push_h: 'push_h', push_v: 'push_v', pull_h: 'pull_h', pull_v: 'pull_v', delts: 'delts', arms: 'curl', core: 'core' };
const COARSE_OF: Record<FineMuscle, CoarseMuscle> = { chest: 'chest', back: 'back', traps: 'back', delts: 'shoulders', biceps: 'biceps', triceps: 'triceps', forearms: 'biceps', quads: 'quads', hamstrings: 'hamstrings', glutes: 'glutes', calves: 'calves', abs: 'core', lowback: 'back', hipflex: 'core', adductors: 'quads' };

export const LIBRARY: LibItem[] = [];
/** Muscle groups added to exercises the website already had. */
export const GROUPS_OF_EXISTING: Record<string, ListGroup[]> = {};
/** Existing exercise key for every list entry that is linked. */
export const LINKED: Record<string, string> = {};

for (const e of EXERCISE_LIST as ListEntry[]) {
  const def = DEFS[e.name];
  if (!def) throw new Error(`no definition for ${e.name}`);
  if (typeof def === 'string') {
    const key = def.slice(1);
    LINKED[e.name] = key;
    GROUPS_OF_EXISTING[key] = [...new Set([...(GROUPS_OF_EXISTING[key] ?? []), ...e.groups])];
    continue;
  }
  const [en, move, mus, pattern, level, avoid] = def;
  const m = parseMuscles(mus);
  const arch = move.replace('~', '').split(':')[0];
  const hold = HOLD_IDS.includes(arch) || (arch === 'handstand' && !move.includes('push'));
  const family: Family = arch === 'pushupvar' ? 'pushup' : pattern === 'arms' ? (m.p.includes('triceps') ? 'triceps' : 'curl') : FAMILY_OF[pattern];
  const mode: CountMode = hold ? 'time' : ASSIST_IDS.includes(arch) ? 'assist' : 'auto';
  LIBRARY.push({
    key: slug(e.name), de: e.name, en, move, groups: e.groups, need: e.need, any: e.any, body: e.body,
    p: maskOf(m.p), s: maskOf(m.s) & ~maskOf(m.p), pattern, level, avoid: avoid.split('').map((c) => AVOID[c]), hold, family, mode, ...(e.note ? { note: e.note } : {}),
  });
}
// the muscles of the figure and the chips on the website know the library exercises
for (const x of LIBRARY) {
  FINE_OWN[x.key] = { p: x.p, s: x.s };
  const fine = MUSCLE_IDS.filter((id) => (x.p & bitOf(id)) !== 0).concat(MUSCLE_IDS.filter((id) => (x.s & bitOf(id)) !== 0));
  MUSCLES_OWN[x.key] = [...new Set(fine.map((f) => COARSE_OF[f]))];
}

/** Names in the definitions that are not in the list (a typo). */
export const UNUSED_DEFS: string[] = Object.keys(DEFS).filter((n) => !EXERCISE_LIST.some((e) => e.name === n));
