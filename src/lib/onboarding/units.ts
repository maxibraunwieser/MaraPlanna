// Metric <-> imperial for the setup. Everything is stored in km, kg and cm; these functions only change what is shown and typed.

import type { Units } from '../types';
import { currentLang } from '../i18n';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 };
}
export const ftInToCm = (ft: number, inch: number) => Math.round((ft * 12 + inch) * CM_PER_IN);

/** Imperial where people measure runs in miles and weigh themselves in pounds (the US); metric elsewhere. */
export function defaultUnits(locale: string | undefined): Units {
  return /^en-(US|LR|MM)\b/i.test(locale ?? '') || /^my\b/i.test(locale ?? '') ? 'mi' : 'km';
}

/** Height as whole metres and the centimetres on top ("1 m 75 cm"). */
export function cmToMeters(cm: number): { m: number; cm: number } {
  const total = Math.round(cm);
  return { m: Math.floor(total / 100), cm: total % 100 };
}
export const metersToCm = (m: number, cm: number) => Math.round(m * 100 + cm);

/** "1.75 m" or "5′ 9″". */
export function heightText(cm: number, unit: 'm' | 'ft'): string {
  if (unit === 'ft') {
    const x = cmToFtIn(cm);
    return `${x.ft}′ ${x.inch}″`;
  }
  const text = (Math.round(cm) / 100).toFixed(2);
  return `${currentLang() === 'de' ? text.replace('.', ',') : text} m`;
}

/** Round to one decimal without trailing noise. */
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** "5:30" or "5:30/km" -> seconds per unit; null when it is not a pace. */
export function parsePace(text: string): number | null {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*(?:\/\s*(?:km|mi))?\s*$/i.exec(text);
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && s > 0 ? s : null;
}

/** Pace per km <-> pace per the chosen unit. */
export const paceToUnit = (sPerKm: number, units: Units) => (units === 'mi' ? sPerKm * 1.609344 : sPerKm);
export const paceFromUnit = (s: number, units: Units) => (units === 'mi' ? s / 1.609344 : s);

export function fmtPaceText(sPerUnit: number): string {
  const total = Math.round(sPerUnit);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
