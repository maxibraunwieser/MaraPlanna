// Garmin .FIT workout file (loaded on demand – the FIT SDK is large).
// Copy it to GARMIN/NewFiles on the watch over USB and it appears under Training → Workouts.
// Encoding follows the FIT SDK "Encode a Workout" cookbook: main fields hold raw values
// (time in ms, distance in cm, speed in mm/s).

import { Encoder, Profile, type FileIdMesg, type WorkoutMesg, type WorkoutStepMesg } from '@garmin/fitsdk';
import type { WatchStep, WatchWorkout } from './watch';

export function toFit(w: WatchWorkout, created = new Date()): Uint8Array {
  const steps: WorkoutStepMesg[] = [];

  const add = (s: WatchStep) =>
    steps.push({
      messageIndex: steps.length,
      wktStepName: s.name,
      intensity: s.intensity,
      durationType: s.distanceM ? 'distance' : s.seconds ? 'time' : 'open',
      durationValue: s.distanceM ? Math.round(s.distanceM * 100) : s.seconds ? Math.round(s.seconds * 1000) : undefined,
      targetType: s.pace ? 'speed' : 'open',
      targetValue: 0,
      // Custom speed range: low = slow end, high = fast end.
      customTargetValueLow: s.pace ? Math.round(1_000_000 / s.pace[1]) : undefined,
      customTargetValueHigh: s.pace ? Math.round(1_000_000 / s.pace[0]) : undefined,
    });

  for (const it of w.items) {
    if ('repeat' in it) {
      const from = steps.length;
      it.steps.forEach(add);
      steps.push({ messageIndex: steps.length, durationType: 'repeatUntilStepsCmplt', durationValue: from, targetValue: it.repeat });
    } else {
      add(it);
    }
  }

  const fileId: FileIdMesg = {
    type: 'workout',
    manufacturer: 'development',
    product: 0,
    serialNumber: Math.floor(created.getTime() / 1000) >>> 0,
    timeCreated: created,
  };
  const workout: WorkoutMesg = { wktName: w.name.slice(0, 40), sport: 'running', subSport: 'generic', numValidSteps: steps.length };
  const enc = new Encoder();
  enc.onMesg(Profile.MesgNum.FILE_ID, fileId);
  enc.onMesg(Profile.MesgNum.WORKOUT, workout);
  for (const s of steps) enc.onMesg(Profile.MesgNum.WORKOUT_STEP, s);
  return enc.close();
}

export function fitFileName(date: string, title: string) {
  return `${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.fit`;
}
