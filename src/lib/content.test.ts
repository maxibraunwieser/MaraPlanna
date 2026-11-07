import { describe, expect, it } from 'vitest';
import { ENGLISH_MARKERS, exerciseName, KNOWN_EXERCISES, messageText, noteText, reasonText, repsText, stepLabel, workoutTitle } from '../../supabase/functions/_shared/content';
import { EXERCISES, normalizePrefs } from '../../supabase/functions/_shared/strength';
import { normalizeAnswers } from './answers';
import { applyGoal } from './onboarding/derive';
import { assessFitness } from './planner/fitness';
import { buildPlan } from './planner/generate';
import { GOAL_KINDS } from './planner/goals';
import { extraSession } from './planner/extras';
import { CATALOG, suggestAll, setupSignature, type Setup } from './strengthPlan';
import type { ExtraSession, ExtraType, OnboardingAnswers, Step } from './types';

const TODAY = '2026-11-06';

// Words that are English only. (Loanwords the German app keeps - "Face Pull", "Dead Bug", "Hip Thrust", "Pallof Press" - are not here.)
const MARKERS = new Set(ENGLISH_MARKERS.filter((w) => !['plan', 'tempo', 'rest', 'press', 'row', 'curl', 'raise', 'raises', 'hold', 'side', 'light', 'set', 'stretch', 'interval', 'recovery', 'fast', 'hops', 'ride', 'swim', 'body'].includes(w)));
const leaks = (text: string) => (text.toLowerCase().match(/[a-zäöüß][a-zäöüß'-]*/g) ?? []).filter((w) => MARKERS.has(w));

function plans(): { answers: OnboardingAnswers; plan: ReturnType<typeof buildPlan> }[] {
  const out: { answers: OnboardingAnswers; plan: ReturnType<typeof buildPlan> }[] = [];
  const allExtras: ExtraSession[] = (['lower', 'upper', 'full', 'core', 'mobility', 'plyo', 'bike', 'swim'] as ExtraType[]).map((t) => ({ id: t, type: t, perWeek: 1 }));
  allExtras.push({ id: 'custom-1', type: 'custom', name: 'Climbing', perWeek: 1, hard: true, minutes: 60 });
  for (const goal of GOAL_KINDS) {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      for (const equipment of ['gym', 'dumbbells', 'bodyweight'] as const) {
        const base = normalizeAnswers({ level, equipment, runDaysPerWeek: level === 'beginner' ? 3 : 5, currentWeeklyKm: 25, longestRecentRunKm: 12, extras: allExtras, raceName: 'City Marathon', injuryProne: level === 'beginner' });
        const a = applyGoal(base, { goal, distanceM: goal === 'faster' ? 10_000 : null, date: ['hybrid', 'fitness', 'comeback'].includes(goal) ? null : '2027-03-14', weeks: ['hybrid', 'fitness', 'comeback'].includes(goal) ? 12 : null, mode: 'time', timeS: goal === 'marathon' ? 3 * 3600 : 3600 }, TODAY);
        const setup: Setup = { equipment: equipment === 'gym' ? 'free' : equipment === 'dumbbells' ? 'free' : 'bodyweight', gear: equipment === 'gym' ? ['barbell', 'rack', 'dumbbell', 'bench', 'pullup'] : equipment === 'dumbbells' ? ['dumbbell'] : [], avoid: [], goal: 'running', level: 'some', minutes: 45 };
        void setupSignature(setup);
        const routines = suggestAll(['lower', 'upper', 'full'], setup, [], TODAY);
        out.push({ answers: a, plan: buildPlan(a, assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY, level === 'advanced' ? routines : undefined) });
      }
    }
  }
  return out;
}

describe('plan content in German', () => {
  const all = plans();
  const titles = new Set<string>();
  const labels = new Set<string>();
  const exercises = new Set<string>();
  const reps = new Set<string>();
  const notes = new Set<string>();
  const warnings = new Set<string>();
  for (const { plan } of all) {
    plan.warnings.forEach((w) => warnings.add(w));
    for (const w of plan.workouts) {
      titles.add(w.title);
      for (const s of w.steps as Step[]) {
        if (s.type === 'run') labels.add(s.label);
        else {
          exercises.add(s.name);
          reps.add(s.reps);
          if (s.note) notes.add(s.note);
        }
      }
    }
  }

  it('generated enough variety to mean something', () => {
    expect(all.length).toBeGreaterThan(50);
    expect(titles.size).toBeGreaterThan(25);
    expect(exercises.size).toBeGreaterThan(40);
    expect(warnings.size).toBeGreaterThan(1);
  });

  it('every title is translated, with no English left', () => {
    for (const t of titles) {
      const de = workoutTitle(t, 'de');
      if (t === 'Climbing') continue; // the person's own name
      expect(leaks(de), `${t} -> ${de}`).toEqual([]);
      if (/[A-Za-z]{3}/.test(t.replace(/Marathon|Climbing|City|km|min/g, ''))) expect(de, t).not.toBe(t);
      expect(workoutTitle(t, 'en')).toBe(t);
    }
  });

  it('every step label is translated', () => {
    for (const l of labels) {
      const de = stepLabel(l, 'de');
      expect(leaks(de), `${l} -> ${de}`).toEqual([]);
      if (!/^\d/.test(l)) expect(de, l).not.toBe(l === 'Marathon' || l === 'Interval' || l === 'Threshold' ? 'x' : l === 'Marathon' ? l : l);
    }
    expect(stepLabel('Warm-up', 'de')).toBe('Einlaufen');
    expect(stepLabel('Warm-up', 'en')).toBe('Warm-up');
  });

  it('every exercise name has a German name (or is a loanword kept on purpose)', () => {
    const keep = new Set(['Climbing', 'Dips', 'Marathon']);
    for (const n of exercises) {
      const de = exerciseName(n, 'de');
      expect(leaks(de), `${n} -> ${de}`).toEqual([]);
      expect(KNOWN_EXERCISES.includes(n) || keep.has(n), `no German name for "${n}"`).toBe(true);
    }
  });

  it('the catalogue and the watch library have German names too', () => {
    for (const x of CATALOG) expect(KNOWN_EXERCISES, `catalogue: ${x.name}`).toContain(x.name);
    for (const x of EXERCISES) expect(KNOWN_EXERCISES.includes(x.en) || x.de !== undefined, `library: ${x.en}`).toBe(true);
  });

  it('repetitions and notes are translated', () => {
    for (const r of reps) expect(leaks(repsText(r, 'de')), r).toEqual([]);
    expect(repsText('10 / side', 'de')).toBe('10 / Seite');
    expect(repsText('8 / leg', 'de')).toBe('8 / Bein');
    for (const n of notes) {
      const de = noteText(n, 'de');
      expect(leaks(de), `${n} -> ${de}`).toEqual([]);
      expect(de, n).not.toBe(n);
    }
  });

  it('warnings are translated', () => {
    for (const w of warnings) {
      const de = messageText(w, 'de');
      expect(leaks(de), `${w} -> ${de}`).toEqual([]);
      expect(de, w).not.toBe(w);
    }
  });

  it('every kind of extra session is translated', () => {
    for (const type of ['lower', 'upper', 'full', 'core', 'mobility', 'plyo', 'bike', 'swim'] as ExtraType[]) {
      for (const phase of ['base', 'build', 'peak', 'taper'] as const) {
        for (const eq of ['gym', 'dumbbells', 'bodyweight'] as const) {
          const s = extraSession({ id: type, type, perWeek: 1 }, phase, phase === 'taper', eq);
          expect(leaks(workoutTitle(s.title, 'de')), s.title).toEqual([]);
          for (const st of s.steps) if (st.type === 'exercise') expect(leaks(exerciseName(st.name, 'de')), st.name).toEqual([]);
        }
      }
    }
  });
});

describe('messages the planner stores', () => {
  const samples: [string, RegExp][] = [
    ['Plan created: 16 weeks to City Marathon.', /^Plan erstellt: 16 Wochen bis City Marathon\.$/],
    ['Plan created: 16 weeks to race day.', /bis zum Wettkampftag/],
    ['Plan created: 12 weeks.', /^Plan erstellt: 12 Wochen\.$/],
    ['No runs logged for 12 days. The plan restarts gently at about 22 km/week and paces were eased.', /Seit 12 Tagen kein Lauf.*22 km\/Woche und die Tempi/],
    ['No runs logged for 12 days. The plan restarts gently at about 22 km/week.', /22 km\/Woche\.$/],
    ['You ran 20 of 41 planned km in the last 2 weeks. Upcoming weeks were rebuilt from your current level (~24 km/week).', /Du bist 20 von 41 geplanten km/],
    ['Your recent runs suggest your fitness improved (VDOT 41.5 → 42.3). Training paces were updated.', /gestiegen ist \(VDOT 41,5 → 42,3\)/],
    ['Your recent runs suggest your fitness dipped (VDOT 42.3 → 41.1). Training paces were updated.', /gesunken/],
    ['Missed "Intervals 5 × 800 m" on Tuesday – moved to today in place of an easy run.', /„Intervalle 5 × 800 m“ am Dienstag verpasst – verschoben auf heute anstelle eines lockeren Laufs\./],
    ['Missed "Long run" on Sunday – moved to Wednesday.', /„Langer Lauf“ am Sonntag verpasst – verschoben auf Mittwoch\./],
    ['Missed "Threshold 3 × 2 km" on Thursday. It was not squeezed in so you stay fresh for the next key session.', /am Donnerstag verpasst\. Er wurde nicht noch eingeschoben/],
    ['Replaced by your rescheduled Tempo run 8 km', /Ersetzt durch deine verschobene Einheit: Tempolauf 8 km/],
    ['Low readiness: "Intervals 6 × 1 km" moved to Friday, easy run today instead.', /Geringe Bereitschaft: „Intervalle 6 × 1 km“ auf Freitag verschoben/],
    ['Plan rebuilt from 2026-11-09 at your coach\'s suggestion (about 30 km/week to start).', /Plan ab 2026-11-09 auf Vorschlag deines Coachs/],
    ['With 9 weeks your longest run reaches 28 km instead of the ideal 32 km – building the long run faster would raise injury risk.', /Mit 9 Wochen erreicht dein längster Lauf 28 km statt der idealen 32 km/],
    ['Your longest runs (35 km) will take about 3.6 h. Short walk breaks are fine – practise fuelling (60–90 g carbs per hour) on them.', /3,6 Std\./],
    ['Only 6 weeks until race day – the plan focuses on arriving healthy rather than building a lot of new fitness.', /Nur noch 6 Wochen/],
  ];

  it.each(samples)('"%s" in German', (en, expected) => {
    const de = messageText(en, 'de');
    expect(de).toMatch(expected);
    expect(messageText(en, 'en')).toBe(en);
  });

  it('reasons in the fitness history', () => {
    expect(reasonText('Plan created', 'de')).toBe('Plan erstellt');
    expect(reasonText('Recent runs slower at same effort', 'en')).toBe('Recent runs slower at same effort');
  });

  it('unknown texts stay as they are (a name the person chose)', () => {
    expect(workoutTitle('My own session', 'de')).toBe('My own session');
    expect(noteText('felt strong', 'de')).toBe('felt strong');
    expect(exerciseName('Rope jumping', 'de')).toBe('Rope jumping');
  });
});

void normalizePrefs;
