// Import Garmin .FIT activity files (or .zip exports) in the browser.

import { Decoder, Stream } from '@garmin/fitsdk';
import { unzipSync } from 'fflate';
import type { ActivityInsert } from './api';
import type { ActivityDetails, Sport } from './types';

function sportOf(sport: string): Sport {
  const s = sport.toLowerCase();
  if (s.includes('run')) return 'run';
  if (s.includes('training') || s.includes('strength')) return 'strength';
  if (s.includes('cycl')) return 'bike';
  if (s.includes('swim')) return 'swim';
  if (s.includes('walk') || s.includes('hik')) return 'walk';
  return 'other';
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ms = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : NaN);
const num = (v: unknown, digits = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : null);

/** Laps + a stream downsampled to ~10 s, same shape the Garmin sync stores. */
function extractDetails(messages: Record<string, unknown>): ActivityDetails {
  const records = (messages.recordMesgs ?? []) as Record<string, unknown>[];
  const laps = (messages.lapMesgs ?? []) as Record<string, unknown>[];
  const t0 = ms(records[0]?.timestamp ?? laps[0]?.startTime);
  const samples: ActivityDetails['samples'] = [];
  let lastT = -Infinity;
  for (const r of records) {
    const t = (ms(r.timestamp) - t0) / 1000;
    if (!Number.isFinite(t) || t - lastT < 10) continue;
    lastT = t;
    samples.push({
      t: Math.round(t),
      d: num(r.distance) ?? (samples.length ? samples[samples.length - 1].d : 0),
      hr: num(r.heartRate),
      v: num(r.enhancedSpeed ?? r.speed, 2),
      alt: num(r.enhancedAltitude ?? r.altitude, 1),
    });
  }
  return {
    laps: laps.map((l) => ({
      startS: Math.round((ms(l.startTime) - t0) / 1000) || 0,
      durationS: num(l.totalTimerTime ?? l.totalElapsedTime) ?? 0,
      distanceM: num(l.totalDistance) ?? 0,
      avgSpeed: num(l.enhancedAvgSpeed ?? l.avgSpeed, 3),
      avgHr: num(l.avgHeartRate),
      maxHr: num(l.maxHeartRate),
      cadence: num(l.avgRunningCadence ?? l.avgCadence),
      intensity: typeof l.intensity === 'string' ? l.intensity : null,
    })),
    samples,
  };
}

function parseFit(bytes: Uint8Array, userId: string): ActivityInsert {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  if (!decoder.isFIT()) throw new Error('not a FIT file');
  const { messages } = decoder.read();
  const session = (messages.sessionMesgs as Record<string, unknown>[] | undefined)?.[0];
  if (!session) throw new Error('no activity session found');
  const start = session.startTime instanceof Date ? session.startTime : new Date(String(session.startTime));
  const sport = String(session.sport ?? 'generic');
  const subSport = String(session.subSport ?? '');
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const timer = n(session.totalTimerTime);
  return {
    user_id: userId,
    source: 'fit',
    external_id: `${start.getTime()}-${sport}`,
    name: `${sport.replace(/_/g, ' ')}${subSport && subSport !== 'generic' ? ` (${subSport.replace(/_/g, ' ')})` : ''}`,
    sport: subSport.includes('strength') ? 'strength' : sportOf(sport),
    sub_type: subSport || sport,
    start_time: start.toISOString(),
    local_date: localDate(start),
    duration_s: Math.round(n(session.totalElapsedTime) ?? timer ?? 0) || null,
    moving_s: timer ? Math.round(timer) : null,
    distance_m: n(session.totalDistance),
    avg_hr: n(session.avgHeartRate),
    max_hr: n(session.maxHeartRate),
    elevation_gain_m: n(session.totalAscent),
    calories: n(session.totalCalories),
    training_load: null,
    aerobic_te: n(session.totalTrainingEffect),
    vo2max: null,
    details: extractDetails(messages as Record<string, unknown>),
  };
}

export async function parseActivityFiles(files: File[], userId: string) {
  const rows: ActivityInsert[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const entries: [string, Uint8Array][] = file.name.toLowerCase().endsWith('.zip')
      ? Object.entries(unzipSync(bytes)).filter(([name]) => name.toLowerCase().endsWith('.fit'))
      : [[file.name, bytes]];
    if (!entries.length) errors.push(`${file.name}: no .fit files inside`);
    for (const [name, data] of entries) {
      try {
        rows.push(parseFit(data, userId));
      } catch (e) {
        errors.push(`${name}: ${(e as Error).message}`);
      }
    }
  }
  return { rows, errors };
}
