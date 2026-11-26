/**
 * Freezes a value and everything reachable through its own properties, in place.
 * Cached results are shared by every request, so a caller that sorts or edits one in place would
 * change what the next request sees. Frozen, that mistake throws a TypeError (ESM is strict mode)
 * instead of silently corrupting the cache. Meant for JSON-like data (plain objects, arrays):
 * typed arrays are skipped (freezing one with elements throws), and Map/Set contents stay mutable.
 * An object that is already frozen is still walked: its children may not be. The cost is a full walk
 * of the tree on every store, even when it is all frozen already (small for our JSON sizes).
 */
export const deepFreeze = <T>(value: T, seen: WeakSet<object> = new WeakSet()): T => {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  // Remember before recursing so a cycle stops here.
  seen.add(value);
  if (ArrayBuffer.isView(value)) {
    return value;
  }
  Object.freeze(value);
  Object.values(value).forEach((child) => {
    deepFreeze(child, seen);
  });
  return value;
};
