import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { OnboardingAnswers, Weekday } from '../lib/types';
import { addDays, daysBetween, todayISO, weekdayOf } from '../lib/planner/dates';
import { fmtDuration, fromUnit, parseTime, toUnit } from '../lib/format';
import { saveOnboarding } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { CenteredPage } from '../components/Layout';
import { Button, Card, cx, Field, Input, Notice, Segmented, Select, Textarea, Toggle } from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const RACE_DISTANCES = [
  { m: 5000, label: '5K' },
  { m: 10000, label: '10K' },
  { m: 21097, label: 'Half marathon' },
  { m: 42195, label: 'Marathon' },
];

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
    runDaysPerWeek: 4,
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    longRunDay: 6,
    weekdayMaxMinutes: null,
    strength: { enabled: true, focus: 'upper_lower', perWeek: 2, equipment: 'bodyweight' },
    age: null,
    sex: null,
    maxHr: null,
    injuryProne: false,
    injuries: '',
    approach: 'balanced',
    units: 'km',
  };
}

export function Onboarding() {
  const { user } = useAuth();
  const { profile, reload } = useData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = !!profile?.onboarding_completed_at || params.get('edit') === '1';
  const [a, setA] = useState<OnboardingAnswers>(() => ({ ...defaultAnswers(), ...(profile?.onboarding ?? {}) }));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalText, setGoalText] = useState(a.goalTimeS ? fmtDuration(a.goalTimeS) : '');
  const [raceTimeText, setRaceTimeText] = useState(a.recentRace ? fmtDuration(a.recentRace.timeS) : '');
  const set = <K extends keyof OnboardingAnswers>(k: K, v: OnboardingAnswers[K]) => setA((p) => ({ ...p, [k]: v }));
  const today = todayISO();
  const weeks = Math.floor(daysBetween(today, a.raceDate) / 7);
  const u = a.units;

  const steps: { title: string; subtitle: string; body: ReactNode; validate: () => string | null }[] = [
    {
      title: 'Your marathon',
      subtitle: 'Which race are we training for?',
      validate: () => {
        if (daysBetween(today, a.raceDate) < 14) return 'Pick a race at least two weeks from today.';
        if (a.goalType === 'time' && !a.goalTimeS) return 'Enter a goal time like 3:45:00.';
        if (a.goalTimeS && (a.goalTimeS < 2 * 3600 || a.goalTimeS > 7 * 3600)) return 'Goal time should be between 2:00:00 and 7:00:00.';
        return null;
      },
      body: (
        <div className="space-y-5">
          <Field label="Race name">
            <Input placeholder="e.g. Vienna City Marathon" value={a.raceName} onChange={(e) => set('raceName', e.target.value)} />
          </Field>
          <Field label="Race date" hint={weeks > 0 ? `${weeks} weeks from today${weeks < 8 ? ' – short, the plan will focus on staying healthy' : weeks > 30 ? ' – early weeks will be base building' : ''}` : undefined}>
            <Input type="date" min={addDays(today, 14)} value={a.raceDate} onChange={(e) => set('raceDate', e.target.value)} />
          </Field>
          <Field label="Goal">
            <Segmented
              value={a.goalType}
              onChange={(v) => set('goalType', v)}
              options={[
                { value: 'finish', label: 'Finish strong', hint: 'No specific time' },
                { value: 'time', label: 'Time goal', hint: 'I have a target' },
              ]}
            />
          </Field>
          {a.goalType === 'time' && (
            <Field label="Goal time (h:mm:ss)">
              <Input
                placeholder="3:45:00"
                inputMode="numeric"
                value={goalText}
                onChange={(e) => {
                  setGoalText(e.target.value);
                  set('goalTimeS', parseTime(e.target.value));
                }}
              />
            </Field>
          )}
          <Field label="Course profile">
            <Segmented
              value={a.raceTerrain}
              onChange={(v) => set('raceTerrain', v)}
              options={[
                { value: 'flat', label: 'Flat' },
                { value: 'rolling', label: 'Rolling' },
                { value: 'hilly', label: 'Hilly' },
              ]}
            />
          </Field>
        </div>
      ),
    },
    {
      title: 'Running background',
      subtitle: 'This sets how hard and how fast the plan builds.',
      validate: () => {
        if (a.recentRace && !a.recentRace.timeS) return 'Enter your race time, or choose "No recent race".';
        return null;
      },
      body: (
        <div className="space-y-5">
          <Field label="Experience">
            <Segmented
              value={a.level}
              onChange={(v) => set('level', v)}
              columns={1}
              options={[
                { value: 'beginner', label: 'Beginner', hint: 'First marathon, running under ~25 km a week' },
                { value: 'intermediate', label: 'Intermediate', hint: 'Run regularly, done half marathons or a marathon' },
                { value: 'advanced', label: 'Advanced', hint: 'Several marathons, 60+ km weeks are normal' },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Years running">
              <Input type="number" min={0} max={60} value={a.yearsRunning} onChange={(e) => set('yearsRunning', Number(e.target.value))} />
            </Field>
            <Field label="Marathons finished">
              <Input type="number" min={0} max={200} value={a.marathonsCompleted} onChange={(e) => set('marathonsCompleted', Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Recent race result" hint="The best predictor of your training paces. Leave out if older than ~6 months.">
            <Select
              value={a.recentRace?.distanceM ?? ''}
              onChange={(e) =>
                set('recentRace', e.target.value ? { distanceM: Number(e.target.value), timeS: parseTime(raceTimeText) ?? 0, date: a.recentRace?.date ?? null } : null)
              }
            >
              <option value="">No recent race</option>
              {RACE_DISTANCES.map((d) => (
                <option key={d.m} value={d.m}>{d.label}</option>
              ))}
            </Select>
          </Field>
          {a.recentRace && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Finish time">
                <Input
                  placeholder="h:mm:ss"
                  value={raceTimeText}
                  onChange={(e) => {
                    setRaceTimeText(e.target.value);
                    set('recentRace', { ...a.recentRace!, timeS: parseTime(e.target.value) ?? 0 });
                  }}
                />
              </Field>
              <Field label="Race date">
                <Input type="date" max={today} value={a.recentRace.date ?? ''} onChange={(e) => set('recentRace', { ...a.recentRace!, date: e.target.value || null })} />
              </Field>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Current training',
      subtitle: 'A rough idea is fine – Garmin data refines it once connected.',
      validate: () => (a.currentWeeklyKm < 0 || a.longestRecentRunKm < 0 ? 'Distances cannot be negative.' : null),
      body: (
        <div className="space-y-5">
          <Field label="Units">
            <Segmented
              value={a.units}
              onChange={(v) => set('units', v)}
              options={[
                { value: 'km', label: 'Kilometres' },
                { value: 'mi', label: 'Miles' },
              ]}
            />
          </Field>
          <Field label={`Average weekly distance, last 4 weeks (${u})`}>
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              value={Math.round(toUnit(a.currentWeeklyKm, u))}
              onChange={(e) => set('currentWeeklyKm', fromUnit(Number(e.target.value), u))}
            />
          </Field>
          <Field label={`Longest run in the last month (${u})`}>
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              value={Math.round(toUnit(a.longestRecentRunKm, u))}
              onChange={(e) => set('longestRecentRunKm', fromUnit(Number(e.target.value), u))}
            />
          </Field>
        </div>
      ),
    },
    {
      title: 'Your week',
      subtitle: 'The plan only uses days you can actually train.',
      validate: () => {
        if (a.availableDays.length < Math.min(a.runDaysPerWeek, 3)) return 'Select at least as many available days as run days.';
        if (!a.availableDays.includes(a.longRunDay)) return 'Your long-run day must be one of your available days.';
        return null;
      },
      body: (
        <div className="space-y-5">
          <Field label="Runs per week">
            <Segmented
              value={a.runDaysPerWeek}
              onChange={(v) => set('runDaysPerWeek', v)}
              options={[3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))}
            />
          </Field>
          <Field label="Days you can run" hint={`${a.availableDays.length} selected`}>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d, i) => {
                const on = a.availableDays.includes(i as Weekday);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('availableDays', (on ? a.availableDays.filter((x) => x !== i) : [...a.availableDays, i as Weekday]).sort())}
                    className={cx('rounded-lg py-2 text-xs font-semibold ring-1 transition', on ? 'bg-ink text-white ring-ink' : 'bg-white text-slate-600 ring-slate-300')}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Long-run day">
            <Select value={a.longRunDay} onChange={(e) => set('longRunDay', Number(e.target.value) as Weekday)}>
              {DAYS.map((d, i) => (
                <option key={d} value={i} disabled={!a.availableDays.includes(i as Weekday)}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time limit on weekdays (Mon–Fri)">
            <Segmented
              value={a.weekdayMaxMinutes ?? 0}
              onChange={(v) => set('weekdayMaxMinutes', v || null)}
              options={[
                { value: 0, label: 'None' },
                { value: 45, label: '45 min' },
                { value: 60, label: '60 min' },
                { value: 75, label: '75 min' },
                { value: 90, label: '90 min' },
              ]}
            />
          </Field>
        </div>
      ),
    },
    {
      title: 'Strength training',
      subtitle: 'Strength work makes you more resilient. The planner fits it around your key runs.',
      validate: () => null,
      body: (
        <div className="space-y-5">
          <Toggle
            checked={a.strength.enabled}
            onChange={(v) => set('strength', { ...a.strength, enabled: v })}
            label="Add strength sessions to my plan"
            hint="Lower-body work never lands before a long run or a key session."
          />
          {a.strength.enabled && (
            <>
              <Field label="Focus">
                <Segmented
                  value={a.strength.focus}
                  onChange={(v) => set('strength', { ...a.strength, focus: v })}
                  columns={2}
                  options={[
                    { value: 'upper', label: 'Upper body', hint: 'Posture, arms, core' },
                    { value: 'lower', label: 'Lower body', hint: 'Legs, glutes, calves' },
                    { value: 'upper_lower', label: 'Upper / lower split', hint: 'Alternate both' },
                    { value: 'full', label: 'Full body', hint: 'Everything each session' },
                  ]}
                />
              </Field>
              <Field label="Sessions per week">
                <Segmented
                  value={a.strength.perWeek}
                  onChange={(v) => set('strength', { ...a.strength, perWeek: v })}
                  options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
                />
              </Field>
              <Field label="Equipment">
                <Segmented
                  value={a.strength.equipment}
                  onChange={(v) => set('strength', { ...a.strength, equipment: v })}
                  options={[
                    { value: 'bodyweight', label: 'Bodyweight' },
                    { value: 'dumbbells', label: 'Dumbbells' },
                    { value: 'gym', label: 'Full gym' },
                  ]}
                />
              </Field>
            </>
          )}
        </div>
      ),
    },
    {
      title: 'About you',
      subtitle: 'Used for heart-rate zones and how quickly the plan progresses.',
      validate: () => {
        if (a.age !== null && (a.age < 14 || a.age > 95)) return 'Please enter a valid age.';
        if (a.maxHr !== null && (a.maxHr < 140 || a.maxHr > 230)) return 'Max heart rate looks off – leave it empty if unsure.';
        return null;
      },
      body: (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <Input type="number" value={a.age ?? ''} onChange={(e) => set('age', e.target.value ? Number(e.target.value) : null)} />
            </Field>
            <Field label="Max heart rate" hint="Optional">
              <Input type="number" placeholder="e.g. 188" value={a.maxHr ?? ''} onChange={(e) => set('maxHr', e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </div>
          <Field label="Sex">
            <Segmented
              value={a.sex ?? 'other'}
              onChange={(v) => set('sex', v)}
              options={[
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                { value: 'other', label: 'Other / skip' },
              ]}
            />
          </Field>
          <Toggle
            checked={a.injuryProne}
            onChange={(v) => set('injuryProne', v)}
            label="I get injured easily"
            hint="Slower build-up and an easier week every third week."
          />
          <Field label="Injuries or notes" hint="Optional – e.g. recurring calf issues.">
            <Textarea value={a.injuries} onChange={(e) => set('injuries', e.target.value)} />
          </Field>
          <Field label="How should the plan build?">
            <Segmented
              value={a.approach}
              onChange={(v) => set('approach', v)}
              columns={1}
              options={[
                { value: 'conservative', label: 'Conservative', hint: 'Lower peak volume, gentle increases' },
                { value: 'balanced', label: 'Balanced', hint: 'Recommended for most runners' },
                { value: 'ambitious', label: 'Ambitious', hint: 'Higher peak volume and longer long runs' },
              ]}
            />
          </Field>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  const next = async () => {
    const problem = current.validate();
    if (problem) return setError(problem);
    setError(null);
    if (!last) return setStep(step + 1);
    setBusy(true);
    try {
      const answers: OnboardingAnswers = {
        ...a,
        runDaysPerWeek: Math.min(a.runDaysPerWeek, a.availableDays.length),
        goalTimeS: a.goalType === 'time' ? a.goalTimeS : null,
      };
      await saveOnboarding(user!.id, answers);
      await reload();
      navigate(editing ? '/plan/new?updated=1' : '/connect?onboarding=1');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredPage wide>
      <div className="mb-4 flex gap-1.5">
        {steps.map((s, i) => (
          <div key={s.title} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand' : 'bg-white/20')} />
        ))}
      </div>
      <Card className="p-6 sm:p-8">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">
            Step {step + 1} of {steps.length}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{current.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{current.subtitle}</p>
        </div>
        {current.body}
        {error && <Notice tone="error" className="mt-5">{error}</Notice>}
        <div className="mt-8 flex justify-between gap-3">
          <Button variant="ghost" onClick={() => (step ? setStep(step - 1) : navigate(editing ? '/settings' : '/'))} icon={<ArrowLeft className="h-4 w-4" />}>
            {step ? 'Back' : editing ? 'Cancel' : ''}
          </Button>
          <Button onClick={next} loading={busy} icon={last ? <Check className="h-4 w-4" /> : undefined}>
            {last ? (editing ? 'Save answers' : 'Finish') : 'Next'}
            {!last && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </Card>
    </CenteredPage>
  );
}
