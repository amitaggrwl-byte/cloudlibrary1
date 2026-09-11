const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateReturnScore, DAY_MS } = require('../functions/scoring');

const NOW = Date.UTC(2026, 8, 11, 12);

test('qualifying on-time returns earn half a point', () => {
  const result = calculateReturnScore({ outcome: 'returned', lentAtMs: NOW - 3 * DAY_MS, dueAtMs: NOW + DAY_MS, returnedAtMs: NOW });
  assert.equal(result.points, 0.5);
  assert.equal(result.nextStreak, 1);
});

test('returns within 48 hours are neutral and do not build a streak', () => {
  const result = calculateReturnScore({ outcome: 'returned', lentAtMs: NOW - DAY_MS, dueAtMs: NOW + DAY_MS, returnedAtMs: NOW, previousStreak: 4 });
  assert.equal(result.points, 0);
  assert.equal(result.nextStreak, 0);
});

test('every fifth consecutive qualifying return earns one bonus', () => {
  const result = calculateReturnScore({ outcome: 'returned', lentAtMs: NOW - 3 * DAY_MS, dueAtMs: NOW + DAY_MS, returnedAtMs: NOW, previousStreak: 4 });
  assert.equal(result.returnPoints, 0.5);
  assert.equal(result.streakBonus, 0.5);
  assert.equal(result.points, 1);
  assert.equal(result.nextStreak, 5);
});

test('ordinary late returns lose half a point and reset the streak', () => {
  const result = calculateReturnScore({ outcome: 'returned', lentAtMs: NOW - 20 * DAY_MS, dueAtMs: NOW - DAY_MS, returnedAtMs: NOW, previousStreak: 4 });
  assert.equal(result.points, -0.5);
  assert.equal(result.nextStreak, 0);
});

test('returns more than 30 days late lose one point', () => {
  const result = calculateReturnScore({ outcome: 'returned', lentAtMs: NOW - 50 * DAY_MS, dueAtMs: NOW - 31 * DAY_MS, returnedAtMs: NOW, previousStreak: 4 });
  assert.equal(result.points, -1);
  assert.equal(result.veryLate, true);
});

test('lost books lose two points and reset the streak', () => {
  const result = calculateReturnScore({ outcome: 'lost', lentAtMs: NOW - 3 * DAY_MS, dueAtMs: NOW + DAY_MS, returnedAtMs: NOW, previousStreak: 4 });
  assert.equal(result.points, -2);
  assert.equal(result.nextStreak, 0);
});

test('the supplied return-request time controls whether a return was timely', () => {
  const requestedBeforeDueDate = NOW - 3 * DAY_MS;
  const result = calculateReturnScore({ outcome: 'returned', lentAtMs: NOW - 20 * DAY_MS, dueAtMs: NOW - 2 * DAY_MS, returnedAtMs: requestedBeforeDueDate });
  assert.equal(result.points, 0.5);
  assert.equal(result.onTime, true);
});
