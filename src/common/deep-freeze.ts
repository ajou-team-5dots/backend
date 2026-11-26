/**
 * Freezes a value and everything reachable through its own properties, in place.
 * Cached results are shared by every request, so a caller that sorts or edits one in place would
 * change what the next request sees. Frozen, that mistake throws a TypeError (ESM is strict mode)
 * instead of silently corrupting the cache. Meant for JSON-like data (plain objects, arrays):
 * typed arrays are skipped (freezing one with elements throws), and Map/Set contents stay mutable.
 */
export const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return value;
  }
  // Freeze before recursing so a cycle meets an already frozen object and stops.
  Object.freeze(value);
  Object.values(value).forEach((child) => {
    deepFreeze(child);
  });
  return value;
};
