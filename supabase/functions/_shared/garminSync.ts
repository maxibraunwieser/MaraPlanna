// Which stored Garmin activities were deleted in Garmin Connect? Shared by the "garmin"
// Edge Function (Deno) and the app's tests (Node).
//
// The sync asks Garmin for every activity in a date window. What we have stored in that
// window but Garmin no longer lists was deleted there, and is removed here too.

export interface StoredActivity {
  id: string;
  external_id: string;
}

/** Above this many removals (and more than half of what is stored) the answer looks like a Garmin hiccup, not a clean-up. */
export const MASS_REMOVAL_MIN = 5;

export interface GoneResult {
  /** Our ids of the activities to remove. */
  ids: string[];
  /** Why nothing was removed although something looked missing. */
  warning?: string;
}

/**
 * @param stored    our Garmin activities inside the fetched window (the boundary day left out by the caller)
 * @param seen      external ids Garmin returned for that window
 * @param truncated the list hit the paging limit, so it is not complete
 */
export function goneActivities(stored: StoredActivity[], seen: Set<string>, truncated: boolean): GoneResult {
  const gone = stored.filter((a) => !seen.has(a.external_id));
  if (gone.length === 0) return { ids: [] };
  if (truncated) return { ids: [], warning: 'Garmin activity list was cut off, deleted activities were not checked' };
  if (gone.length >= MASS_REMOVAL_MIN && gone.length > stored.length / 2) {
    return { ids: [], warning: `Garmin listed ${seen.size} of ${stored.length} stored activities, nothing was removed (try syncing again)` };
  }
  return { ids: gone.map((a) => a.id) };
}
