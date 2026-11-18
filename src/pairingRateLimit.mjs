/**
 * @fileoverview Sliding-window attempt limiter for 6-digit pairing-code
 * redemption (issue #26). Caps failed guesses per key (IP + code) to blunt
 * brute force against the 10^6 code space.
 */

/**
 * Creates a sliding-window attempt limiter.
 *
 * @param {{ maxAttempts?: number, windowMs?: number }} [options]
 * @returns {{ checkAndRecord: (key: string, nowMs?: number) => { allowed: boolean, remaining: number } }}
 */
export function createPairingAttemptLimiter({ maxAttempts = 10, windowMs = 600_000 } = {}) {
  const attempts = new Map();
  const cleanWindow = Number(windowMs) > 0 ? Number(windowMs) : 600_000;
  const cleanMax = Number(maxAttempts) > 0 ? Number(maxAttempts) : 10;
  return {
    checkAndRecord(key, nowMs = Date.now()) {
      const cleanKey = String(key ?? '').trim() || 'unknown';
      const now = Number(nowMs);
      const history = (attempts.get(cleanKey) || []).filter((ts) => now - ts < cleanWindow);
      if (history.length >= cleanMax) {
        attempts.set(cleanKey, history);
        return { allowed: false, remaining: 0 };
      }
      history.push(now);
      attempts.set(cleanKey, history);
      return { allowed: true, remaining: Math.max(0, cleanMax - history.length) };
    },
  };
}
