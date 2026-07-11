/* ============================================================================
 * labour-core.js — Shared logic for the JuraTools Thai Labour Law Tools suite
 * ----------------------------------------------------------------------------
 * Pure calculation functions + date helpers + interest engine + a shared
 * "employee profile" store. Included by every individual tool and the master
 * settlement tool. Exposes a single global: window.LabourCore (alias LC).
 *
 * Legal references (Thai): Labour Protection Act B.E. 2541 (LPA) ss.9, 17, 17/1,
 * 30, 67, 70, 118, 118/1, 119, 120-122; Civil & Commercial Code ss.582-583, 224;
 * Act for the Establishment of and Procedure for Labour Court B.E. 2522 s.49.
 *
 * Reference tool only — not legal advice.
 * ========================================================================== */
(function (global) {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  var DAYS_PER_MONTH = 30;          // daily rate = monthly wage / 30 (Dika precedent)
  var DEFAULT_ANNUAL_LEAVE = 6;     // LPA s.30: 6 working days/year after 1 full year
  var RATE_LPA = 15;                // %/yr — s.9 ¶1 (pay-in-lieu, severance, unused-leave)
  var RATE_CCC = 5;                 // %/yr — CCC s.224 default (s.49 damages only)
  var SURCHARGE_RATE = 15;          // % of principal per completed 7-day period (s.9 ¶2)

  // Severance tiers — LPA s.118 (post-2019 Amendment No.7). Days of wages at the
  // last rate, keyed by completed continuous service.
  var SEVERANCE_TIERS = [
    { minDays: 120, label: '120 days but < 1 year',  days: 30  },
    { minYears: 1,  label: '1 but < 3 years',        days: 90  },
    { minYears: 3,  label: '3 but < 6 years',        days: 180 },
    { minYears: 6,  label: '6 but < 10 years',       days: 240 },
    { minYears: 10, label: '10 but < 20 years',      days: 300 },
    { minYears: 20, label: '20 years or more',       days: 400 }
  ];

  // Reasons for the employment ending — drives severance eligibility, the leave
  // fork, and which payments apply in the master tool.
  var REASONS = [
    { value: 'employer_no_fault', label: 'Employer termination (no employee fault)', th: 'นายจ้างเลิกจ้าง (ลูกจ้างไม่มีความผิด)' },
    { value: 'employer_s119',     label: 'Termination for s.119 cause',              th: 'เลิกจ้างเพราะมีความผิดตาม ม.๑๑๙' },
    { value: 'resignation',       label: 'Resignation',                             th: 'ลูกจ้างลาออก' },
    { value: 'fixed_term_end',    label: 'End of fixed-term contract',              th: 'สิ้นสุดสัญญาจ้างที่มีกำหนดระยะเวลา' },
    { value: 'retirement',        label: 'Retirement',                              th: 'เกษียณอายุ' },
    { value: 'death',             label: 'Death of employee',                       th: 'ลูกจ้างถึงแก่ความตาย' },
    { value: 'mutual',            label: 'Mutual agreement',                        th: 'ตกลงเลิกสัญญาร่วมกัน' }
  ];

  var INTEREST_BASES = [
    { value: '30/360',              label: '30/360 (default)' },
    { value: 'actual365',           label: 'Actual / 365 (daily)' },
    { value: 'wholeMonthsPlusDays', label: 'Whole months + daily remainder' },
    { value: 'fractionalMonths',    label: 'Fractional months × rate/12' }
  ];

  // Pro-rata basis for current-year annual leave (LPA s.30/s.67).
  var LEAVE_BASES = [
    { value: 'wholeMonths',    label: 'Completed whole months ÷ 12' },
    { value: 'roundMonths',    label: 'Months, part-month rounded up ÷ 12' },
    { value: 'monthsPlusDays', label: 'Whole months + part-month by days ÷ 12' },
    { value: 'days365',        label: 'Days worked ÷ 365' }
  ];

  // ── Date helpers (ported from notice-calculator.html) ─────────────────────
  function toLocal(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function parseDate(str) {
    if (!str) return null;
    var p = str.split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function toISO(d) {
    if (!d) return '';
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function formatDate(d) {
    if (!d) return '—';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatShort(d) {
    if (!d) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function lastDayOfMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }

  function daysDiff(a, b) { return Math.round((toLocal(b) - toLocal(a)) / 86400000); }

  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function addMonths(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth() + n, date.getDate());
    if (d.getDate() !== date.getDate()) d.setDate(0); // clamp overflow to last day of month
    return d;
  }

  // 30E/360 (European) day count: each month treated as 30 days.
  function days360(start, end) {
    var d1 = start.getDate(), d2 = end.getDate();
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
    return (end.getFullYear() - start.getFullYear()) * 360 +
           (end.getMonth() - start.getMonth()) * 30 +
           (d2 - d1);
  }

  function wholeMonthsBetween(a, b) {
    var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (addMonths(a, m) > b) m--;
    return Math.max(0, m);
  }

  function fractionalMonthsBetween(a, b) {
    var wm = wholeMonthsBetween(a, b);
    var anchorStart = addMonths(a, wm);
    var anchorEnd = addMonths(a, wm + 1);
    var remDays = daysDiff(anchorStart, b);
    var monthLen = daysDiff(anchorStart, anchorEnd);
    return wm + (monthLen > 0 ? remDays / monthLen : 0);
  }

  // ── Service ───────────────────────────────────────────────────────────────
  // Calendar breakdown + total days of continuous service.
  // The first day of service counts as day 1 (LPA practice / CCC s.193/3 "count
  // the first day" exception), so the span [start, end] is counted inclusively.
  function continuousService(start, end) {
    if (!start || !end || end < start) return { years: 0, months: 0, days: 0, totalDays: 0 };
    var endIncl = addDays(end, 1); // count the last day too; start = day 1
    var y = endIncl.getFullYear() - start.getFullYear();
    var m = endIncl.getMonth() - start.getMonth();
    var d = endIncl.getDate() - start.getDate();
    if (d < 0) { m--; d += lastDayOfMonth(endIncl.getFullYear(), endIncl.getMonth() - 1); }
    if (m < 0) { y--; m += 12; }
    return { years: y, months: m, days: d, totalDays: daysDiff(start, end) + 1 };
  }

  // Build a service object from a manually-entered length (years/months/days).
  function serviceFromLength(years, months, days) {
    years = years || 0; months = months || 0; days = days || 0;
    return { years: years, months: months, days: days, totalDays: years * 365 + months * 30 + days };
  }

  function serviceYearsDecimal(service) {
    return service && service.totalDays ? service.totalDays / 365 : 0;
  }

  // ── Dismissal facts — canonical dates every tool shares ────────────────────
  // s.118 ¶2: เลิกจ้าง = the employer no longer lets the employee work AND no
  // longer pays wages. So the boundary day is the last day WORKED OR PAID, not
  // merely worked (garden leave with wages running is still employment).
  // From the dismissal date and whether that day was worked or paid, derive:
  //   lastWorkingDay  — last day of employment (worked or paid as wages); wage
  //                     due through it; final day of continuous service.
  //   effectiveDate   — termination effective date, the day after; no more work
  //                     and no more wages; money falls due.
  function dismissalFacts(dismissDate, workedThatDay) {
    if (!dismissDate) return null;
    return workedThatDay
      ? { lastWorkingDay: toLocal(dismissDate), effectiveDate: addDays(dismissDate, 1) }
      : { lastWorkingDay: addDays(dismissDate, -1), effectiveDate: toLocal(dismissDate) };
  }

  // Standard one-line rendering of the derived dates (same words everywhere).
  function dismissalSummary(facts) {
    if (!facts) return '';
    return 'Last day of employment <strong>' + formatShort(facts.lastWorkingDay)
      + '</strong> · Termination effective <strong>' + formatShort(facts.effectiveDate) + '</strong>';
  }

  // ── Severance — LPA s.118 / s.119 ─────────────────────────────────────────
  function severanceTier(service) {
    if (!service || service.totalDays < 120) return { days: 0, label: 'Less than 120 days — not eligible' };
    var y = service.years;
    if (y < 1)  return { days: 30,  label: SEVERANCE_TIERS[0].label };
    if (y < 3)  return { days: 90,  label: SEVERANCE_TIERS[1].label };
    if (y < 6)  return { days: 180, label: SEVERANCE_TIERS[2].label };
    if (y < 10) return { days: 240, label: SEVERANCE_TIERS[3].label };
    if (y < 20) return { days: 300, label: SEVERANCE_TIERS[4].label };
    return { days: 400, label: SEVERANCE_TIERS[5].label };
  }

  function severanceDays(service) { return severanceTier(service).days; }

  // Pure tier math (ignores reason/eligibility).
  // pieceRateLastPeriod (optional): performance-based wages (ค่าจ้างตามผลงาน,
  // e.g. commission, flight-hour pay) actually earned in the LAST tier-days of
  // work — added on top of the time-based part (ฎีกา: 655,100 + 139,965 = 795,065).
  // dailyRateOverride: last daily wage rate when the employee is not paid
  // monthly (paid daily / weekly / per N days) — s.118 uses the last rate.
  function computeSeverance(monthlyWage, service, pieceRateLastPeriod, dailyRateOverride) {
    var tier = severanceTier(service);
    var dailyRate = (dailyRateOverride != null) ? dailyRateOverride : (monthlyWage || 0) / DAYS_PER_MONTH;
    var timeAmount = dailyRate * tier.days;
    var pieceAmount = tier.days > 0 ? (pieceRateLastPeriod || 0) : 0;
    return {
      days: tier.days, tierLabel: tier.label,
      timeAmount: timeAmount, pieceAmount: pieceAmount,
      amount: timeAmount + pieceAmount
    };
  }

  // Whether the reason for leaving entitles the employee to severance.
  function severanceEligibility(reason) {
    switch (reason) {
      case 'employer_no_fault': return { eligible: true,  note: '' };
      case 'retirement':        return { eligible: true,  note: 'Retirement is deemed termination (s.118/1) — severance due.' };
      case 'employer_s119':     return { eligible: false, note: 'No severance — terminated for s.119 cause.' };
      case 'resignation':       return { eligible: false, note: 'No severance — employee resigned.' };
      case 'fixed_term_end':    return { eligible: false, note: 'Fixed-term contracts may be exempt under s.118 ¶3–4 — verify conditions.' };
      case 'death':             return { eligible: false, note: 'Death is generally not treated as termination for severance.' };
      case 'mutual':            return { eligible: false, note: 'Mutual termination is generally not “เลิกจ้าง” — verify.' };
      default:                  return { eligible: true,  note: '' };
    }
  }

  // ── Payment in lieu of advance notice — LPA s.17/1 ────────────────────────
  // n is only used for period 'perN' (wages paid per pay period of n days).
  function dailyRateFor(wage, period, n) {
    if (period === 'daily')  return wage;
    if (period === 'weekly') return wage / 7;
    if (period === 'perN')   return wage / Math.max(1, n || 1);
    return wage / DAYS_PER_MONTH; // monthly
  }

  function computePayInLieu(wage, period, days, n) {
    return dailyRateFor(wage || 0, period, n) * (days || 0);
  }

  // ── Piece-rate wages (ค่าจ้างตามผลงานโดยคำนวณเป็นหน่วย) ────────────────────
  // Severance s.118 adds the piece wages of the LAST tier-days of work. When a
  // pay period straddles the window boundary, only the days inside the window
  // count: each period's wages are averaged per calendar day of the period and
  // attributed day by day. periods: [{start, end, amount}] (dates inclusive).
  function pieceRateInWindow(periods, winStart, winEnd) {
    var out = { total: 0, rows: [] };
    if (!winStart || !winEnd || winEnd < winStart) return out;
    var ws = toLocal(winStart), we = toLocal(winEnd);
    (periods || []).forEach(function (p) {
      if (!p || !p.start || !p.end || p.end < p.start) return;
      var ps = toLocal(p.start), pe = toLocal(p.end);
      var periodDays = daysDiff(ps, pe) + 1;
      var os = ps > ws ? ps : ws, oe = pe < we ? pe : we;
      var overlapDays = oe >= os ? daysDiff(os, oe) + 1 : 0;
      var share = (p.amount || 0) * overlapDays / periodDays;
      out.total += share;
      out.rows.push({ start: ps, end: pe, amount: p.amount || 0, periodDays: periodDays, overlapDays: overlapDays, share: share });
    });
    return out;
  }

  // Leave/holiday pay for piece-rate employees (s.60): the average daily
  // wage of the last pay period before the day off — piece wages received in
  // that period ÷ the working days in it.
  function avgDailyPieceRate(lastPeriodWages, workingDaysInPeriod) {
    if (!lastPeriodWages || !workingDaysInPeriod || workingDaysInPeriod <= 0) return 0;
    return lastPeriodWages / workingDaysInPeriod;
  }

  // Outstanding wages for the final stub period (ค่าจ้างค้างจ่าย): work done
  // after the last settled pay day is still owed as wages — time wages for the
  // days from paidThrough (exclusive) to the last day of employment (inclusive),
  // plus piece wages for output produced in that stub. Due within 3 days of
  // termination (s.70 ¶2). daysOverride: calendar days is the default; a
  // daily-paid employee may need the days actually worked instead.
  function computeUnpaidWages(o) {
    o = o || {};
    var autoDays = (o.paidThrough && o.lastWorkingDay && toLocal(o.lastWorkingDay) > toLocal(o.paidThrough))
      ? daysDiff(o.paidThrough, o.lastWorkingDay) : 0;
    var days = (o.daysOverride != null) ? o.daysOverride : autoDays;
    var timeAmount;
    if (o.basis === 'actualDays' && o.monthlyWage) {
      // Alternative measure for monthly staff: each stub day is worth the
      // monthly wage ÷ the actual days of that day's month (÷30 is the default).
      if (days === autoDays && autoDays > 0) {
        timeAmount = 0;
        var d = addDays(o.paidThrough, 1), end = toLocal(o.lastWorkingDay);
        while (d <= end) { timeAmount += o.monthlyWage / lastDayOfMonth(d.getFullYear(), d.getMonth()); d = addDays(d, 1); }
      } else {
        // Days overridden: no per-day mapping, so divide by the month of the
        // last day of employment.
        var ref = o.lastWorkingDay ? toLocal(o.lastWorkingDay) : null;
        timeAmount = days * (o.monthlyWage / (ref ? lastDayOfMonth(ref.getFullYear(), ref.getMonth()) : DAYS_PER_MONTH));
      }
    } else {
      timeAmount = days * (o.dailyRate || 0);
    }
    var pieceAmount = o.pieceStub || 0;
    return { autoDays: autoDays, days: days, timeAmount: timeAmount, pieceAmount: pieceAmount, amount: timeAmount + pieceAmount };
  }

  // ── Unused annual leave — LPA s.30 / s.67 ─────────────────────────────────
  function leaveIncludesCurrentYear(reason) {
    // Strict s.67: current-year pro-rata only when the employer terminates
    // without employee fault (retirement treated likewise).
    return reason === 'employer_no_fault' || reason === 'retirement';
  }

  // Portion of the leave year worked, by the chosen basis. Returns {fraction, detail}.
  function leaveProRata(leaveYearStart, terminationDate, basis) {
    var out = { fraction: 0, detail: '—' };
    if (!leaveYearStart || !terminationDate || terminationDate <= leaveYearStart) return out;
    var f;
    switch (basis) {
      case 'days365': {
        var d = daysDiff(leaveYearStart, terminationDate);
        f = d / 365; out.detail = d + ' days ÷ 365';
        break;
      }
      case 'roundMonths': {
        var whole = wholeMonthsBetween(leaveYearStart, terminationDate);
        var frac = fractionalMonthsBetween(leaveYearStart, terminationDate);
        var m = (frac > whole + 1e-9) ? whole + 1 : whole;
        f = m / 12; out.detail = m + ' month' + (m !== 1 ? 's' : '') + ' ÷ 12 (rounded up)';
        break;
      }
      case 'monthsPlusDays': {
        var fm = fractionalMonthsBetween(leaveYearStart, terminationDate);
        f = fm / 12; out.detail = fm.toFixed(2) + ' months ÷ 12';
        break;
      }
      case 'wholeMonths':
      default: {
        var wm = wholeMonthsBetween(leaveYearStart, terminationDate);
        f = wm / 12; out.detail = wm + ' month' + (wm !== 1 ? 's' : '') + ' ÷ 12';
        break;
      }
    }
    out.fraction = Math.min(1, f);
    return out;
  }

  function computeUnusedLeave(o) {
    o = o || {};
    var monthlyWage      = o.monthlyWage || 0;
    var annualEntitlement = (o.annualEntitlement != null) ? o.annualEntitlement : DEFAULT_ANNUAL_LEAVE;
    var takenThisYear    = o.takenThisYear || 0;
    var carriedOver      = o.carriedOver || 0;
    var leaveYearStart   = o.leaveYearStart;
    var terminationDate  = o.terminationDate;
    var includeCurrentYear = !!o.includeCurrentYear;
    var basis            = o.proRataBasis || 'wholeMonths';

    // o.dailyRate overrides wage÷30: time daily rate for non-monthly pay, plus
    // the s.60 piece-rate average of the last pay period where applicable.
    var dailyRate = (o.dailyRate != null) ? o.dailyRate : monthlyWage / DAYS_PER_MONTH;

    var pr = leaveProRata(leaveYearStart, terminationDate, basis);
    var earnedThisYear = annualEntitlement * pr.fraction;
    var currentYearDays = Math.max(0, earnedThisYear - takenThisYear);

    var payableCurrent = includeCurrentYear ? currentYearDays : 0;
    var payableDays = payableCurrent + carriedOver;

    return {
      fraction: pr.fraction,
      proRataBasis: basis,
      proRataDetail: pr.detail,
      earnedThisYear: earnedThisYear,
      currentYearDays: currentYearDays, // pro-rata net of taken, regardless of fork
      payableCurrent: payableCurrent,
      carriedDays: carriedOver,
      payableDays: payableDays,
      dailyRate: dailyRate,
      amount: dailyRate * payableDays,
      includeCurrentYear: includeCurrentYear
    };
  }

  // ── Unfair termination — Labour Court Act s.49 (discretionary benchmark) ───
  function computeS49(o) {
    o = o || {};
    var months = (o.monthsPerYear || 0) * (o.years || 0);
    return { months: months, amount: (o.monthlyWage || 0) * months };
  }

  function s49Range(o) {
    o = o || {};
    var p = o.presets || { low: 0.5, mid: 1, high: 2 };
    return {
      low:  computeS49({ monthlyWage: o.monthlyWage, years: o.years, monthsPerYear: p.low }),
      mid:  computeS49({ monthlyWage: o.monthlyWage, years: o.years, monthsPerYear: p.mid }),
      high: computeS49({ monthlyWage: o.monthlyWage, years: o.years, monthsPerYear: p.high })
    };
  }

  // ── Interest & เงินเพิ่ม engine — LPA s.9, CCC s.224 ───────────────────────
  // Default statutory due date per claim (when default / interest begins).
  // All defaults key off the TERMINATION EFFECTIVE DATE (the day after the
  // last working day). Legacy callers passing terminationDate/exitDate are
  // treated as passing that date.
  function dueDateFor(claimType, dates) {
    dates = dates || {};
    var eff = dates.effectiveDate || dates.terminationDate || dates.exitDate || null;
    switch (claimType) {
      case 'payInLieu':   return eff;                            // s.17/1 — due the day the employee is out of work
      case 'severance':   return eff;                            // due on dismissal — ผิดนัดนับแต่วันที่การเลิกจ้างมีผล
      case 'unusedLeave': return eff ? addDays(eff, 3) : null;   // s.70 ¶2 — within 3 days
      case 'wages':       return eff ? addDays(eff, 3) : null;   // s.70 ¶2 — outstanding wages within 3 days
      case 's49':         return eff;                            // editable; default = effective date
      default:            return eff;
    }
  }

  function defaultRateFor(claimType) {
    return claimType === 's49' ? RATE_CCC : RATE_LPA;
  }

  // Ordinary interest by basis. Returns {days, factor, interest, detail}.
  function computeInterest(principal, ratePct, dueDate, asOf, basis) {
    var zero = { days: 0, factor: 0, interest: 0, detail: '' };
    if (!principal || !ratePct || !dueDate || !asOf) return zero;
    if (toLocal(asOf) <= toLocal(dueDate)) return zero;
    var rate = ratePct / 100;
    var days = daysDiff(dueDate, asOf);
    var factor, detail;
    switch (basis) {
      case 'actual365':
        factor = days / 365;
        detail = days + ' days ÷ 365';
        break;
      case 'wholeMonthsPlusDays': {
        var wm = wholeMonthsBetween(dueDate, asOf);
        var rem = daysDiff(addMonths(dueDate, wm), asOf);
        factor = wm / 12 + rem / 365;
        detail = wm + ' mo ÷ 12 + ' + rem + ' days ÷ 365';
        break;
      }
      case 'fractionalMonths': {
        var fm = fractionalMonthsBetween(dueDate, asOf);
        factor = fm / 12;
        detail = fm.toFixed(3) + ' months ÷ 12';
        break;
      }
      case '30/360':
      default: {
        var d360 = days360(dueDate, asOf);
        factor = d360 / 360;
        detail = d360 + ' days (30/360) ÷ 360';
        break;
      }
    }
    return { days: days, factor: factor, interest: principal * rate * factor, detail: detail };
  }

  // เงินเพิ่ม (s.9 ¶2): 15% of principal per completed 7-day period in default.
  // Gated by the caller on proof of willful non-payment without reasonable cause.
  function computeSurcharge(principal, dueDate, asOf) {
    var zero = { days: 0, rounds: 0, amount: 0 };
    if (!principal || !dueDate || !asOf) return zero;
    if (toLocal(asOf) <= toLocal(dueDate)) return zero;
    var days = daysDiff(dueDate, asOf);
    var rounds = Math.floor(days / 7);
    return { days: days, rounds: rounds, amount: principal * (SURCHARGE_RATE / 100) * rounds };
  }

  // ── Formatting ────────────────────────────────────────────────────────────
  function fmt(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDays(n) {
    if (n == null || isNaN(n)) return '—';
    return (Math.round(n * 100) / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 });
  }

  // ── Shared employee profile ───────────────────────────────────────────────
  // { startDate, dismissalDate, workedThatDay ('yes'|'no'), monthlyWage, reason }.
  // Legacy profiles stored terminationDate (the last working day); migrate it
  // to dismissalDate + workedThatDay='yes' on read.
  var PROFILE_KEY = 'labourProfile_v1';

  function loadProfile() {
    try {
      var r = localStorage.getItem(PROFILE_KEY);
      var p = r ? JSON.parse(r) : null;
      if (p && p.terminationDate && !p.dismissalDate) {
        p.dismissalDate = p.terminationDate;
        p.workedThatDay = 'yes';
      }
      return p;
    }
    catch (e) { return null; }
  }
  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p || {})); } catch (e) {}
  }
  function clearProfile() {
    try { localStorage.removeItem(PROFILE_KEY); } catch (e) {}
  }

  // ── Export ────────────────────────────────────────────────────────────────
  var LabourCore = {
    // constants
    DAYS_PER_MONTH: DAYS_PER_MONTH, DEFAULT_ANNUAL_LEAVE: DEFAULT_ANNUAL_LEAVE,
    RATE_LPA: RATE_LPA, RATE_CCC: RATE_CCC, SURCHARGE_RATE: SURCHARGE_RATE,
    SEVERANCE_TIERS: SEVERANCE_TIERS, REASONS: REASONS, INTEREST_BASES: INTEREST_BASES, LEAVE_BASES: LEAVE_BASES,
    // dates
    toLocal: toLocal, parseDate: parseDate, toISO: toISO, formatDate: formatDate,
    formatShort: formatShort, sameDay: sameDay, lastDayOfMonth: lastDayOfMonth,
    daysDiff: daysDiff, addDays: addDays, addMonths: addMonths, days360: days360,
    wholeMonthsBetween: wholeMonthsBetween, fractionalMonthsBetween: fractionalMonthsBetween,
    // service
    continuousService: continuousService, serviceFromLength: serviceFromLength, serviceYearsDecimal: serviceYearsDecimal,
    dismissalFacts: dismissalFacts, dismissalSummary: dismissalSummary,
    // calcs
    severanceTier: severanceTier, severanceDays: severanceDays, computeSeverance: computeSeverance,
    severanceEligibility: severanceEligibility,
    dailyRateFor: dailyRateFor, computePayInLieu: computePayInLieu,
    pieceRateInWindow: pieceRateInWindow, avgDailyPieceRate: avgDailyPieceRate, computeUnpaidWages: computeUnpaidWages,
    leaveIncludesCurrentYear: leaveIncludesCurrentYear, computeUnusedLeave: computeUnusedLeave,
    computeS49: computeS49, s49Range: s49Range,
    // interest
    dueDateFor: dueDateFor, defaultRateFor: defaultRateFor,
    computeInterest: computeInterest, computeSurcharge: computeSurcharge,
    // format
    fmt: fmt, fmtDays: fmtDays,
    // profile
    loadProfile: loadProfile, saveProfile: saveProfile, clearProfile: clearProfile
  };

  global.LabourCore = LabourCore;
  global.LC = LabourCore;

})(typeof window !== 'undefined' ? window : this);
