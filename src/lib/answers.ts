// Defaults + normalisation of questionnaire answers (older saves used a single
// "strength" block; plans created with them must keep working).

import type { DayTemplate, Equipment, ExtraSession, OnboardingAnswers, StrengthFocus, Weekday } from './types';
import { addDays, todayISO, weekdayOf } from './planner/dates';

export function defaultAnswers(): OnboardingAnswers {
  const in18 = addDays(todayISO(), 18 * 7);
  const sunday = addDays(in18, 6 - weekdayOf(in18));
  return {
    raceName: '',
    raceDate: sunday,
    goalType: 'finish',
    goalTimeS: null,
    raceTerrain: 'flat',
    level: 'intermediate',
    yearsRunning: 2,
    marathonsCompleted: 0,
    recentRace: null,
    currentWeeklyKm: 25,
    longestRecentRunKm: 12,
    scheduleMode: 'auto',
    customWeek: null,
    runDaysPerWeek: 4,
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    longRunDay: 6,
    weekdayMaxMinutes: null,
    extras: [
      { id: 'lower', type: 'lower', perWeek: 1 },
      { id: 'upper', type: 'upper', perWeek: 1 },
    ],
    equipment: 'bodyweight',
    age: null,
    sex: null,
    maxHr: null,
    injuryProne: false,
    injuries: '',
    approach: 'balanced',
    units: 'km',
  };
}

type Legacy = Partial<OnboardingAnswers> & {
  strength?: { enabled: boolean; focus: StrengthFocus; perWeek: number; equipment: Equipment };
};

/** Days the user marked as running days in a custom week. */
export function templateRunDays(week: DayTemplate[]): Weekday[] {
  return week.flatMap((d, i) => (d.run !== 'rest' ? [i as Weekday] : []));
}

export function normalizeAnswers(raw: Legacy | null | undefined): OnboardingAnswers {
  const a = { ...defaultAnswers(), ...(raw ?? {}) } as OnboardingAnswers & Legacy;
  if (raw && !raw.extras && raw.strength) {
    const s = raw.strength;
    const extras: ExtraSession[] = !s.enabled
      ? []
      : s.focus === 'upper_lower'
        ? [
            { id: 'lower', type: 'lower', perWeek: Math.max(1, Math.floor(s.perWeek / 2)) },
            { id: 'upper', type: 'upper', perWeek: Math.max(1, Math.ceil(s.perWeek / 2)) },
          ]
        : [{ id: s.focus, type: s.focus, perWeek: s.perWeek }];
    a.extras = extras;
    a.equipment = s.equipment;
  }
  delete a.strength;

  if (a.scheduleMode === 'custom' && a.customWeek?.length === 7) {
    const runDays = templateRunDays(a.customWeek);
    const long = a.customWeek.findIndex((d) => d.run === 'long');
    a.availableDays = runDays;
    a.runDaysPerWeek = runDays.length;
    if (long >= 0) a.longRunDay = long as Weekday;
    // Keep the per-week counts in sync with what is placed on the days.
    a.extras = a.extras.map((e) => ({ ...e, perWeek: a.customWeek!.filter((d) => d.extras.includes(e.id)).length || e.perWeek }));
  } else {
    a.scheduleMode = 'auto';
    a.customWeek = null;
  }
  return a;
}

/** Problems that make a custom week unusable, plus softer coaching warnings. */
export function checkTemplate(week: DayTemplate[], extras: ExtraSession[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const longs = week.filter((d) => d.run === 'long').length;
  const runs = templateRunDays(week).length;
  const quality = week.flatMap((d, i) => (d.run === 'quality' ? [i] : []));
  const longDay = week.findIndex((d) => d.run === 'long');
  if (longs !== 1) errors.push('Pick exactly one long-run day.');
  if (runs < 3) errors.push('Marathon training needs at least 3 running days per week.');
  if (quality.length > 3) errors.push('Use at most 3 interval/tempo days per week.');
  const legsExtra = new Set(extras.filter((e) => e.type === 'lower' || e.type === 'full' || e.type === 'plyo' || (e.type === 'custom' && e.hard)).map((e) => e.id));
  if (longDay >= 0) {
    const before = (longDay + 6) % 7;
    if (week[before].run === 'quality') warnings.push('An interval/tempo day right before the long run makes the long run much harder.');
    if (week[before].extras.some((id) => legsExtra.has(id))) warnings.push('Leg training the day before the long run will leave your legs tired.');
    if (week[longDay].extras.some((id) => legsExtra.has(id))) warnings.push('Leg training on the long-run day is not recommended.');
  }
  for (let i = 0; i < quality.length; i++)
    for (let j = i + 1; j < quality.length; j++)
      if (Math.abs(quality[i] - quality[j]) === 1 || Math.abs(quality[i] - quality[j]) === 6)
        warnings.push('Two hard run days back to back – an easy day in between helps you absorb them.');
  return { errors, warnings: [...new Set(warnings)] };
}
