/* Thai GM Notice & Registration Calculator (CCC s.1175) · ported from
   ../../../date-time-tools/gm-ccc.html */

const MS = 86400000;
const toEpochDay = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / MS);
const fromEpochDay = ed => { const dt = new Date(ed * MS); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }; };

function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  return toEpochDay(y, m, d);
}
const pad = n => String(n).padStart(2, '0');
const formatISO = ed => { if (ed == null) return ''; const { y, m, d } = fromEpochDay(ed); return `${y}-${pad(m)}-${pad(d)}`; };
const fmtLong = ed => { const dt = new Date(ed * MS); return dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); };
const addDays = (ed, n) => ed == null ? null : ed + n;
const diffDays = (a, b) => b - a;
const isWeekend = ed => { const w = new Date(ed * MS).getUTCDay(); return w === 0 || w === 6; };

/* Earliest GM date such that `gap` clear days sit between notice and the GM. */
function earliestMeetingFromNotice(noticeED, gap) {
  return noticeED == null ? null : addDays(noticeED, gap + 1);
}
/* Latest notice date such that `gap` clear days sit before the GM. */
function latestNoticeFromMeeting(meetED, gap) {
  return meetED == null ? null : addDays(meetED, -(gap + 1));
}
function clearDayInterval(noticeED, meetED) {
  return (noticeED == null || meetED == null) ? null : Math.max(0, diffDays(noticeED, meetED) - 1);
}
/* CCC: registration due within 14 days, excluding the resolution day itself. */
function registrationLastDay(resED) {
  return resED == null ? null : addDays(resED, 14);
}
function rollForward(ed, mode, unavailableSet) {
  if (ed == null) return null;
  if (mode === 'none') return ed;
  let cur = ed;
  const needSkip = d => {
    if (mode === 'weekend') return isWeekend(d);
    if (mode === 'weekend_unavail') return isWeekend(d) || unavailableSet.has(d);
    return false;
  };
  while (needSkip(cur)) cur = addDays(cur, 1);
  return cur;
}

function requireISO(iso, label) {
  const ed = parseISO(iso);
  if (ed == null) throw new Error(`${label} is required, as YYYY-MM-DD`);
  return ed;
}

/* Notice-period math only (no BOD-meeting cross-check — see the full
   gm-ccc.html tool for that). Give either noticeDate or meetingDate (or both,
   to check a candidate pair) and the required gap: 7 (ordinary) or 14
   (special resolution) clear days under CCC s.1175. */
export function noticePeriod({ noticeDate, meetingDate, gap }) {
  const g = Number(gap);
  if (g !== 7 && g !== 14) throw new Error('gap must be 7 (ordinary) or 14 (special resolution) clear days');
  const notice = noticeDate ? requireISO(noticeDate, 'noticeDate') : null;
  const meeting = meetingDate ? requireISO(meetingDate, 'meetingDate') : null;
  if (notice == null && meeting == null) throw new Error('provide noticeDate or meetingDate (or both)');

  if (notice != null && meeting != null) {
    const actual = clearDayInterval(notice, meeting);
    return {
      requiredClearDays: g, noticeDate: formatISO(notice), meetingDate: formatISO(meeting),
      actualClearDays: actual, pass: actual >= g
    };
  }
  if (notice != null) {
    const earliest = earliestMeetingFromNotice(notice, g);
    return { requiredClearDays: g, noticeDate: formatISO(notice), earliestMeetingDate: formatISO(earliest), earliestMeetingDateLong: fmtLong(earliest) };
  }
  const latest = latestNoticeFromMeeting(meeting, g);
  return { requiredClearDays: g, meetingDate: formatISO(meeting), latestNoticeDate: formatISO(latest), latestNoticeDateLong: fmtLong(latest) };
}

/* Last day to register a resolution: +14 days from the meeting, excluding
   the meeting day itself, with an optional roll-forward past weekends/listed
   unavailable dates (registration offices don't accept filings then). */
export function registrationDeadline({ meetingDate, rollMode = 'none', unavailableDates = [] }) {
  if (!['none', 'weekend', 'weekend_unavail'].includes(rollMode))
    throw new Error("rollMode must be 'none', 'weekend', or 'weekend_unavail'");
  const meeting = requireISO(meetingDate, 'meetingDate');
  const unavailable = new Set(unavailableDates.map(d => requireISO(d, 'unavailableDates[]')));

  const raw = registrationLastDay(meeting);
  const deadline = rollForward(raw, rollMode, unavailable);

  return {
    meetingDate: formatISO(meeting),
    rawDeadline: formatISO(raw), rawDeadlineLong: fmtLong(raw),
    deadline: formatISO(deadline), deadlineLong: fmtLong(deadline),
    rolled: deadline !== raw
  };
}
