// What the coach knows about the athlete, as compact text for the system prompt.
// Pure functions on plain data, shared by the "coach" Edge Function (Deno) and the tests (Node).

export type Rec = Record<string, unknown>;

export interface CoachWorkout {
  id: string;
  date: string;
  kind: string;
  title: string;
  distance_km: number | null;
  duration_min: number | null;
  key_session: boolean;
  status: string;
  note: string | null;
  /** The session ends with strides. */
  has_strides?: boolean;
}

export interface CoachActivity {
  id: string;
  local_date: string;
  sport: string;
  name: string | null;
  distance_m: number | null;
  duration_s: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  training_load: number | null;
  elevation_gain_m: number | null;
}

export interface CoachMetric {
  date: string;
  resting_hr: number | null;
  hrv_last_night: number | null;
  hrv_status: string | null;
  sleep_s: number | null;
  sleep_score: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  stress_avg: number | null;
}

export interface CoachPlan {
  race_name: string | null;
  race_date: string;
  start_date: string;
  /** Questionnaire answers (the fields used here are listed in describeAthlete). */
  inputs: Rec;
  fitness: {
    vdot?: number;
    paces?: Record<string, number | [number, number]>;
    predictedMarathonS?: number;
    targetMarathonS?: number;
    goalAssessment?: string;
    peakWeeklyKm?: number;
    peakLongKm?: number;
  };
  weeks: { week: number; startDate: string; phase: string; targetKm: number; longKm: number; recovery: boolean }[];
}

export interface CoachData {
  today: string;
  units: 'km' | 'mi';
  displayName: string | null;
  plan: CoachPlan | null;
  /** All workouts of the active plan. */
  workouts: CoachWorkout[];
  /** Roughly the last 6 months. */
  activities: CoachActivity[];
  /** Roughly the last 8 weeks. */
  metrics: CoachMetric[];
  garminConnected: boolean;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
/** 0 = Monday … 6 = Sunday */
export const weekdayOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
export const mondayOf = (iso: string) => addDays(iso, -weekdayOf(iso));
export const dayLabel = (iso: string) => `${WEEKDAYS[weekdayOf(iso)]} ${iso}`;
export const shortId = (id: string) => id.slice(0, 8);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** 3723 → "1:02:03", 754 → "12:34" */
export function clock(totalS: number): string {
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Seconds per km → "5:26" */
export const paceText = (sPerKm: number) => clock(sPerKm);

const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

const paceOf = (a: { distance_m: number | null; duration_s: number | null }): string | null =>
  a.distance_m && a.duration_s && a.distance_m > 500 ? paceText(a.duration_s / (a.distance_m / 1000)) : null;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function describeAthlete(d: CoachData): string[] {
  const a = d.plan?.inputs ?? {};
  const lines: string[] = [];
  const bits: string[] = [];
  const level = str(a.level);
  if (level) bits.push(level);
  const years = num(a.yearsRunning);
  if (years !== null) bits.push(`${years} yr running`);
  const marathons = num(a.marathonsCompleted);
  if (marathons !== null) bits.push(`${marathons} marathon${marathons === 1 ? '' : 's'} finished`);
  const age = num(a.age);
  if (age !== null) bits.push(`age ${age}`);
  const sex = str(a.sex);
  if (sex) bits.push(sex);
  const maxHr = num(a.maxHr);
  if (maxHr !== null) bits.push(`max HR ${maxHr}`);
  if (bits.length) lines.push(`- ${bits.join(', ')}`);

  if (a.injuryProne === true || str(a.injuries)) {
    lines.push(`- injury-prone: ${a.injuryProne === true ? 'yes' : 'no'}${str(a.injuries) ? ` — "${clip(String(a.injuries), 300)}"` : ''}`);
  }
  const approach = str(a.approach);
  if (approach) lines.push(`- training approach: ${approach}`);

  const custom = a.scheduleMode === 'custom';
  const days = Array.isArray(a.availableDays) ? (a.availableDays as number[]).filter((n) => n >= 0 && n <= 6).map((n) => WEEKDAYS[n]) : [];
  const longDay = num(a.longRunDay);
  const runs = num(a.runDaysPerWeek);
  lines.push(
    `- schedule: ${custom ? 'custom week fixed by the athlete (cannot be changed through the plan-change tool)' : 'automatic'}; ${runs ?? '?'} runs/week` +
      `${days.length ? ` on ${days.join(', ')}` : ''}${longDay !== null ? `; long run ${WEEKDAYS_LONG[longDay]}` : ''}` +
      `${num(a.weekdayMaxMinutes) ? `; weekday sessions max ${a.weekdayMaxMinutes} min` : ''}`,
  );
  const noStrides = Array.isArray(a.noStridesDays) ? (a.noStridesDays as number[]).filter((n) => n >= 0 && n <= 6).map((n) => WEEKDAYS[n]) : [];
  if (noStrides.length) lines.push(`- no strides on easy runs on: ${noStrides.join(', ')}`);
  const extras = Array.isArray(a.extras) ? (a.extras as Rec[]) : [];
  if (extras.length) {
    lines.push(`- extra sessions per week: ${extras.map((e) => `${str(e.name) ?? str(e.type) ?? '?'} ×${num(e.perWeek) ?? 1}`).join(', ')}${str(a.equipment) ? ` (${a.equipment})` : ''}`);
  }
  return lines;
}

function describePlan(d: CoachData): string[] {
  const p = d.plan;
  if (!p) return ['- No active training plan yet.'];
  const f = p.fitness ?? {};
  const lines: string[] = [];
  const left = daysBetween(d.today, p.race_date);
  lines.push(`- Race: ${p.race_name || 'marathon'} on ${dayLabel(p.race_date)} (${left} days, ${Math.ceil(left / 7)} weeks left)`);
  const goal = num(f.targetMarathonS);
  const predicted = num(f.predictedMarathonS);
  const a = p.inputs;
  lines.push(
    `- Goal: ${a.goalType === 'time' && goal ? clock(goal) : 'finish'}${predicted ? `; predicted by MaraPlanna today: ${clock(predicted)}` : ''}${str(f.goalAssessment) && f.goalAssessment !== 'none' ? ` (${f.goalAssessment})` : ''}`,
  );
  if (num(f.vdot)) {
    const pc = f.paces ?? {};
    const fmt = (v: number | [number, number] | undefined) => (Array.isArray(v) ? `${paceText(v[0])}–${paceText(v[1])}` : typeof v === 'number' ? paceText(v) : '?');
    lines.push(`- VDOT ${oneDecimal(f.vdot as number)}. Paces per km: easy ${fmt(pc.easy)}, long ${fmt(pc.long)}, recovery ${fmt(pc.recovery)}, marathon ${fmt(pc.marathon)}, threshold ${fmt(pc.threshold)}, interval ${fmt(pc.interval)}, repetition ${fmt(pc.repetition)}`);
  }
  const week = p.weeks.find((w) => w.startDate <= d.today && d.today < addDays(w.startDate, 7));
  if (week) {
    const next = p.weeks.find((w) => w.week === week.week + 1);
    lines.push(
      `- Now: week ${week.week} of ${p.weeks.length}, phase ${week.phase}${week.recovery ? ' (recovery week)' : ''}; target ${week.targetKm} km, long run ${week.longKm} km` +
        `${next ? `. Next week: ${next.targetKm} km, long ${next.longKm} km${next.recovery ? ' (recovery)' : ''}` : ''}`,
    );
  } else if (d.today < p.start_date) {
    lines.push(`- The plan starts on ${dayLabel(p.start_date)}.`);
  }
  if (num(f.peakWeeklyKm)) lines.push(`- Planned peak: ${f.peakWeeklyKm} km/week, longest run ${f.peakLongKm ?? '?'} km`);
  return lines;
}

/** Weekly running volume of the last n weeks (Monday-based), with the plan's target where known. */
function describeWeeks(d: CoachData, n: number): string[] {
  const monday = mondayOf(d.today);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addDays(monday, -7 * i);
    const end = addDays(start, 6);
    const runs = d.activities.filter((a) => a.sport === 'run' && a.local_date >= start && a.local_date <= end);
    const km = runs.reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
    const target = d.plan?.weeks.find((w) => w.startDate === start)?.targetKm;
    const longest = Math.max(0, ...runs.map((a) => (a.distance_m ?? 0) / 1000));
    out.push(`- w/c ${start}${i === 0 ? ' (this week, so far)' : ''}: ${oneDecimal(km)} km in ${runs.length} run${runs.length === 1 ? '' : 's'}${runs.length ? `, longest ${oneDecimal(longest)}` : ''}${target ? ` · plan ${target} km` : ''}`);
  }
  return out;
}

export function workoutLine(w: CoachWorkout): string {
  const size = [w.distance_km ? `${oneDecimal(w.distance_km)} km` : null, w.duration_min ? `${Math.round(w.duration_min)} min` : null].filter(Boolean).join(', ');
  return `[${shortId(w.id)}] ${dayLabel(w.date)} · ${w.title}${size ? ` · ${size}` : ''}${w.key_session ? ' · KEY' : ''}${w.has_strides ? ' · +strides' : ''} · ${w.kind} · ${w.status}${w.note ? ` · note: ${clip(w.note, 80)}` : ''}`;
}

export function activityLine(a: CoachActivity): string {
  const pace = a.sport === 'run' ? paceOf(a) : null;
  const parts = [
    `[${shortId(a.id)}] ${a.local_date} ${a.sport}`,
    a.name ? `"${clip(a.name, 40)}"` : null,
    a.distance_m ? `${oneDecimal(a.distance_m / 1000)} km` : null,
    a.duration_s ? clock(a.duration_s) : null,
    pace ? `${pace}/km` : null,
    a.avg_hr ? `HR ${a.avg_hr}${a.max_hr ? `/${a.max_hr}` : ''}` : null,
    a.elevation_gain_m ? `+${Math.round(a.elevation_gain_m)} m` : null,
    a.training_load ? `load ${Math.round(a.training_load)}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

export function metricLine(m: CoachMetric): string {
  const parts = [
    m.date,
    m.resting_hr ? `resting HR ${m.resting_hr}` : null,
    m.hrv_last_night ? `HRV ${m.hrv_last_night}${m.hrv_status ? ` (${m.hrv_status.toLowerCase()})` : ''}` : null,
    m.sleep_s ? `sleep ${oneDecimal(m.sleep_s / 3600)} h${m.sleep_score ? ` (score ${m.sleep_score})` : ''}` : null,
    m.body_battery_high !== null && m.body_battery_low !== null ? `body battery ${m.body_battery_low}–${m.body_battery_high}` : null,
    m.stress_avg ? `stress ${m.stress_avg}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** How well the last 14 days went compared with the plan. */
function describeAdherence(d: CoachData): string | null {
  const from = addDays(d.today, -14);
  const past = d.workouts.filter((w) => w.date >= from && w.date < d.today && w.status !== 'skipped');
  if (!past.length) return null;
  const count = (s: string) => past.filter((w) => w.status === s).length;
  const planned = past.reduce((s, w) => s + (w.distance_km ?? 0), 0);
  const ran = d.activities.filter((a) => a.sport === 'run' && a.local_date >= from && a.local_date < d.today).reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
  return `- Last 14 days: ${count('completed')} completed, ${count('partial')} partial, ${count('missed')} missed of ${past.length} planned sessions; ${oneDecimal(ran)} km run vs ${oneDecimal(planned)} km planned (all sessions)`;
}

/** The full context block. */
export function buildContext(d: CoachData): string {
  const lines: string[] = [];
  const weekday = WEEKDAYS_LONG[weekdayOf(d.today)];
  lines.push(`TODAY: ${weekday} ${d.today}. The athlete uses ${d.units === 'mi' ? 'miles (convert from the km values below when you answer)' : 'kilometres'}.${d.displayName ? ` Name: ${d.displayName}.` : ''}`);
  lines.push('', 'ATHLETE', ...describeAthlete(d));
  lines.push('', 'GOAL AND PLAN', ...describePlan(d));

  lines.push('', 'RUNNING VOLUME, LAST 12 WEEKS', ...describeWeeks(d, 12));
  const adherence = describeAdherence(d);
  if (adherence) lines.push(adherence);

  const from = addDays(d.today, -14);
  const to = addDays(d.today, 21);
  const upcoming = d.workouts.filter((w) => w.date >= from && w.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  lines.push('', `PLANNED SESSIONS ${from} to ${to} (the id in brackets is what the tools take)`);
  lines.push(...(upcoming.length ? upcoming.map(workoutLine) : ['- none']));

  const recent = d.activities
    .filter((a) => a.local_date >= addDays(d.today, -42))
    .sort((a, b) => b.local_date.localeCompare(a.local_date))
    .slice(0, 60);
  lines.push('', `RECORDED ACTIVITIES, LAST 6 WEEKS (newest first${d.garminConnected ? '' : '; Garmin is not connected, only imported or manual activities'})`);
  lines.push(...(recent.length ? recent.map(activityLine) : ['- none']));

  const metrics = d.metrics.filter((m) => m.date >= addDays(d.today, -14)).sort((a, b) => b.date.localeCompare(a.date));
  lines.push('', 'WELLNESS, LAST 14 DAYS (newest first)');
  lines.push(...(metrics.length ? metrics.map(metricLine) : ['- no wellness data']));
  return lines.join('\n');
}
