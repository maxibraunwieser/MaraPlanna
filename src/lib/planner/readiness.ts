// Daily readiness from Garmin wellness data (resting HR, HRV, sleep, Body Battery).

import type { DailyMetric } from '../types';
import { addDays } from './dates';
import { median } from './fitness';

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
      reasons.push(`Resting HR ${Math.round(diff)} bpm above your baseline`);
    } else if (diff >= 5) {
      strain += 1;
      reasons.push(`Resting HR ${Math.round(diff)} bpm above your baseline`);
    }
  }
  const status = (m.hrv_status ?? '').toUpperCase();
  if (status === 'LOW' || status === 'POOR' || status === 'UNBALANCED') {
    strain += 1;
    reasons.push(`HRV status: ${status.toLowerCase()}`);
  } else if (m.hrv_last_night && m.hrv_weekly_avg && m.hrv_last_night < m.hrv_weekly_avg * 0.85) {
    strain += 1;
    reasons.push('HRV well below your weekly average');
  }
  if (m.sleep_s && m.sleep_s < 6 * 3600) {
    strain += 1;
    reasons.push(`Short sleep (${(m.sleep_s / 3600).toFixed(1)} h)`);
  } else if (m.sleep_score && m.sleep_score < 50) {
    strain += 1;
    reasons.push(`Low sleep score (${m.sleep_score})`);
  }
  if (m.body_battery_high !== null && m.body_battery_high < 40) {
    strain += 1;
    reasons.push(`Body Battery only reached ${m.body_battery_high}`);
  }
  return { level: strain >= 2 ? 'low' : strain === 1 ? 'ok' : 'good', reasons, metric: m };
}
