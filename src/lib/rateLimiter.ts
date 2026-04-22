const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 30_000; // 30 seconds

interface RateLimitState {
  attempts: number;
  lockedUntil: number | null;
}

const state: RateLimitState = { attempts: 0, lockedUntil: null };

export function checkRateLimit(): { allowed: boolean; remainingSeconds: number } {
  const now = Date.now();

  if (state.lockedUntil && now < state.lockedUntil) {
    return { allowed: false, remainingSeconds: Math.ceil((state.lockedUntil - now) / 1000) };
  }

  // Reset after cooldown expires
  if (state.lockedUntil && now >= state.lockedUntil) {
    state.attempts = 0;
    state.lockedUntil = null;
  }

  return { allowed: true, remainingSeconds: 0 };
}

export function recordAttempt(): { locked: boolean; remainingSeconds: number } {
  state.attempts += 1;

  if (state.attempts >= MAX_ATTEMPTS) {
    state.lockedUntil = Date.now() + COOLDOWN_MS;
    return { locked: true, remainingSeconds: COOLDOWN_MS / 1000 };
  }

  return { locked: false, remainingSeconds: 0 };
}

export function resetAttempts() {
  state.attempts = 0;
  state.lockedUntil = null;
}
