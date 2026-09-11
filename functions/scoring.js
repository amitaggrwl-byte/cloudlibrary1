'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const ON_TIME_STREAK_INTERVAL = 5;
const VERY_LATE_DAYS = 30;

function calculateReturnScore({ outcome, lentAtMs, dueAtMs, returnedAtMs, previousStreak = 0 }) {
  const effectiveReturnedAt = Number(returnedAtMs);
  const effectiveLentAt = Number.isFinite(Number(lentAtMs)) ? Number(lentAtMs) : effectiveReturnedAt;
  const effectiveDueAt = Number.isFinite(Number(dueAtMs)) ? Number(dueAtMs) : Number.POSITIVE_INFINITY;
  const heldFor = Math.max(0, effectiveReturnedAt - effectiveLentAt);
  const onTime = effectiveReturnedAt <= effectiveDueAt;
  const veryLate = outcome === 'returned' && effectiveReturnedAt > effectiveDueAt + VERY_LATE_DAYS * DAY_MS;
  const qualifyingOnTimeReturn = outcome === 'returned' && heldFor >= 2 * DAY_MS && onTime;
  const nextStreak = qualifyingOnTimeReturn ? Math.max(0, Number(previousStreak || 0)) + 1 : 0;
  const returnPoints = outcome === 'lost'
    ? -2
    : (qualifyingOnTimeReturn ? 0.5 : (onTime ? 0 : (veryLate ? -1 : -0.5)));
  const streakBonus = qualifyingOnTimeReturn && nextStreak % ON_TIME_STREAK_INTERVAL === 0 ? 0.5 : 0;

  return {
    heldFor,
    onTime,
    veryLate,
    qualifyingOnTimeReturn,
    nextStreak,
    returnPoints,
    streakBonus,
    points: returnPoints + streakBonus
  };
}

module.exports = { calculateReturnScore, DAY_MS, ON_TIME_STREAK_INTERVAL, VERY_LATE_DAYS };
