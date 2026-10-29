// Laps + streams of activities, loaded once and shared by every view. The
// execution score depends on them (rep detection, decoupling), so the dashboard,
// the weekly report and the full analysis must score a run from the same data.

import { useEffect, useState } from 'react';
import type { Activity, ActivityDetails } from './types';
import * as api from './api';

/** id → details; null = there are none (manual entry, download failed). */
const cache = new Map<string, ActivityDetails | null>();
const jobs = new Map<string, Promise<void>>();
const errors = new Map<string, string>();

/** Make sure details for these activities are loaded (stored ones in one query, missing Garmin runs downloaded). */
export async function loadDetails(list: Activity[]) {
  const todo = list.filter((a) => !a.details && !cache.has(a.id) && !jobs.has(a.id));
  if (todo.length) {
    const job = (async () => {
      let stored = new Map<string, ActivityDetails>();
      try {
        stored = await api.fetchStoredDetails(todo.map((a) => a.id));
      } catch (e) {
        for (const a of todo) errors.set(a.id, (e as Error).message);
      }
      const download: Activity[] = [];
      for (const a of todo) {
        if (stored.has(a.id)) cache.set(a.id, stored.get(a.id)!);
        else if (a.source === 'garmin' && a.sport === 'run' && !errors.has(a.id)) download.push(a);
        else cache.set(a.id, null);
      }
      // Not downloaded yet: fetch from Garmin once (the Edge Function stores it), 3 at a time.
      for (let i = 0; i < download.length; i += 3) {
        await Promise.all(
          download.slice(i, i + 3).map(async (a) => {
            try {
              cache.set(a.id, await api.fetchActivityDetails(a));
            } catch (e) {
              errors.set(a.id, (e as Error).message);
              cache.set(a.id, null);
            }
          }),
        );
      }
    })();
    for (const a of todo) jobs.set(a.id, job);
    try {
      await job;
    } finally {
      for (const a of todo) jobs.delete(a.id);
    }
  }
  await Promise.all(list.map((a) => jobs.get(a.id)).filter(Boolean));
}

const resolved = (a: Activity) => !!a.details || cache.has(a.id);

/** Loaded details of an activity (null if it has none or they are not loaded yet). */
export const detailsFor = (a: Activity): ActivityDetails | null => a.details ?? cache.get(a.id) ?? null;

/** Details for the given activities; `ready` once every one is known (loaded or confirmed missing). */
export function useActivityDetails(list: Activity[]) {
  const key = list.map((a) => a.id).join(',');
  const [, rerender] = useState(0);
  useEffect(() => {
    if (list.every(resolved)) return;
    let alive = true;
    loadDetails(list).finally(() => alive && rerender((n) => n + 1));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    ready: list.every(resolved),
    detailsOf: detailsFor,
    errorOf: (a: Activity) => errors.get(a.id) ?? null,
  };
}
