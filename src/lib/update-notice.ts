// A page is out of date when the server reports a different build than the one the page was served with.
// Either id being empty (it could not be read) means "do not know", so nothing is shown.
export function isOutOfDate(loadedId: string, serverId: string | null | undefined): boolean {
  return Boolean(loadedId) && Boolean(serverId) && loadedId !== serverId;
}

export const UPDATE_CHECK_MS = 2 * 60 * 1000;
export const UPDATE_SNOOZE_MS = 10 * 60 * 1000;
