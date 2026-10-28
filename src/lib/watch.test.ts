import { describe, expect, it } from 'vitest';
import { Decoder, Stream } from '@garmin/fitsdk';
import type { Paces, Step } from './types';
import { toIntervalsText, watchWorkout } from './watch';
import { toFit } from './watchFit';

const paces: Paces = { recovery: [380, 410], easy: [340, 370], long: [345, 375], marathon: 300, threshold: 275, interval: 250, repetition: 235 };

const intervals: Step[] = [
  { type: 'run', label: 'Warm-up', zone: 'easy', distanceKm: 2.5 },
  { type: 'run', label: 'Interval', zone: 'interval', distanceKm: 1, repeat: 5, recoveryKm: 0.4 },
  { type: 'run', label: 'Cool-down', zone: 'easy', distanceKm: 1.5 },
];
const easyStrides: Step[] = [
  { type: 'run', label: 'Easy', zone: 'easy', distanceKm: 8 },
  { type: 'run', label: 'Strides (20 s fast, relaxed)', zone: 'repetition', durationMin: 1 / 3, repeat: 6, recoveryMin: 1 },
];

describe('watch workout', () => {
  it('maps plan steps to warm-up, repeat block and cool-down with pace ranges', () => {
    const w = watchWorkout({ title: 'Intervals 5 × 1000 m', steps: intervals }, paces);
    expect(w.items).toHaveLength(3);
    expect(w.items[0]).toMatchObject({ intensity: 'warmup', distanceM: 2500, pace: [340, 370] });
    expect(w.items[1]).toMatchObject({ repeat: 5, steps: [{ distanceM: 1000, pace: [246, 254] }, { intensity: 'recovery', distanceM: 400 }] });
    expect(w.items[2]).toMatchObject({ intensity: 'cooldown', distanceM: 1500 });
  });

  it('writes a valid Garmin FIT workout file', () => {
    const bytes = toFit(watchWorkout({ title: 'Intervals 5 × 1000 m', steps: intervals }, paces), new Date('2026-10-28T06:00:00Z'));
    const decoder = new Decoder(Stream.fromByteArray(bytes));
    expect(decoder.isFIT()).toBe(true);
    expect(decoder.checkIntegrity()).toBe(true);
    const { messages, errors } = decoder.read();
    expect(errors).toHaveLength(0);
    expect(messages.fileIdMesgs?.[0].type).toBe('workout');
    expect(messages.workoutMesgs?.[0]).toMatchObject({ wktName: 'Intervals 5 × 1000 m', sport: 'running', numValidSteps: 5 });
    const s = messages.workoutStepMesgs ?? [];
    expect(s).toHaveLength(5);
    expect(s[0]).toMatchObject({ intensity: 'warmup', durationType: 'distance', durationDistance: 2500, targetType: 'speed' });
    // 4:06–4:14 /km → 4.065 / 3.937 m/s
    expect(s[1].customTargetSpeedHigh).toBeCloseTo(1000 / 246, 2);
    expect(s[1].customTargetSpeedLow).toBeCloseTo(1000 / 254, 2);
    expect(s[2]).toMatchObject({ intensity: 'recovery', durationDistance: 400, targetType: 'open' });
    expect(s[3]).toMatchObject({ durationType: 'repeatUntilStepsCmplt', durationStep: 1, repeatSteps: 5 });
    expect(s[4]).toMatchObject({ intensity: 'cooldown', durationDistance: 1500 });
  });

  it('writes intervals.icu workout text', () => {
    const text = toIntervalsText(watchWorkout({ title: 'Intervals', steps: intervals }, paces), paces);
    expect(text).toBe(
      ['Warmup', '- Warm-up 2.5km 6:10-5:40/km Pace', '', '5x', '- Interval 1km 4:14-4:06/km Pace', '- Recovery 0.4km 8:20-6:20/km Pace', '', 'Cooldown', '- Cool-down 1.5km 6:10-5:40/km Pace'].join('\n'),
    );
    const strides = toIntervalsText(watchWorkout({ title: 'Easy run + strides', steps: easyStrides }, paces), paces);
    expect(strides).toContain('6x\n- Stride 20s 4:03-3:47/km Pace\n- Recovery 1m 8:20-6:20/km Pace');
    expect(strides.startsWith('- Easy 8km 6:10-5:40/km Pace')).toBe(true);
  });
});
