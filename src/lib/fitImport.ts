// Import Garmin .FIT activity files (or .zip exports) in the browser.

import { Decoder, Stream } from '@garmin/fitsdk';
import { unzipSync } from 'fflate';
import type { ActivityInsert } from './api';
import type { Sport } from './types';

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
