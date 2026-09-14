import assert from 'node:assert/strict';
import { deadline, duration, startDate } from '../src/dates/ccc-time.mjs';

// ---- deadline(): §193/3 exclude-first-day + §193/8 holiday shift ----
// start 2026-01-15 (excluded) -> base 2026-01-16, +30 days -> 2026-02-14 (a Saturday) -> shifts to Monday 2026-02-16.
const d1 = deadline({ startDateTime: '2026-01-15T10:00', days: 30 });
assert.equal(d1.finalDeadlineISO, '2026-02-16', 'Sat 14 Feb shifts over the weekend to Mon 16 Feb');

// same case with the holiday shift turned off, for an exact round-trip check below.
const d2 = deadline({ startDateTime: '2026-01-15T10:00', days: 30, shiftFinalDayOffHolidays: false });
assert.equal(d2.finalDeadlineISO, '2026-02-14');

// §193/5 missing-day rule: 2025-01-31 + 1 month -> Feb has no 31st -> end = Feb 28 itself (no -1 day).
const d3 = deadline({ startDateTime: '2025-01-30T00:00', months: 1, shiftFinalDayOffHolidays: false });
assert.equal(d3.finalDeadlineISO, '2025-02-28', 'missing-day rule lands on the last day of the short month');

// ---- duration(): should agree with the deadline computed above ----
const dur = duration({ startDate: '2026-01-15', endDate: '2026-02-14', method: 'ccc' });
assert.equal(dur.bestUnit.unit, 'days');
assert.equal(dur.bestUnit.value, 30);
assert.equal(dur.yearsMonthsDays.days, 30);
assert.equal(dur.yearsMonthsDays.exact, true);

const durClear = duration({ startDate: '2026-09-12', endDate: '2026-09-20', method: 'clear' });
assert.equal(durClear.clearCalendarDays, 7);

// ---- startDate(): back-calculate must invert the no-shift deadline exactly ----
const back = startDate({ deadline: '2026-02-14', days: 30 });
assert.equal(back.startDate, '2026-01-15');
assert.equal(back.forwardVerification.matchesRequestedDeadline, true);

const backClear = startDate({ deadline: '2026-09-20', days: 0, weeks: 1, method: 'clear' });
// clear days: start = end - (7+1) = 2026-09-12
assert.equal(backClear.startDate, '2026-09-12');

assert.throws(() => deadline({ startDateTime: '' }), /startDateTime is required/);
assert.throws(() => duration({ startDate: '2026-02-01', endDate: '2026-01-01' }), /endDate must be/);

console.log('ok — ccc-time: deadline / duration / startDate agree with each other');
