import { describe, expect, it } from 'vitest';
import { EXERCISE_LIST } from '../../supabase/functions/_shared/exerciseListData';
import { LIBRARY, LINKED, UNUSED_DEFS } from '../../supabase/functions/_shared/exerciseLibrary';
import { exerciseName } from '../../supabase/functions/_shared/content';
import { EXERCISES, WATCH_GROUPS, libraryIdOf, libraryRows, normalizePrefs } from '../../supabase/functions/_shared/strength';
import { CATALOG, available, type Setup } from './strengthPlan';
import { LIST_GROUPS, gearsOf, library, needsNoGear } from './exerciseInfo';

const setup = (over: Partial<Setup> = {}): Setup => ({ equipment: null, gear: [], avoid: [], goal: null, level: 'experienced', minutes: 60, ...over });
const keys = (l: ReturnType<typeof library>) => [...l.same, ...l.others.flatMap((g) => g.items)].map((x) => x.key);

describe('the exercise library of the list', () => {
  it('has a definition for every exercise of the list and none for a name that is not in it', () => {
    expect(UNUSED_DEFS).toEqual([]);
    expect(EXERCISE_LIST.length).toBe(279);
    expect(LIBRARY.length + Object.keys(LINKED).length).toBe(EXERCISE_LIST.length);
  });

  it('links to exercises the website has, and every linked key exists', () => {
    for (const key of Object.values(LINKED)) expect(CATALOG.some((x) => x.key === key), key).toBe(true);
  });

  it('every exercise has a muscle group, a watch entry and a German name', () => {
    expect(CATALOG.filter((x) => x.groups.length === 0).map((x) => x.key)).toEqual([]);
    for (const x of LIBRARY) {
      const lib = EXERCISES.find((e) => e.id === libraryIdOf(CATALOG.find((c) => c.key === x.key)!));
      expect(lib, x.key).toBeDefined();
      expect(exerciseName(x.en, 'de'), x.key).toBe(x.de);
      expect(x.p, x.key).not.toBe(0);
    }
    for (const g of LIST_GROUPS) expect(CATALOG.some((x) => x.groups.includes(g)), g).toBe(true);
  });

  it('held positions are counted in seconds, the plan never picks the library by itself', () => {
    expect(EXERCISES.find((e) => e.id === 'wall_sit')?.count).toBe('time');
    expect(EXERCISES.find((e) => e.id === 'dead_hang')?.count).toBe('time');
    expect(LIBRARY.every((x) => CATALOG.find((c) => c.key === x.key)?.plan === false)).toBe(true);
  });
});

describe('gear: what is needed and what is an alternative', () => {
  const bench = CATALOG.find((x) => x.key === 'bankdruecken_schraeg')!;
  const lat = CATALOG.find((x) => x.key === 'latzug_untergriff')!;
  const bulg = CATALOG.find((x) => x.key === 'bulgarian')!;
  const squat = CATALOG.find((x) => x.key === 'front_squat')!;
  const smith = CATALOG.find((x) => x.key === 'smith_maschine_kniebeuge')!;

  it('a bench press needs both the barbell and the bench', () => {
    expect(available(bench, setup({ gear: ['barbell'] }))).toBe(false);
    expect(available(bench, setup({ gear: ['bench'] }))).toBe(false);
    expect(available(bench, setup({ gear: ['barbell', 'bench'] }))).toBe(true);
  });

  it('a cable or a machine is enough for a pulldown, and either of two weights for a squat', () => {
    expect(available(lat, setup({ gear: ['cable'] }))).toBe(true);
    expect(available(lat, setup({ gear: ['machines'] }))).toBe(true);
    expect(available(lat, setup({ gear: ['dumbbell'] }))).toBe(false);
    expect(available(squat, setup({ gear: ['barbell'] }))).toBe(true);
    expect(available(smith, setup({ gear: ['smith'] }))).toBe(true);
    expect(available(smith, setup({ gear: ['barbell'] }))).toBe(false);
  });

  it('exercises that work without gear are always possible', () => {
    const russian = CATALOG.find((x) => x.key === 'russian_twist')!;
    expect(needsNoGear(russian)).toBe(true);
    expect(gearsOf(russian)).toContain('medball');
    expect(available(russian, setup({ gear: [] }))).toBe(true);
    expect(available(bulg, setup({ gear: ['dumbbell'] }))).toBe(false);
  });
});

describe('the filters of the list', () => {
  const all = setup({ gear: ['barbell', 'dumbbell', 'bench', 'rack', 'pullup', 'cable', 'machines', 'kettlebell', 'bands', 'ez', 'smith', 'parallel', 'medball', 'plate', 'sandbag', 'sled', 'abwheel', 'anchor', 'table', 'post'] });

  it('filters by muscle group', () => {
    const chest = keys(library(all, { focus: [], group: 'chest' }));
    expect(chest.length).toBeGreaterThan(20);
    expect(chest).toContain('bench_press');
    expect(chest).toContain('butterfly');
    expect(chest).not.toContain('back_squat');
    for (const k of chest) expect(CATALOG.find((x) => x.key === k)!.groups).toContain('chest');
    expect(keys(library(all, { focus: [], group: 'bandfull' })).length).toBeGreaterThanOrEqual(10);
  });

  it('filters by the gear of the legend, or by no gear', () => {
    const kb = keys(library(all, { focus: [], gear: 'kettlebell' }));
    expect(kb.length).toBeGreaterThan(30);
    for (const k of kb) expect(gearsOf(CATALOG.find((x) => x.key === k)!)).toContain('kettlebell');
    const none = keys(library(all, { focus: [], gear: 'none' }));
    expect(none).toContain('push_up');
    expect(none).toContain('plank');
    expect(none).not.toContain('bench_press');
  });

  it('the two filters work together', () => {
    const both = keys(library(all, { focus: [], group: 'shoulders', gear: 'kettlebell' }));
    expect(both).toContain('kniender_press');
    expect(both).not.toContain('seitheben_am_kabel');
    expect(both).not.toContain('bench_press');
  });

  it('shows only what the person can do', () => {
    const body = keys(library(setup({ equipment: 'bodyweight', gear: [] }), { focus: [] }));
    expect(body).toContain('crunches');
    expect(body).not.toContain('bankdruecken_schraeg');
  });
});

describe('the exercise lists of the watch', () => {
  const prefs = (gear: string[], equipment = 'mixed') => normalizePrefs({ wrist: 'left', equipment, gear, exercises: ['squat'], savedAt: '2026-11-07T08:00:00Z' });

  it('lists the exercises of a muscle group the person can do, ready for free training', () => {
    const rows = libraryRows(prefs(['barbell', 'bench', 'dumbbell']), 'chest');
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.map((r) => r.a)).toContain('bench_press');
    expect(rows.map((r) => r.a)).not.toContain('butterfly');
    for (const r of rows) {
      expect(r.n.length, r.i).toBeLessThanOrEqual(40);
      expect([0, 1, 2]).toContain(r.m);
      expect(r.s).toBeGreaterThan(0);
    }
    expect(JSON.stringify(rows).length).toBeLessThan(6000);
  });

  it('every group stays small enough for the memory of the watch, with every exercise available', () => {
    const everything = prefs(['barbell', 'dumbbell', 'bench', 'rack', 'pullup', 'cable', 'machines', 'kettlebell', 'bands', 'ez', 'smith', 'parallel', 'medball', 'plate', 'sandbag', 'sled', 'abwheel', 'anchor', 'table', 'post']);
    for (const g of WATCH_GROUPS) {
      const rows = libraryRows(everything, g);
      expect(rows.length, g).toBeGreaterThan(4);
      expect(JSON.stringify(rows).length, g).toBeLessThan(8000);
    }
  });

  it('holds are timed, and a group the watch does not know is empty', () => {
    const rows = libraryRows(prefs([]), 'quads');
    expect(rows.find((r) => r.i === 'wall_sit')).toMatchObject({ m: 2, r: 0 });
    expect(libraryRows(prefs([]), 'nonsense')).toEqual([]);
  });
});
