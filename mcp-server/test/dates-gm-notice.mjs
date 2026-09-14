import assert from 'node:assert/strict';
import { noticePeriod, registrationDeadline } from '../src/dates/gm-notice.mjs';

const byNotice = noticePeriod({ noticeDate: '2026-09-01', gap: 7 });
assert.equal(byNotice.earliestMeetingDate, '2026-09-09');

const byMeeting = noticePeriod({ meetingDate: '2026-09-09', gap: 7 });
assert.equal(byMeeting.latestNoticeDate, '2026-09-01');

const both = noticePeriod({ noticeDate: '2026-09-01', meetingDate: '2026-09-09', gap: 7 });
assert.equal(both.actualClearDays, 7);
assert.equal(both.pass, true);

const bothFail = noticePeriod({ noticeDate: '2026-09-01', meetingDate: '2026-09-08', gap: 7 });
assert.equal(bothFail.actualClearDays, 6);
assert.equal(bothFail.pass, false);

assert.throws(() => noticePeriod({ noticeDate: '2026-09-01', gap: 10 }), /7 \(ordinary\) or 14/);
assert.throws(() => noticePeriod({ gap: 7 }), /provide noticeDate or meetingDate/);

// no roll requested
const regPlain = registrationDeadline({ meetingDate: '2026-09-09' });
assert.equal(regPlain.rawDeadline, '2026-09-23');
assert.equal(regPlain.deadline, '2026-09-23');
assert.equal(regPlain.rolled, false);

// 2026-09-05 is a Saturday; raw deadline (+14) = 2026-09-19, also a Saturday.
const regWeekend = registrationDeadline({ meetingDate: '2026-09-05', rollMode: 'weekend' });
assert.equal(regWeekend.rawDeadline, '2026-09-19');
assert.equal(regWeekend.deadline, '2026-09-21', 'Sat 19 -> Sun 20 -> Mon 21');
assert.equal(regWeekend.rolled, true);

// same case, but Monday the 21st is also marked unavailable -> rolls one further to Tuesday.
const regUnavail = registrationDeadline({
  meetingDate: '2026-09-05', rollMode: 'weekend_unavail', unavailableDates: ['2026-09-21']
});
assert.equal(regUnavail.deadline, '2026-09-22');

assert.throws(() => registrationDeadline({ meetingDate: '2026-09-05', rollMode: 'bogus' }), /rollMode must be/);

console.log('ok — gm-notice: notice-period math and registration roll-forward both correct');
