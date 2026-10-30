// The coach's tools. Reading tools look at the athlete's data; "propose" tools never change
// anything: they validate a plan change against the real data and hand it back to the website,
// where the athlete confirms it with a button. Shared by the "coach" Edge Function and the tests.

import { activityLine, addDays, clock, dayLabel, metricLine, paceText, shortId, workoutLine, weekdayOf, type CoachData, type CoachWorkout } from './coachContext.ts';

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export type ActionStatus = 'pending' | 'applied' | 'dismissed' | 'failed';

export interface PlanChanges {
  runsPerWeek?: number;
  /** 0 = Monday … 6 = Sunday */
  availableDays?: number[];
  longRunDay?: number;
  /** null = no limit */
  weekdayMaxMinutes?: number | null;
  approach?: 'conservative' | 'balanced' | 'ambitious';
  injuryProne?: boolean;
  injuries?: string;
}

interface ActionBase {
  id: string;
  status: ActionStatus;
  /** One line per change, for the confirmation card. */
  summary: string;
  reason: string;
}

export type CoachAction =
  | (ActionBase & { tool: 'move_workout'; workoutId: string; date: string })
  | (ActionBase & { tool: 'skip_workouts'; workoutIds: string[] })
  | (ActionBase & { tool: 'scale_workouts'; items: { workoutId: string; factor: number }[] })
  | (ActionBase & { tool: 'change_plan'; changes: PlanChanges });

export const RUN_KINDS = new Set(['easy', 'recovery', 'long', 'long_mp', 'threshold', 'intervals', 'marathon_pace', 'fartlek', 'shakeout']);
const MOVABLE_STATUS = new Set(['planned', 'missed', 'skipped']);

export interface LapRow {
  distanceM: number;
  durationS: number;
  avgSpeed: number | null;
  avgHr: number | null;
}

export interface ToolState {
  data: CoachData;
  /** Proposals collected during this answer. */
  actions: CoachAction[];
  /** Laps of one activity (full id), if stored. */
  laps: (activityId: string) => Promise<LapRow[] | null>;
  newId: () => string;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

const fail = (content: string): ToolResult => ({ content, isError: true });

// ---------------------------------------------------------------------------
// Definitions (what Claude sees)
// ---------------------------------------------------------------------------

const DATE = { type: 'string', description: 'Date as YYYY-MM-DD' };
const ID = { type: 'string', description: 'The 8-character id in brackets from the data, e.g. "a1b2c3d4"' };

export const TOOL_DEFS = [
  {
    name: 'get_activities',
    description: 'List the athlete\'s recorded activities in a date range (newest first, max 80). Use it for anything older than the 6 weeks in the context, or to filter by sport.',
    input_schema: {
      type: 'object',
      properties: { from: DATE, to: DATE, sport: { type: 'string', description: 'Optional: run, strength, bike, swim, walk, mobility or other' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_activity_laps',
    description: 'Laps of one recorded activity (distance, pace, heart rate per lap). Use it to analyse intervals, pacing or heart-rate drift of a specific run.',
    input_schema: { type: 'object', properties: { activity_id: ID }, required: ['activity_id'] },
  },
  {
    name: 'get_workouts',
    description: 'List planned sessions of the training plan in a date range (max 60), with ids and status. Use it for dates outside the window in the context.',
    input_schema: { type: 'object', properties: { from: DATE, to: DATE }, required: ['from', 'to'] },
  },
  {
    name: 'get_wellness',
    description: 'Daily wellness data (resting heart rate, HRV, sleep, body battery, stress) for a date range, newest first (max 60 days).',
    input_schema: { type: 'object', properties: { from: DATE, to: DATE }, required: ['from', 'to'] },
  },
  {
    name: 'propose_move_workout',
    description:
      'Propose moving one planned session to another day. NOTHING is changed: the athlete sees the proposal with an Apply button. Only use it when the athlete asks for a change or agrees to your suggestion, and explain why in your answer.',
    input_schema: {
      type: 'object',
      properties: { workout_id: ID, new_date: DATE, reason: { type: 'string', description: 'One short sentence' } },
      required: ['workout_id', 'new_date', 'reason'],
    },
  },
  {
    name: 'propose_skip_workouts',
    description:
      'Propose skipping planned sessions (illness, injury, travel, a bad week). They are marked as skipped and the plan continues. The athlete confirms with a button first. Never skip the race.',
    input_schema: {
      type: 'object',
      properties: { workout_ids: { type: 'array', items: ID, description: 'Up to 14 ids' }, reason: { type: 'string' } },
      required: ['workout_ids', 'reason'],
    },
  },
  {
    name: 'propose_scale_workouts',
    description:
      'Propose making planned running sessions shorter or longer by a factor (0.3 to 1.5), for example 0.8 for 20 % less. Reps of interval sessions are reduced, warm-up and cool-down stay. The athlete confirms first.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Up to 8 sessions',
          items: { type: 'object', properties: { workout_id: ID, factor: { type: 'number' } }, required: ['workout_id', 'factor'] },
        },
        reason: { type: 'string' },
      },
      required: ['items', 'reason'],
    },
  },
  {
    name: 'propose_plan_changes',
    description:
      'Propose changing the plan\'s settings so that the coming weeks are rebuilt: runs per week, which weekdays are available, the long-run day, a time limit for weekday sessions, the training approach, injury flags. Sessions already done stay. Use only for lasting changes; for single sessions use the other tools. The goal time and race date cannot be changed here.',
    input_schema: {
      type: 'object',
      properties: {
        runs_per_week: { type: 'integer', description: '3 to 7' },
        available_days: { type: 'array', items: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }, description: 'All weekdays the athlete can run (replaces the current list)' },
        long_run_day: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
        weekday_max_minutes: { type: 'integer', description: 'Time limit in minutes for sessions on weekdays, 20 to 240; 0 removes the limit' },
        approach: { type: 'string', enum: ['conservative', 'balanced', 'ambitious'] },
        injury_prone: { type: 'boolean' },
        injuries: { type: 'string', description: 'Short note about injuries or limits, max 300 characters' },
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
] as const;

export const PROPOSAL_TOOLS = new Set(['propose_move_workout', 'propose_skip_workouts', 'propose_scale_workouts', 'propose_plan_changes']);

/** Shown to the model after a proposal: it must not claim that anything has changed. */
const PROPOSED =
  'Proposal recorded. It is shown to the athlete as a card with an Apply button. NOTHING has been changed yet. Say that you proposed it and that it takes effect when they confirm; never say it is done.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Full id or a unique prefix (at least 6 characters). */
export function resolveWorkout(workouts: CoachWorkout[], ref: unknown): CoachWorkout | string {
  if (typeof ref !== 'string' || ref.trim().length < 6) return 'workout_id must be the 8-character id from the data.';
  const r = ref.trim().replace(/^\[|\]$/g, '').toLowerCase();
  const hits = workouts.filter((w) => w.id.toLowerCase().startsWith(r));
  if (hits.length === 1) return hits[0];
  return hits.length ? `The id "${r}" matches several sessions.` : `No planned session has the id "${r}". Use get_workouts to look it up.`;
}

function resolveActivity(data: CoachData, ref: unknown) {
  if (typeof ref !== 'string' || ref.trim().length < 6) return null;
  const r = ref.trim().replace(/^\[|\]$/g, '').toLowerCase();
  const hits = data.activities.filter((a) => a.id.toLowerCase().startsWith(r));
  return hits.length === 1 ? hits[0] : null;
}

const range = (input: Record<string, unknown>) =>
  isDate(input.from) && isDate(input.to) && input.from <= input.to ? { from: input.from as string, to: input.to as string } : null;

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayIndex = (v: unknown): number => (typeof v === 'string' ? WEEKDAY_KEYS.indexOf(v.trim().slice(0, 3).toLowerCase()) : -1);
const dayList = (days: number[]) => days.map((d) => WEEKDAY_NAMES[d]).join(', ');

// ---------------------------------------------------------------------------
// Executing a tool call
// ---------------------------------------------------------------------------

export async function runTool(name: string, input: Record<string, unknown>, state: ToolState): Promise<ToolResult> {
  const { data } = state;
  switch (name) {
    case 'get_activities': {
      const r = range(input);
      if (!r) return fail('from and to must be dates (YYYY-MM-DD) with from <= to.');
      const sport = typeof input.sport === 'string' ? input.sport.toLowerCase() : null;
      const rows = data.activities
        .filter((a) => a.local_date >= r.from && a.local_date <= r.to && (!sport || a.sport === sport))
        .sort((a, b) => b.local_date.localeCompare(a.local_date));
      if (!rows.length) return { content: 'No activities in that range.' };
      return { content: `${rows.length} activities${rows.length > 80 ? ' (showing the newest 80)' : ''}:\n${rows.slice(0, 80).map(activityLine).join('\n')}` };
    }

    case 'get_activity_laps': {
      const a = resolveActivity(data, input.activity_id);
      if (!a) return fail('No activity with that id. Take the id in brackets from the activity list.');
      const laps = await state.laps(a.id);
      if (!laps?.length) return { content: `${activityLine(a)}\nNo lap data is stored for this activity.` };
      const rows = laps.slice(0, 60).map((l, i) => {
        const pace = l.avgSpeed && l.avgSpeed > 0.5 ? `${paceText(1000 / l.avgSpeed)}/km` : l.distanceM > 100 ? `${paceText(l.durationS / (l.distanceM / 1000))}/km` : 'n/a';
        return `lap ${i + 1}: ${(l.distanceM / 1000).toFixed(2)} km · ${clock(l.durationS)} · ${pace}${l.avgHr ? ` · HR ${Math.round(l.avgHr)}` : ''}`;
      });
      return { content: `${activityLine(a)}\n${laps.length} laps${laps.length > 60 ? ' (first 60 shown)' : ''}:\n${rows.join('\n')}` };
    }

    case 'get_workouts': {
      const r = range(input);
      if (!r) return fail('from and to must be dates (YYYY-MM-DD) with from <= to.');
      const rows = data.workouts.filter((w) => w.date >= r.from && w.date <= r.to).sort((a, b) => a.date.localeCompare(b.date));
      if (!rows.length) return { content: 'No planned sessions in that range.' };
      return { content: `${rows.length} sessions${rows.length > 60 ? ' (showing the first 60)' : ''}:\n${rows.slice(0, 60).map(workoutLine).join('\n')}` };
    }

    case 'get_wellness': {
      const r = range(input);
      if (!r) return fail('from and to must be dates (YYYY-MM-DD) with from <= to.');
      const rows = data.metrics.filter((m) => m.date >= r.from && m.date <= r.to).sort((a, b) => b.date.localeCompare(a.date));
      return { content: rows.length ? rows.slice(0, 60).map(metricLine).join('\n') : 'No wellness data in that range.' };
    }

    case 'propose_move_workout':
      return proposeMove(input, state);
    case 'propose_skip_workouts':
      return proposeSkip(input, state);
    case 'propose_scale_workouts':
      return proposeScale(input, state);
    case 'propose_plan_changes':
      return proposePlanChanges(input, state);
    default:
      return fail(`Unknown tool "${name}".`);
  }
}

function pending(state: ToolState, rest: Record<string, unknown> & { tool: CoachAction['tool']; summary: string; reason: string }): ToolResult {
  state.actions.push({ id: state.newId(), status: 'pending', ...rest } as CoachAction);
  return { content: PROPOSED };
}

function proposeMove(input: Record<string, unknown>, state: ToolState): ToolResult {
  const { data } = state;
  if (!data.plan) return fail('There is no active plan.');
  const w = resolveWorkout(data.workouts, input.workout_id);
  if (typeof w === 'string') return fail(w);
  if (!isDate(input.new_date)) return fail('new_date must be a date (YYYY-MM-DD).');
  const date = input.new_date;
  const last = addDays(data.plan.race_date, -1);
  if (w.kind === 'race') return fail('The race cannot be moved.');
  if (!MOVABLE_STATUS.has(w.status)) return fail(`"${w.title}" is already ${w.status} and cannot be moved.`);
  if (date < data.today) return fail('A session cannot be moved into the past.');
  if (date > last) return fail(`Sessions can only be placed up to the day before the race (${last}).`);
  if (date === w.date) return fail('That is already the date of the session.');
  return pending(state, {
    tool: 'move_workout',
    workoutId: w.id,
    date,
    reason: text(input.reason, 300),
    summary: `Move "${w.title}" from ${dayLabel(w.date)} to ${dayLabel(date)}`,
  });
}

function proposeSkip(input: Record<string, unknown>, state: ToolState): ToolResult {
  const { data } = state;
  if (!data.plan) return fail('There is no active plan.');
  const refs = Array.isArray(input.workout_ids) ? input.workout_ids : [];
  if (!refs.length || refs.length > 14) return fail('workout_ids must list 1 to 14 sessions.');
  const picked: CoachWorkout[] = [];
  for (const ref of refs) {
    const w = resolveWorkout(data.workouts, ref);
    if (typeof w === 'string') return fail(w);
    if (w.kind === 'race') return fail('The race cannot be skipped.');
    if (w.status !== 'planned') return fail(`"${w.title}" on ${w.date} is already ${w.status}.`);
    if (w.date < data.today) return fail(`"${w.title}" on ${w.date} is in the past.`);
    if (!picked.some((p) => p.id === w.id)) picked.push(w);
  }
  picked.sort((a, b) => a.date.localeCompare(b.date));
  return pending(state, {
    tool: 'skip_workouts',
    workoutIds: picked.map((w) => w.id),
    reason: text(input.reason, 300),
    summary: picked.map((w) => `Skip "${w.title}" on ${dayLabel(w.date)}`).join('\n'),
  });
}

function proposeScale(input: Record<string, unknown>, state: ToolState): ToolResult {
  const { data } = state;
  if (!data.plan) return fail('There is no active plan.');
  const items = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
  if (!items.length || items.length > 8) return fail('items must list 1 to 8 sessions.');
  const out: { workoutId: string; factor: number }[] = [];
  const lines: string[] = [];
  for (const it of items) {
    const w = resolveWorkout(data.workouts, it?.workout_id);
    if (typeof w === 'string') return fail(w);
    const factor = Number(it?.factor);
    if (!Number.isFinite(factor) || factor < 0.3 || factor > 1.5) return fail('factor must be between 0.3 and 1.5.');
    if (!RUN_KINDS.has(w.kind)) return fail(`"${w.title}" is not a running session that can be scaled.`);
    if (w.status !== 'planned') return fail(`"${w.title}" is already ${w.status}.`);
    if (w.date < data.today) return fail(`"${w.title}" on ${w.date} is in the past.`);
    if (!w.distance_km) return fail(`"${w.title}" has no distance to scale.`);
    if (out.some((o) => o.workoutId === w.id)) continue;
    const rounded = Math.round(factor * 100) / 100;
    out.push({ workoutId: w.id, factor: rounded });
    const newKm = Math.round(w.distance_km * rounded * 2) / 2;
    const pct = Math.round((rounded - 1) * 100);
    lines.push(`Change "${w.title}" on ${dayLabel(w.date)}: about ${Math.round(w.distance_km * 10) / 10} km → ${newKm} km (${pct >= 0 ? '+' : ''}${pct} %)`);
  }
  return pending(state, { tool: 'scale_workouts', items: out, reason: text(input.reason, 300), summary: lines.join('\n') });
}

function proposePlanChanges(input: Record<string, unknown>, state: ToolState): ToolResult {
  const { data } = state;
  const plan = data.plan;
  if (!plan) return fail('There is no active plan.');
  const a = plan.inputs;
  const custom = a.scheduleMode === 'custom';
  const changes: PlanChanges = {};
  const lines: string[] = [];

  const curDays = (Array.isArray(a.availableDays) ? (a.availableDays as number[]) : []).filter((n) => n >= 0 && n <= 6);
  const curRuns = typeof a.runDaysPerWeek === 'number' ? a.runDaysPerWeek : curDays.length;
  const curLong = typeof a.longRunDay === 'number' ? a.longRunDay : 6;

  if (input.runs_per_week !== undefined) {
    const n = Number(input.runs_per_week);
    if (!Number.isInteger(n) || n < 3 || n > 7) return fail('runs_per_week must be a whole number from 3 to 7.');
    changes.runsPerWeek = n;
    lines.push(`Runs per week: ${curRuns} → ${n}`);
  }
  if (input.available_days !== undefined) {
    const raw = Array.isArray(input.available_days) ? input.available_days : [];
    const idx = [...new Set(raw.map(dayIndex))].sort((x, y) => x - y);
    if (!idx.length || idx.includes(-1)) return fail('available_days must list weekdays like "mon", "wed".');
    changes.availableDays = idx;
    lines.push(`Days you can run: ${dayList(curDays) || '?'} → ${dayList(idx)}`);
  }
  if (input.long_run_day !== undefined) {
    const d = dayIndex(input.long_run_day);
    if (d < 0) return fail('long_run_day must be a weekday like "sun".');
    changes.longRunDay = d;
    lines.push(`Long run day: ${WEEKDAY_NAMES[curLong]} → ${WEEKDAY_NAMES[d]}`);
  }
  if (input.weekday_max_minutes !== undefined) {
    const n = Number(input.weekday_max_minutes);
    if (!Number.isInteger(n) || (n !== 0 && (n < 20 || n > 240))) return fail('weekday_max_minutes must be 0 (no limit) or between 20 and 240.');
    changes.weekdayMaxMinutes = n === 0 ? null : n;
    lines.push(`Weekday session limit: ${typeof a.weekdayMaxMinutes === 'number' && a.weekdayMaxMinutes ? `${a.weekdayMaxMinutes} min` : 'none'} → ${n === 0 ? 'none' : `${n} min`}`);
  }
  if (input.approach !== undefined) {
    if (input.approach !== 'conservative' && input.approach !== 'balanced' && input.approach !== 'ambitious') return fail('approach must be conservative, balanced or ambitious.');
    changes.approach = input.approach;
    lines.push(`Approach: ${typeof a.approach === 'string' ? a.approach : '?'} → ${input.approach}`);
  }
  if (input.injury_prone !== undefined) {
    if (typeof input.injury_prone !== 'boolean') return fail('injury_prone must be true or false.');
    changes.injuryProne = input.injury_prone;
    lines.push(`Injury-prone: ${a.injuryProne === true ? 'yes' : 'no'} → ${input.injury_prone ? 'yes' : 'no'}`);
  }
  if (input.injuries !== undefined) {
    changes.injuries = text(input.injuries, 300);
    lines.push(`Injury note: "${changes.injuries}"`);
  }
  if (!lines.length) return fail('No change given. Pass at least one setting to change.');

  if (custom && (changes.runsPerWeek !== undefined || changes.availableDays !== undefined || changes.longRunDay !== undefined)) {
    return fail('This plan uses a custom week that the athlete fixed by hand. Run days and the long-run day cannot be changed here; they can adjust the week in Settings, or you can move single sessions instead.');
  }

  // The combination has to work: enough days, and the long run on one of them.
  const days = changes.availableDays ?? curDays;
  const runs = Math.min(changes.runsPerWeek ?? curRuns, days.length);
  if (days.length < Math.min(changes.runsPerWeek ?? curRuns, 3)) return fail('Select at least as many available days as run days (minimum 3 days).');
  const long = changes.longRunDay ?? curLong;
  if (!custom && !days.includes(long)) return fail(`The long-run day (${WEEKDAY_NAMES[long]}) must be one of the available days (${dayList(days)}).`);
  if (changes.runsPerWeek !== undefined && runs !== changes.runsPerWeek) {
    lines.push(`(Only ${days.length} days are available, so ${runs} runs per week)`);
    changes.runsPerWeek = runs;
  }
  const from = weekdayOf(data.today) <= 1 ? data.today : addDays(data.today, 7 - weekdayOf(data.today));
  lines.push(`The weeks from ${dayLabel(from)} on are rebuilt with these settings. Sessions you already did stay in your history.`);
  return pending(state, { tool: 'change_plan', changes, reason: text(input.reason, 300), summary: lines.join('\n') });
}

export { shortId };
