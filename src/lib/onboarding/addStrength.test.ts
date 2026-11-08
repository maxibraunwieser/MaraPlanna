import { describe, expect, it } from 'vitest';
import { normalizeAnswers } from '../answers';
import { assessFitness } from '../planner/fitness';
import { buildPlan } from '../planner/generate';
import { messageText } from '../../../supabase/functions/_shared/content';
import { applyStrengthPlan, settle } from './apply';
import { finalize } from './finalize';
import { editStart, strengthStart } from './seed';
import { firstOfBlock, nextScreen, visibleBlocks, visibleScreens } from './screens';
import type { Profile } from '../types';

const TODAY = '2026-11-06';
const NOW = '2026-11-06T10:00:00Z';
const profile = (onboarding: unknown): Profile => ({ id: 'u', display_name: 'Ana', units: 'km', onboarding, onboarding_completed_at: NOW, strength: null }) as unknown as Profile;
const assess = (a: Parameters<typeof assessFitness>[0]['answers']) => assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today: TODAY });
const isStrength = (kind: string) => kind.startsWith('strength') || kind === 'core';
const runsOf = (plan: ReturnType<typeof buildPlan>) => plan.workouts.filter((w) => !isStrength(w.kind)).map((w) => `${w.date}|${w.kind}|${w.distance_km}|${w.duration_min}|${w.title}`);

const SCENARIOS: Record<string, Record<string, unknown>> = {
  'marathon, 4 runs': { raceName: 'Vienna', raceDate: '2027-04-18', level: 'intermediate', sex: 'female', runDaysPerWeek: 4, extras: [] },
  'marathon, 5 runs': { raceName: 'Berlin', raceDate: '2027-05-30', level: 'advanced', sex: 'male', runDaysPerWeek: 5, extras: [] },
  'half marathon, 3 runs': { raceName: 'Graz', raceDate: '2027-03-14', level: 'beginner', sex: 'female', runDaysPerWeek: 3, raceDistanceM: 21_097, goal: 'half', extras: [] },
  'no race, 3 runs': { goal: 'fitness', planWeeks: 12, level: 'beginner', sex: 'male', runDaysPerWeek: 3, extras: [] },
};

describe('adding strength to a plan that has only running', () => {
  for (const [name, saved] of Object.entries(SCENARIOS)) {
    it(`${name}: the strength questions open, and the runs of the plan do not change`, () => {
      const p = profile(normalizeAnswers(saved));
      const before = editStart(p, null, TODAY);
      const f0 = finalize(before.answers, before.strength, TODAY, NOW);
      const old = buildPlan(f0.answers, assess(f0.answers), TODAY, f0.prefs?.routines);
      expect(old.workouts.some((w) => isStrength(w.kind))).toBe(false);

      // the strength questions are reachable and start with the strength block
      const start = strengthStart(p, null, TODAY);
      const ctx = { a: start.answers, strength: start.strength };
      expect(start.answers.setup!.runPct).toBeLessThan(100);
      expect(start.strength.perWeek).toBeNull();
      expect(firstOfBlock('strength', ctx)).toBe('strExperience');
      expect(nextScreen('strengthPlan', ctx)).toBe('preview');

      // with a running plan in place the questions about running are not asked, the strength ones are
      const keep = { ...ctx, keepRuns: true };
      const ids = visibleScreens(keep).map((x) => x.id);
      for (const run of ['race', 'raceDetails', 'raceTime', 'planLength', 'runExperience', 'runVolume', 'runReference', 'runHeart', 'runDays', 'runPlan'] as const) expect(ids).not.toContain(run);
      for (const str of ['strExperience', 'strWhere', 'strEquipment', 'strFrequency', 'strengthPlan'] as const) expect(ids).toContain(str);
      expect(visibleBlocks(keep)).not.toContain('running');
      expect(visibleBlocks(keep)).toContain('strength');

      const m = applyStrengthPlan(settle({ a: start.answers, strength: start.strength }, TODAY));
      const f1 = finalize(m.a, m.strength, TODAY, NOW);
      const next = buildPlan(f1.answers, assess(f1.answers), TODAY, f1.prefs?.routines);
      expect(next.workouts.filter((w) => isStrength(w.kind)).length).toBeGreaterThan(0);
      expect(runsOf(next)).toEqual(runsOf(old));
    });
  }

  it('the plan message is translated', () => {
    expect(messageText('Strength added: 2 per week. Your running plan stays as it is.', 'de')).toBe('Kraft hinzugefügt: 2 pro Woche. Dein Laufplan bleibt unverändert.');
  });
});
