import assert from 'node:assert/strict';
import { backward, forward, check } from '../src/dates/clear-days.mjs';

// 2026-09-20 is a Sunday; clear-days.mjs deliberately ignores weekday.
const b = backward({ eventDate: '2026-09-20', days: 7 });
assert.equal(b.rawLatestDate, '2026-09-12');
assert.equal(b.finalDate, '2026-09-12');
assert.equal(b.actualClearDays, 7, '13,14,...,19 = 7 clear days before the event');
assert.equal(b.pass, true);

const bMoved = backward({ eventDate: '2026-09-20', days: 7, moveBack: 2 });
assert.equal(bMoved.finalDate, '2026-09-10');
assert.equal(bMoved.actualClearDays, 9);
assert.equal(bMoved.pass, true);

const f = forward({ startDate: '2026-09-12', days: 7 });
assert.equal(f.rawEarliestDate, '2026-09-20');
assert.equal(f.actualClearDays, 7);
assert.equal(f.pass, true);

const c = check({ earlyDate: '2026-09-12', lateDate: '2026-09-20', days: 7 });
assert.equal(c.actualClearDays, 7);
assert.equal(c.pass, true);

// swapped order must self-correct
const cSwapped = check({ earlyDate: '2026-09-20', lateDate: '2026-09-12', days: 7 });
assert.deepEqual(cSwapped, c);

const cFail = check({ earlyDate: '2026-09-12', lateDate: '2026-09-19', days: 7 });
assert.equal(cFail.actualClearDays, 6);
assert.equal(cFail.pass, false);

assert.throws(() => backward({ eventDate: '', days: 7 }), /eventDate is required/);

console.log('ok — clear-days: backward/forward/check all consistent');
