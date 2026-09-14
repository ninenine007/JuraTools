import { z } from 'zod';
import * as clearDays from './dates/clear-days.mjs';
import * as gmNotice from './dates/gm-notice.mjs';
import * as cccTime from './dates/ccc-time.mjs';

const NOT_LEGAL_ADVICE = 'This simulates the general time-counting rules; it is not legal advice.';
const json = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const errorResult = err => ({ content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });

function tool(fn) {
  return async args => { try { return json(fn(args)); } catch (err) { return errorResult(err); } };
}

const holidayFields = {
  offSaturday: z.boolean().optional().describe('Treat Saturday as a non-working day (default true)'),
  offSunday: z.boolean().optional().describe('Treat Sunday as a non-working day (default true)'),
  holidays: z.array(z.string()).optional().describe('Public holidays as YYYY-MM-DD strings')
};

export function registerDateTools(server) {
  /* ---------------- Clear Days ---------------- */
  server.registerTool('calculate_clear_days', {
    title: 'Clear-Days Calculator',
    description:
      'Calendar-day "clear days" arithmetic — the count strictly between two dates, excluding ' +
      'both endpoints, used throughout Thai law for notice periods. Three modes: "backward" ' +
      '(given an event date and required clear days, find the latest permissible date to act by), ' +
      '"forward" (given a start date, find the earliest permissible event date), and "check" ' +
      '(given two dates, report the actual clear-day count and whether it meets a requirement). ' +
      'Deliberately does not apply any weekend/holiday adjustment — that judgment is left to you.',
    inputSchema: {
      mode: z.enum(['backward', 'forward', 'check']).describe('Which calculation to run'),
      days: z.number().describe('Required number of clear days'),
      eventDate: z.string().optional().describe('backward mode: the fixed event date, YYYY-MM-DD'),
      moveBack: z.number().optional().describe('backward mode: explore moving the result back this many extra days (default 0)'),
      startDate: z.string().optional().describe('forward mode: the fixed start date, YYYY-MM-DD'),
      moveForward: z.number().optional().describe('forward mode: explore moving the result forward this many extra days (default 0)'),
      earlyDate: z.string().optional().describe('check mode: the earlier of the two candidate dates, YYYY-MM-DD'),
      lateDate: z.string().optional().describe('check mode: the later of the two candidate dates, YYYY-MM-DD')
    }
  }, tool(args => {
    if (args.mode === 'backward') return clearDays.backward(args);
    if (args.mode === 'forward') return clearDays.forward(args);
    return clearDays.check(args);
  }));

  /* ---------------- GM Notice (CCC s.1175) ---------------- */
  server.registerTool('calculate_gm_notice_period', {
    title: 'GM Notice Period (CCC s.1175)',
    description:
      'Shareholder-notice clear-days math for a Thai general meeting under CCC s.1175: 7 clear ' +
      'days for an ordinary resolution, 14 for a special resolution. Give noticeDate to get the ' +
      'earliest valid GM date, meetingDate to get the latest valid notice date, or both to check ' +
      'whether a candidate pair actually satisfies the gap. Notice math only — it does not check ' +
      'the notice against a board-meeting date; use calculate_agm_registration_deadline separately ' +
      'for the post-meeting registration deadline. ' + NOT_LEGAL_ADVICE,
    inputSchema: {
      gap: z.union([z.literal(7), z.literal(14)]).describe('Required clear days: 7 (ordinary) or 14 (special resolution)'),
      noticeDate: z.string().optional().describe('Shareholder notice dispatch date, YYYY-MM-DD'),
      meetingDate: z.string().optional().describe('General meeting date, YYYY-MM-DD')
    }
  }, tool(gmNotice.noticePeriod));

  server.registerTool('calculate_agm_registration_deadline', {
    title: 'AGM/EGM Registration Deadline',
    description:
      'Last day to register a shareholders\' resolution with the Thai company registrar: 14 days ' +
      'after the meeting, excluding the meeting day itself. Optionally rolls the deadline forward ' +
      'past weekends and/or specific unavailable dates, since registration offices do not accept ' +
      'filings then. ' + NOT_LEGAL_ADVICE,
    inputSchema: {
      meetingDate: z.string().describe('Date of the meeting/resolution, YYYY-MM-DD'),
      rollMode: z.enum(['none', 'weekend', 'weekend_unavail']).optional()
        .describe('"none" (default): use the raw +14 date as-is. "weekend": roll forward past Sat/Sun. "weekend_unavail": also roll past unavailableDates'),
      unavailableDates: z.array(z.string()).optional().describe('Specific dates the registrar is closed, YYYY-MM-DD — only used with rollMode "weekend_unavail"')
    }
  }, tool(gmNotice.registrationDeadline));

  /* ---------------- CCC §§193/2–193/8 ---------------- */
  server.registerTool('calculate_ccc_deadline', {
    title: 'CCC Deadline Calculator (§§193/2–193/8)',
    description:
      'Compute the final legal deadline from a start date/time plus a period, under Thai Civil ' +
      'and Commercial Code §§193/2–193/8: excludes the start day by default (§193/3, with the ' +
      'business-opening-time exception available), calendar-based months/years with the ' +
      'missing-day rule (§193/5), a fractional-year conversion (§193/6), an optional period ' +
      'extension (§193/7), and shifting the final day off a weekend/holiday (§193/8). Returns the ' +
      'deadline plus a step-by-step derivation. ' + NOT_LEGAL_ADVICE,
    inputSchema: {
      startDateTime: z.string().describe('Start date and time, YYYY-MM-DDTHH:MM'),
      years: z.number().optional().describe('Whole years to add (default 0)'),
      months: z.number().optional().describe('Whole months to add (default 0)'),
      weeks: z.number().optional().describe('Whole weeks to add (default 0)'),
      days: z.number().optional().describe('Whole days to add (default 0)'),
      hours: z.number().optional().describe('Hours to add — triggers §193/2 sub-day counting (default 0)'),
      minutes: z.number().optional().describe('Minutes to add (default 0)'),
      seconds: z.number().optional().describe('Seconds to add (default 0)'),
      yearFraction: z.number().optional().describe('§193/6: a fractional year (e.g. 0.4), converted to months then days'),
      dayRounding: z.enum(['ceil', 'floor', 'round']).optional().describe('Rounding for the §193/6 day remainder (default "ceil")'),
      applyBusinessOpeningException: z.boolean().optional()
        .describe('§193/3 exception: if the act occurred at/after business opening time, count the start day itself (default false)'),
      businessOpeningTime: z.string().optional().describe('Business opening time, HH:MM (default "08:30")'),
      daysAreWorkingDays: z.boolean().optional().describe('Count the "days" period in working days, skipping non-working days (default false)'),
      shiftFinalDayOffHolidays: z.boolean().optional().describe('§193/8: shift the final day forward if it falls on a non-working day (default true)'),
      ...holidayFields,
      extension: z.object({
        years: z.number().optional(), months: z.number().optional(), days: z.number().optional(),
        startMode: z.enum(['auto1937', 'explicit']).optional().describe('"auto1937" (default): start the day after the original deadline (§193/7). "explicit": use explicitStart'),
        explicitStart: z.string().optional().describe('Required if startMode is "explicit", YYYY-MM-DDTHH:MM'),
        includeFirstDay: z.boolean().optional().describe('Count the first day of the extension period (default true)')
      }).optional().describe('§193/7 period extension, applied after the base period')
    }
  }, tool(cccTime.deadline));

  server.registerTool('calculate_ccc_duration', {
    title: 'CCC Duration Calculator (§§193/2–193/8)',
    description:
      'Compute how much time sits between two dates under Thai CCC counting rules. method "ccc" ' +
      '(default) returns both a best-fit single unit and a years/months/days decomposition, ' +
      'excluding the start day by default (§193/3). method "clear" instead excludes both endpoints ' +
      '(the "clear days" convention). workingDaysOnly additionally counts only working days, ' +
      'skipping weekends/holidays. ' + NOT_LEGAL_ADVICE,
    inputSchema: {
      startDate: z.string().describe('Start date, YYYY-MM-DD'),
      endDate: z.string().describe('End date, YYYY-MM-DD (must not be before startDate)'),
      method: z.enum(['ccc', 'clear']).optional().describe('Counting convention (default "ccc")'),
      includeFirstDay: z.boolean().optional().describe('method "ccc" only: count the start day itself rather than excluding it (default false)'),
      workingDaysOnly: z.boolean().optional().describe('Also count only working days (default false)'),
      ...holidayFields
    }
  }, tool(cccTime.duration));

  server.registerTool('calculate_ccc_start_date', {
    title: 'CCC Back-Calculate Start Date (§§193/2–193/8)',
    description:
      'The reverse of calculate_ccc_deadline: given a deadline you must hit and a period, work out ' +
      'the latest start date that produces it. method "ccc" (default) reverses the calendar-based ' +
      'counting (§193/3, §193/5) and includes a forward-verification check; method "clear" reverses ' +
      'plain clear-days counting. ' + NOT_LEGAL_ADVICE,
    inputSchema: {
      deadline: z.string().describe('The known deadline, YYYY-MM-DD'),
      method: z.enum(['ccc', 'clear']).optional().describe('Counting convention (default "ccc")'),
      years: z.number().optional().describe('method "ccc": whole years in the period (default 0)'),
      months: z.number().optional().describe('method "ccc": whole months in the period (default 0)'),
      weeks: z.number().optional().describe('Whole weeks in the period (default 0)'),
      days: z.number().optional().describe('method "ccc": whole days in the period (default 0)'),
      includeFirstDay: z.boolean().optional().describe('method "ccc": count the start day itself rather than excluding it (default false)')
    }
  }, tool(cccTime.startDate));
}
