// The Strength page in both languages: every label table, exercise name and number format has a German counterpart.

import { afterEach, describe, expect, it } from 'vitest';
import { EXERCISES } from '../../supabase/functions/_shared/strength';
import { KNOWN_EXERCISES } from '../../supabase/functions/_shared/content';
import { setActiveLang } from './i18n';
import { CATALOG, GEAR_LABEL, GOALS, KINDS, LEVELS, LIMITATION_LABEL, PATTERN_LABEL, STRENGTH_TYPES, TYPE_LABEL, suggestRoutine } from './strengthPlan';
import { exName, repsLabel, rxText, weightInput, weightText } from './strengthFormat';
import { exerciseLabel, exerciseProgress, progressionHint } from './strengthStats';
import { heightText } from './onboarding/units';

afterEach(() => setActiveLang('en'));

const tables = () => [
  ...Object.values(PATTERN_LABEL),
  ...Object.values(TYPE_LABEL),
  ...Object.values(GEAR_LABEL),
  ...Object.values(LIMITATION_LABEL),
  ...[...GOALS, ...LEVELS, ...KINDS].flatMap((o) => [o.label, o.hint]),
];

describe('labels follow the language', () => {
  it('every label resolves in English and in German (no key shows through)', () => {
    for (const lang of ['en', 'de'] as const) {
      setActiveLang(lang);
      for (const text of tables()) {
        expect(text, lang).toBeTruthy();
        expect(text, lang).not.toMatch(/^sg\./);
      }
    }
  });

  it('German differs from English for the main tables', () => {
    setActiveLang('en');
    const en = [TYPE_LABEL.lower, GOALS[0].label, GEAR_LABEL.dumbbell, PATTERN_LABEL.squat];
    setActiveLang('de');
    const de = [TYPE_LABEL.lower, GOALS[0].label, GEAR_LABEL.dumbbell, PATTERN_LABEL.squat];
    expect(de.map((x, i) => x !== en[i])).toEqual([true, true, true, true]);
    expect(TYPE_LABEL.upper).toBe('Oberkörper');
  });
});

describe('exercise names', () => {
  it('the catalogue and the watch library are known to the German name table', () => {
    const names = [...CATALOG.map((x) => x.name), ...EXERCISES.map((x) => x.en)];
    expect(names.filter((n) => !KNOWN_EXERCISES.includes(n))).toEqual([]);
  });

  it('suggested workouts show German names, typed names stay as typed', () => {
    setActiveLang('de');
    for (const type of STRENGTH_TYPES) {
      const routine = suggestRoutine(type, { equipment: 'mixed', gear: ['barbell', 'dumbbell', 'bench', 'rack', 'pullup', 'cable', 'machines', 'bands'], avoid: [], goal: 'strong', level: 'experienced', minutes: 75 });
      for (const x of routine.exercises) expect(exName(x.name), x.name).toBeTruthy();
    }
    expect(exName('Back squat')).toBe('Kniebeuge (Langhantel)');
    expect(exName('My own thing')).toBe('My own thing');
    expect(exName(exerciseLabel({ exercise_id: null, exercise_name: null }))).toBe('Übung');
  });
});

describe('numbers and repetitions', () => {
  it('weights use the decimal comma in German', () => {
    expect(weightText(62.5, 'kg')).toBe('62.5 kg');
    expect(weightInput(80, 'kg')).toBe('80');
    setActiveLang('de');
    expect(weightText(62.5, 'kg')).toBe('62,5 kg');
    expect(weightInput(62.5, 'kg')).toBe('62,5');
    expect(rxText({ sets: 4, reps: '5', kg: 62.5 }, 'kg')).toBe('4 × 5 · 62,5 kg');
  });

  it('the height uses the decimal comma in German', () => {
    expect(heightText(178, 'm')).toBe('1.78 m');
    expect(heightText(178, 'ft')).toBe('5′ 10″');
    setActiveLang('de');
    expect(heightText(178, 'm')).toBe('1,78 m');
  });

  it('repetition texts are translated', () => {
    expect(repsLabel('10 / side')).toBe('10 / side');
    setActiveLang('de');
    expect(repsLabel('10 / side')).toBe('10 / Seite');
    expect(repsLabel('8 each')).toBe('8 je');
    expect(repsLabel('12–15')).toBe('12–15');
    for (const x of CATALOG) expect(repsLabel(x.reps ?? ''), x.key).not.toMatch(/side|each/);
  });

  it('the progression hint speaks the language of the page', () => {
    const rows = [0, 1].map((idx) => ({ session_key: 's1', idx, local_date: '2026-11-01', exercise_id: null, exercise_name: 'Squat', reps: 5, weight_kg: 60 }));
    const last = exerciseProgress(rows, 'squat').at(-1);
    expect(progressionHint(last, '5')?.reason).toBe('all sets reached 5 reps last time');
    setActiveLang('de');
    expect(progressionHint(last, '5')?.reason).toBe('letztes Mal haben alle Sätze 5 Wiederholungen erreicht');
  });
});
