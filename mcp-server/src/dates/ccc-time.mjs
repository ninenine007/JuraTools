/* CCC Time & Deadline Calculator (§§193/2–193/8) · ported from
   ../../../date-time-tools/CCC-datetime-calculator-v2.html
   Not legal advice — this simulates the general time-counting rules. */

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = n => String(n).padStart(2, '0');

function parseLocalDateTime(s) {
  if (!s) return null;
  const [d, t = '00:00'] = String(s).split('T');
  const [y, m, da] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  if (!y || !m || !da) return null;
  return new Date(y, m - 1, da, hh || 0, mm || 0, 0, 0);
}
function parseLocalDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} (${dayNames[d.getDay()]})`;
const fmtDateTime = d => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const clone = d => new Date(d.getTime());
const toDateOnly = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const addDays = (d, n) => { const x = clone(d); x.setDate(x.getDate() + n); return x; };
const addSeconds = (d, s) => { const x = clone(d); x.setSeconds(x.getSeconds() + s); return x; };
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ---------- non-working days (§193/8) ---------- */
function nwConfig({ offSaturday = true, offSunday = true, holidays = [] } = {}) {
  return { offSat: offSaturday, offSun: offSunday, holidays: new Set(holidays) };
}
function isNonWorkingDay(d, cfg) {
  const dow = d.getDay();
  if (cfg.offSat && dow === 6) return true;
  if (cfg.offSun && dow === 0) return true;
  if (cfg.holidays.has(ymd(d))) return true;
  return false;
}
function moveToNextWorkingDay(d, cfg, apply) {
  if (!apply) return d;
  let x = toDateOnly(d);
  if (!isNonWorkingDay(x, cfg)) return d;
  let guard = 0;
  while (isNonWorkingDay(x, cfg) && guard < 500) { x = addDays(x, 1); guard++; }
  return x;
}
function describeNW(cfg) {
  const off = []; if (cfg.offSat) off.push('Sat'); if (cfg.offSun) off.push('Sun');
  return `${off.length ? off.join('/') + ' off' : 'no weekly days off'}, ${cfg.holidays.size} holiday(s) listed`;
}
/* Nth working day counting from countBase (countBase itself counts if working). */
function endAfterWorkingDays(countBase, days, cfg) {
  if (days === 0) return clone(countBase);
  let x = toDateOnly(countBase), counted = 0, guard = 0;
  while (guard < 36600) {
    if (!isNonWorkingDay(x, cfg)) counted++;
    if (counted === days) return x;
    x = addDays(x, 1); guard++;
  }
  return x;
}
function countWorkingDaysInclusive(from, to, cfg) {
  let x = toDateOnly(from); const e = toDateOnly(to); let n = 0, guard = 0;
  while (x.getTime() <= e.getTime() && guard < 73200) { if (!isNonWorkingDay(x, cfg)) n++; x = addDays(x, 1); guard++; }
  return n;
}

/* ---------- calendar math (§§193/5, 193/6) ---------- */
function addMonthsExact(d, months) {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const target = m + months, ty = y + Math.floor(target / 12), tm = ((target % 12) + 12) % 12;
  const last = new Date(ty, tm + 1, 0).getDate();
  const matched = day <= last; const rd = matched ? day : last;
  return { date: new Date(ty, tm, rd, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()), matched };
}
/* months/years end = (countBase + N months) - 1 day; unless no matching day
   in the target month (§193/5 missing-day rule) -> end = that month's last day (no -1). */
function endAfterMonths(countBase, months) {
  if (months === 0) return clone(countBase);
  const { date: anniv, matched } = addMonthsExact(countBase, months);
  return matched ? addDays(anniv, -1) : anniv;
}
const endAfterYears = (countBase, years) => endAfterMonths(countBase, years * 12);
const endAfterWeeks = (countBase, weeks) => weeks === 0 ? clone(countBase) : addDays(countBase, weeks * 7 - 1);
const endAfterDays = (countBase, days) => days === 0 ? clone(countBase) : addDays(countBase, days - 1);
/* §193/6: fraction of a year -> whole months + days, using a 30-day month. */
function convertYearFractionToMonthsDays(yearsFrac, roundMode = 'ceil') {
  const totalMonths = yearsFrac * 12, mInt = Math.floor(totalMonths), mFrac = totalMonths - mInt;
  let days = mFrac * 30;
  days = roundMode === 'ceil' ? Math.ceil(days) : roundMode === 'floor' ? Math.floor(days) : Math.round(days);
  return { addMonths: mInt, addDays: days };
}

function requireDateTime(s, label) {
  const d = parseLocalDateTime(s);
  if (!d) throw new Error(`${label} is required, as YYYY-MM-DDTHH:MM`);
  return d;
}
function requireDate(s, label) {
  const d = parseLocalDate(s);
  if (!d) throw new Error(`${label} is required, as YYYY-MM-DD`);
  return d;
}

/* ================================================================
   1. DEADLINE — start date/time + period -> final legal last day
   ================================================================ */
export function deadline(args) {
  const startDT = requireDateTime(args.startDateTime, 'startDateTime');
  const { years: yrs = 0, months: mos = 0, weeks: wks = 0, days = 0, hours: hrs = 0, minutes: mins = 0, seconds: secs = 0 } = args;
  const yrsFrac = Number(args.yearFraction || 0);
  const roundMode = args.dayRounding || 'ceil';

  const includeFirst = Boolean(args.applyBusinessOpeningException);
  const [bH, bM] = String(args.businessOpeningTime || '08:30').split(':').map(Number);
  let includeFirstDay = includeFirst;
  if (includeFirst) {
    const h = startDT.getHours(), m = startDT.getMinutes();
    includeFirstDay = (h > bH || (h === bH && m >= bM));
  }

  const apply193_8 = args.shiftFinalDayOffHolidays !== false;
  const cfgNW = nwConfig(args);
  const daysWorking = Boolean(args.daysAreWorkingDays);

  const extYears = Number(args.extension?.years || 0);
  const extMonths = Number(args.extension?.months || 0);
  const extDays = Number(args.extension?.days || 0);
  const extStartMode = args.extension?.startMode || 'auto1937';
  const extStartDT = args.extension?.explicitStart ? requireDateTime(args.extension.explicitStart, 'extension.explicitStart') : null;
  let extIncludeFirst = args.extension?.includeFirstDay !== false;

  const steps = [];
  let cur = clone(startDT);

  const countBaseForFirstStage = () => includeFirstDay ? toDateOnly(startDT) : addDays(toDateOnly(startDT), 1);
  const nextStageBaseFrom = prevEnd => addDays(toDateOnly(prevEnd), 1);

  if (yrs > 0) { const base = countBaseForFirstStage(); const endY = endAfterYears(base, yrs); steps.push(`Years: start ${fmtDate(base)} → end ${fmtDate(endY)} (§193/5, §193/3)`); cur = endY; }
  if (mos > 0) { const base = yrs > 0 ? nextStageBaseFrom(cur) : countBaseForFirstStage(); const endM = endAfterMonths(base, mos); steps.push(`Months: start ${fmtDate(base)} → end ${fmtDate(endM)} (§193/5, §193/3)`); cur = endM; }
  if (yrsFrac > 0) {
    const conv = convertYearFractionToMonthsDays(yrsFrac, roundMode);
    if (conv.addMonths) { const baseM = (yrs > 0 || mos > 0) ? nextStageBaseFrom(cur) : countBaseForFirstStage(); const m2 = endAfterMonths(baseM, conv.addMonths); steps.push(`Year fraction → ${conv.addMonths} month(s): start ${fmtDate(baseM)} → end ${fmtDate(m2)} (§193/6→§193/5)`); cur = m2; }
    if (conv.addDays) { const baseD = nextStageBaseFrom(cur); const d2 = endAfterDays(baseD, conv.addDays); steps.push(`…then ${conv.addDays} day(s): start ${fmtDate(baseD)} → end ${fmtDate(d2)} (§193/6→§193/3)`); cur = d2; }
  }
  if (wks > 0) { const base = (yrs > 0 || mos > 0 || yrsFrac > 0) ? nextStageBaseFrom(cur) : countBaseForFirstStage(); const wEnd = endAfterWeeks(base, wks); steps.push(`Weeks: start ${fmtDate(base)} → end ${fmtDate(wEnd)} (§193/5, §193/3)`); cur = wEnd; }
  if (days > 0) {
    const base = (yrs > 0 || mos > 0 || yrsFrac > 0 || wks > 0) ? nextStageBaseFrom(cur) : countBaseForFirstStage();
    if (daysWorking) {
      const dEnd = endAfterWorkingDays(base, days, cfgNW);
      steps.push(`Days (working days): start ${fmtDate(base)} → end ${fmtDate(dEnd)} — ${days} working day(s), skipping non-working days per §193/8 settings (${describeNW(cfgNW)})`);
      cur = dEnd;
    } else {
      const dEnd = endAfterDays(base, days);
      steps.push(`Days: start ${fmtDate(base)} → end ${fmtDate(dEnd)} (§193/3)`);
      cur = dEnd;
    }
  }
  const usedSubDay = (hrs || mins || secs) > 0;
  if (usedSubDay) { const tEnd = addSeconds(cur, hrs * 3600 + mins * 60 + secs); steps.push(`Sub-day: +${hrs}h ${mins}m ${secs}s → ${fmtDateTime(tEnd)} (§193/2)`); cur = tEnd; }

  const baseEndPreShift = clone(cur);
  steps.push(`Original last day before §193/8: ${usedSubDay ? fmtDateTime(baseEndPreShift) : fmtDate(baseEndPreShift)}`);

  const hasExt = (extYears || extMonths || extDays) > 0;
  if (!hasExt) {
    if (apply193_8 && !usedSubDay) {
      const shifted = moveToNextWorkingDay(baseEndPreShift, cfgNW, true);
      if (ymd(shifted) !== ymd(baseEndPreShift)) { steps.push(`Final day holiday → shift: ${fmtDate(shifted)} (§193/8)`); cur = shifted; }
    }
    return { finalDeadline: usedSubDay ? fmtDateTime(cur) : fmtDate(cur), finalDeadlineISO: ymd(cur), steps };
  }

  let extStart;
  if (extStartMode === 'explicit') {
    if (!extStartDT) throw new Error('extension.explicitStart is required when extension.startMode is "explicit"');
    extStart = toDateOnly(extStartDT);
    steps.push(`Extension: explicit start = ${fmtDate(extStart)}`);
  } else {
    extStart = addDays(toDateOnly(baseEndPreShift), 1);
    extIncludeFirst = true;
    steps.push(`Extension: start = day after original last day → ${fmtDate(extStart)} (§193/7)`);
  }

  let curExt = clone(extStart);
  const extBaseFirst = extIncludeFirst ? toDateOnly(extStart) : addDays(toDateOnly(extStart), 1);

  if (extYears > 0) { const y2 = endAfterYears(extBaseFirst, extYears); steps.push(`Extension years: start ${fmtDate(extBaseFirst)} → end ${fmtDate(y2)} (§193/5, §193/3)`); curExt = y2; }
  if (extMonths > 0) { const baseM = extYears > 0 ? addDays(toDateOnly(curExt), 1) : extBaseFirst; const m3 = endAfterMonths(baseM, extMonths); steps.push(`Extension months: start ${fmtDate(baseM)} → end ${fmtDate(m3)} (§193/5, §193/3)`); curExt = m3; }
  if (extDays > 0) { const baseD = (extYears > 0 || extMonths > 0) ? addDays(toDateOnly(curExt), 1) : extBaseFirst; const d3 = endAfterDays(baseD, extDays); steps.push(`Extension days: start ${fmtDate(baseD)} → end ${fmtDate(d3)} (§193/3)`); curExt = d3; }

  if (apply193_8) { const shiftedExt = moveToNextWorkingDay(curExt, cfgNW, true); if (ymd(shiftedExt) !== ymd(curExt)) { steps.push(`Extension last day holiday → shift: ${fmtDate(shiftedExt)} (§193/8)`); curExt = shiftedExt; } }

  return { finalDeadline: fmtDate(curExt), finalDeadlineISO: ymd(curExt), steps };
}

/* ================================================================
   2. DURATION — how much time sits between two dates
   ================================================================ */
const baseFromStart_CCC = (startDate, includeFirst) => { const s = toDateOnly(startDate); return includeFirst ? s : addDays(s, 1); };
const stageNextBase = prevEnd => addDays(toDateOnly(prevEnd), 1);

function maxYearsCCC(base, end) { let y = 0; while (endAfterYears(base, y + 1).getTime() <= end.getTime()) y++; return y; }
function maxMonthsCCC(base, end) { let m = 0; while (endAfterMonths(base, m + 1).getTime() <= end.getTime()) m++; return m; }
function maxDaysCCC(base, end) { let d = 0; while (endAfterDays(base, d + 1).getTime() <= end.getTime()) d++; return d; }

function durationCCC_YMD(start, end, includeFirst = false) {
  const s = baseFromStart_CCC(start, includeFirst);
  if (end < s) return { years: 0, months: 0, days: 0, exact: end.getTime() === s.getTime() };
  const years = maxYearsCCC(s, end);
  const endY = years > 0 ? endAfterYears(s, years) : s;
  const base2 = years > 0 ? stageNextBase(endY) : s;
  const months = maxMonthsCCC(base2, end);
  const endM = months > 0 ? endAfterMonths(base2, months) : base2;
  const base3 = months > 0 ? stageNextBase(endM) : base2;
  const days = maxDaysCCC(base3, end);
  const endD = days > 0 ? endAfterDays(base3, days) : base3;
  return { years, months, days, exact: endD.getTime() === end.getTime() };
}
function durationCCC_bestUnit(start, end, includeFirst = false) {
  const s = baseFromStart_CCC(start, includeFirst);
  if (end < s) return { unit: 'days', value: 0 };
  let y = 0; while (endAfterYears(s, y + 1) <= end) y++;
  if (y > 0 && endAfterYears(s, y).getTime() === end.getTime()) return { unit: 'years', value: y };
  let m = 0; while (endAfterMonths(s, m + 1) <= end) m++;
  if (m > 0 && endAfterMonths(s, m).getTime() === end.getTime()) return { unit: 'months', value: m };
  const diffDays = Math.round((toDateOnly(end) - toDateOnly(s)) / 86400000);
  return { unit: 'days', value: diffDays + 1 };
}
function durationClearDays(start, end) {
  const s = toDateOnly(start), e = toDateOnly(end);
  const diffDays = Math.round((e - s) / 86400000);
  return Math.max(0, diffDays - 1);
}

export function duration(args) {
  const s = requireDate(args.startDate, 'startDate');
  const e = requireDate(args.endDate, 'endDate');
  if (e < s) throw new Error('endDate must be the same as or after startDate');

  const method = args.method || 'ccc';
  if (!['ccc', 'clear'].includes(method)) throw new Error("method must be 'ccc' or 'clear'");
  const working = Boolean(args.workingDaysOnly);
  const includeFirst = Boolean(args.includeFirstDay);

  if (method === 'clear') {
    const days = durationClearDays(s, e);
    if (!working) return { method: 'clear', clearCalendarDays: days };
    const cfg = nwConfig(args);
    const wd = (toDateOnly(e) - toDateOnly(s)) / 86400000 >= 2
      ? countWorkingDaysInclusive(addDays(toDateOnly(s), 1), addDays(toDateOnly(e), -1), cfg)
      : 0;
    return { method: 'clear', workingDaysOnly: true, clearWorkingDays: wd, clearCalendarDays: days };
  }

  if (working) {
    const cfg = nwConfig(args);
    const from = includeFirst ? toDateOnly(s) : addDays(toDateOnly(s), 1);
    const wd = toDateOnly(e).getTime() >= from.getTime() ? countWorkingDaysInclusive(from, e, cfg) : 0;
    const cal = Math.max(0, Math.round((toDateOnly(e) - from) / 86400000) + 1);
    return { method: 'ccc', workingDaysOnly: true, workingDays: wd, calendarDaysCounted: cal, includeFirstDay: includeFirst };
  }

  const best = durationCCC_bestUnit(s, e, includeFirst);
  const ymdResult = durationCCC_YMD(s, e, includeFirst);
  return { method: 'ccc', includeFirstDay: includeFirst, bestUnit: best, yearsMonthsDays: ymdResult };
}

/* ================================================================
   3. START DATE — back-calculate the start from a known deadline
   ================================================================ */
function forwardEndOnly(startDate, dur, includeFirst) {
  let base = includeFirst ? toDateOnly(startDate) : addDays(toDateOnly(startDate), 1);
  let any = false, end = base;
  if (dur.years > 0) { end = endAfterYears(base, dur.years); base = addDays(toDateOnly(end), 1); any = true; }
  if (dur.months > 0) { if (!any) base = includeFirst ? toDateOnly(startDate) : addDays(toDateOnly(startDate), 1); end = endAfterMonths(base, dur.months); base = addDays(toDateOnly(end), 1); any = true; }
  if (dur.weeks > 0) { if (!any) base = includeFirst ? toDateOnly(startDate) : addDays(toDateOnly(startDate), 1); end = endAfterWeeks(base, dur.weeks); base = addDays(toDateOnly(end), 1); any = true; }
  if (dur.days > 0) { if (!any) base = includeFirst ? toDateOnly(startDate) : addDays(toDateOnly(startDate), 1); end = endAfterDays(base, dur.days); any = true; }
  return any ? toDateOnly(end) : (includeFirst ? toDateOnly(startDate) : addDays(toDateOnly(startDate), 1));
}
function invertMonthsEndToBase(endDate, months) {
  if (months === 0) return toDateOnly(endDate);
  const anniv = addDays(toDateOnly(endDate), 1);
  const total = anniv.getFullYear() * 12 + anniv.getMonth() - months;
  const by = Math.floor(total / 12), bm = ((total % 12) + 12) % 12;
  const lastBase = new Date(by, bm + 1, 0).getDate();
  const wantDay = anniv.getDate();
  const bd = wantDay <= lastBase ? wantDay : lastBase;
  return new Date(by, bm, bd, 0, 0, 0, 0);
}
const invertYearsEndToBase = (endDate, years) => invertMonthsEndToBase(endDate, years * 12);

export function startDate(args) {
  const end = requireDate(args.deadline, 'deadline');
  const method = args.method || 'ccc';
  if (!['ccc', 'clear'].includes(method)) throw new Error("method must be 'ccc' or 'clear'");

  if (method === 'clear') {
    const totalDays = Number(args.weeks || 0) * 7 + Number(args.days || 0);
    const start = addDays(toDateOnly(end), -(totalDays + 1));
    return { method: 'clear', startDate: ymd(start), startDateLong: fmtDate(start) };
  }

  const yrs = Number(args.years || 0), mos = Number(args.months || 0), wks = Number(args.weeks || 0), dys = Number(args.days || 0);
  const includeFirst = Boolean(args.includeFirstDay);
  const steps = [];
  let prevEnd = toDateOnly(end);

  let baseD = null;
  if (dys > 0) { baseD = addDays(prevEnd, -(dys - 1)); steps.push(`Days: end ${fmtDate(prevEnd)} ⇒ base ${fmtDate(baseD)} (reverse of §193/3)`); prevEnd = addDays(baseD, -1); }
  let baseW = null;
  if (wks > 0) { baseW = addDays(prevEnd, -(wks * 7 - 1)); steps.push(`Weeks: end ${fmtDate(prevEnd)} ⇒ base ${fmtDate(baseW)} (reverse of §193/5 weeks)`); prevEnd = addDays(baseW, -1); }
  let baseM = null;
  if (mos > 0) { baseM = invertMonthsEndToBase(prevEnd, mos); steps.push(`Months: end ${fmtDate(prevEnd)} ⇒ base ${fmtDate(baseM)} (reverse of §193/5)`); prevEnd = addDays(baseM, -1); }
  let baseY = null;
  if (yrs > 0) { baseY = invertYearsEndToBase(prevEnd, yrs); steps.push(`Years: end ${fmtDate(prevEnd)} ⇒ base ${fmtDate(baseY)} (reverse of §193/5)`); prevEnd = addDays(baseY, -1); }

  const baseFirst = yrs > 0 ? baseY : mos > 0 ? baseM : wks > 0 ? baseW : dys > 0 ? baseD : null;

  if (!baseFirst) {
    const startZero = includeFirst ? toDateOnly(end) : addDays(toDateOnly(end), -1);
    return {
      method: 'ccc', startDate: ymd(startZero), startDateLong: fmtDate(startZero),
      note: `Zero duration: last day equals ${includeFirst ? 'the start day' : 'the day after the start day'} (§193/3).`
    };
  }

  const start = includeFirst ? baseFirst : addDays(baseFirst, -1);
  const verify = forwardEndOnly(start, { years: yrs, months: mos, weeks: wks, days: dys }, includeFirst);

  return {
    method: 'ccc', startDate: ymd(start), startDateLong: fmtDate(start), steps,
    forwardVerification: { computedDeadline: ymd(verify), matchesRequestedDeadline: ymd(verify) === ymd(end) }
  };
}
