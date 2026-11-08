// Daily readiness from Garmin wellness data (resting HR, HRV, sleep, Body Battery).

import type { Activity, DailyMetric } from '../types';
import { addDays } from './dates';
import { median } from './fitness';
import { tr, type MsgKey } from '../i18n';

export interface Readiness {
  level: 'good' | 'ok' | 'low' | 'unknown';
  reasons: string[];
  metric: DailyMetric | null;
}

export function readiness(metrics: DailyMetric[], today: string): Readiness {
  const byDate = new Map(metrics.map((m) => [m.date, m]));
  const m = byDate.get(today) ?? byDate.get(addDays(today, -1)) ?? null;
  if (!m) return { level: 'unknown', reasons: [], metric: null };

  const reasons: string[] = [];
  let strain = 0;
  const baseline = median(
    metrics.filter((x) => x.date < m.date && x.date >= addDays(m.date, -21) && x.resting_hr).map((x) => x.resting_hr!),
  );
  if (m.resting_hr && baseline) {
    const diff = m.resting_hr - baseline;
    if (diff >= 8) {
      strain += 2;
      reasons.push(tr('rd.r.rhr', { n: Math.round(diff) }));
    } else if (diff >= 5) {
      strain += 1;
      reasons.push(tr('rd.r.rhr', { n: Math.round(diff) }));
    }
  }
  const status = (m.hrv_status ?? '').toUpperCase();
  if (status === 'LOW' || status === 'POOR' || status === 'UNBALANCED') {
    strain += 1;
    reasons.push(tr('rd.r.hrvStatus', { status: tr(`rd.hrv.${status.toLowerCase()}` as MsgKey) }));
  } else if (m.hrv_last_night && m.hrv_weekly_avg && m.hrv_last_night < m.hrv_weekly_avg * 0.85) {
    strain += 1;
    reasons.push(tr('rd.r.hrvLow'));
  }
  if (m.sleep_s && m.sleep_s < 6 * 3600) {
    strain += 1;
    reasons.push(tr('rd.r.sleepShort', { h: (m.sleep_s / 3600).toFixed(1) }));
  } else if (m.sleep_score && m.sleep_score < 50) {
    strain += 1;
    reasons.push(tr('rd.r.sleepScore', { n: m.sleep_score }));
  }
  if (m.body_battery_high !== null && m.body_battery_high < 40) {
    strain += 1;
    reasons.push(tr('rd.r.battery', { n: m.body_battery_high }));
  }
  return { level: strain >= 2 ? 'low' : strain === 1 ? 'ok' : 'good', reasons, metric: m };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
/** Linear 0-100 score: `bad` maps to 0, `good` to 100. */
const scale = (v: number, bad: number, good: number) => clamp(((v - bad) / (good - bad)) * 100);

export interface TrainingReadiness {
  /** 0-100, or null when there is too little data. */
  score: number | null;
  /** 'garmin': the watch's own value; 'calc': computed here from the data. */
  source: 'garmin' | 'calc' | null;
  level: 'good' | 'ok' | 'low' | 'unknown';
  metric: DailyMetric | null;
}

/** Garmin's Training Readiness when the watch has it; otherwise a blend of sleep, HRV, resting HR, Body Battery and recent load. */
export function trainingReadiness(metrics: DailyMetric[], activities: Activity[], today: string): TrainingReadiness {
  const byDate = new Map(metrics.map((m) => [m.date, m]));
  const m = byDate.get(today) ?? byDate.get(addDays(today, -1)) ?? null;
  if (!m) return { score: null, source: null, level: 'unknown', metric: null };
  const levelOf = (n: number) => (n >= 70 ? 'good' : n >= 45 ? 'ok' : 'low');
  if (m.training_readiness !== null && m.training_readiness !== undefined) {
    const n = Math.round(clamp(m.training_readiness));
    return { score: n, source: 'garmin', level: levelOf(n), metric: m };
  }

  const parts: [number, number][] = []; // [score 0-100, weight]
  if (m.sleep_score) parts.push([m.sleep_score, 0.3]);
  else if (m.sleep_s) parts.push([scale(m.sleep_s / 3600, 4.5, 8), 0.3]);
  if (m.hrv_last_night && m.hrv_weekly_avg) parts.push([scale(m.hrv_last_night / m.hrv_weekly_avg, 0.65, 1.0), 0.25]);
  else if (m.hrv_status) {
    const st = m.hrv_status.toUpperCase();
    parts.push([st === 'BALANCED' ? 90 : st === 'UNBALANCED' ? 55 : st === 'LOW' || st === 'POOR' ? 30 : 70, 0.25]);
  }
  const delta = restingHrDelta(metrics, m);
  if (delta !== null) parts.push([scale(delta, 10, 0), 0.15]);
  if (m.body_battery_high !== null) parts.push([m.body_battery_high, 0.15]);
  // load: the last 3 days against the 4-week average (minutes of any sport)
  const minutes = (from: string, to: string) =>
    activities.filter((a) => a.local_date >= from && a.local_date <= to).reduce((s, a) => s + (a.duration_s ?? 0) / 60, 0);
  const chronic = minutes(addDays(m.date, -27), m.date) / 28;
  if (chronic > 5) parts.push([scale(minutes(addDays(m.date, -2), m.date) / 3 / chronic, 2, 1), 0.15]);

  if (parts.length < 2) return { score: null, source: null, level: 'unknown', metric: m };
  const w = parts.reduce((s, [, x]) => s + x, 0);
  const n = Math.round(parts.reduce((s, [v, x]) => s + v * x, 0) / w);
  return { score: n, source: 'calc', level: levelOf(n), metric: m };
}

/** Resting HR of the day minus the median of the 3 weeks before (null when either is missing). */
export function restingHrDelta(metrics: DailyMetric[], m: DailyMetric | null): number | null {
  if (!m?.resting_hr) return null;
  const base = median(metrics.filter((x) => x.date < m.date && x.date >= addDays(m.date, -21) && x.resting_hr).map((x) => x.resting_hr!));
  return base === null ? null : Math.round(m.resting_hr - base);
}

/** The newest resting heart rate of the last week: today's row often has none yet (Garmin settles it after the night). */
export function latestRestingHr(metrics: DailyMetric[], today: string): DailyMetric | null {
  const from = addDays(today, -7);
  return metrics.filter((x) => x.resting_hr && x.date <= today && x.date >= from).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

/** Which greeting fits the local hour. */
export function greetingPart(hour: number): 'morning' | 'day' | 'evening' | 'night' {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}
