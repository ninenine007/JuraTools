/* Clear-Days Calculator · ported from ../../../date-time-tools/clear-days.html
   Deliberately calendar-day only — no weekend/holiday auto-logic. The source
   tool leaves that call to the lawyer, and this keeps the same contract. */

const byISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function parseLocal(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

const dlong = d => d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const addDays = (date, n) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
};

/* Days strictly between two dates, both excluded. */
const diffDaysExclusive = (startInclusive, endExclusive) => {
  const ms = Date.UTC(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate())
    - Date.UTC(startInclusive.getFullYear(), startInclusive.getMonth(), startInclusive.getDate());
  return Math.round(ms / 86400000);
};

function requireDate(iso, label) {
  const d = parseLocal(iso);
  if (!d) throw new Error(`${label} is required, as YYYY-MM-DD`);
  return d;
}

/* Backward: latest permissible date so `days` clear days remain before `eventDate`. */
export function backward({ eventDate, days, moveBack = 0 }) {
  const ev = requireDate(eventDate, 'eventDate');
  const n = Math.max(1, Math.floor(Number(days) || 7));
  const back = Math.max(0, Math.floor(Number(moveBack) || 0));

  const raw = addDays(ev, -(n + 1));
  const final = addDays(raw, -back);
  const actual = diffDaysExclusive(addDays(final, 1), ev);

  return {
    requiredClearDays: n,
    rawLatestDate: byISO(raw), rawLatestDateLong: dlong(raw),
    finalDate: byISO(final), finalDateLong: dlong(final),
    actualClearDays: actual,
    pass: actual >= n
  };
}

/* Forward: earliest permissible date so `days` clear days remain after `startDate`. */
export function forward({ startDate, days, moveForward = 0 }) {
  const st = requireDate(startDate, 'startDate');
  const n = Math.max(1, Math.floor(Number(days) || 7));
  const fwd = Math.max(0, Math.floor(Number(moveForward) || 0));

  const raw = addDays(st, n + 1);
  const final = addDays(raw, fwd);
  const actual = diffDaysExclusive(addDays(st, 1), final);

  return {
    requiredClearDays: n,
    rawEarliestDate: byISO(raw), rawEarliestDateLong: dlong(raw),
    finalDate: byISO(final), finalDateLong: dlong(final),
    actualClearDays: actual,
    pass: actual >= n
  };
}

/* Check: how many clear days actually sit between two given dates. */
export function check({ earlyDate, lateDate, days }) {
  let a = requireDate(earlyDate, 'earlyDate');
  let b = requireDate(lateDate, 'lateDate');
  const n = Math.max(1, Math.floor(Number(days) || 7));
  if (a > b) [a, b] = [b, a];

  const actual = diffDaysExclusive(addDays(a, 1), b);
  return { requiredClearDays: n, actualClearDays: actual, pass: actual >= n };
}
