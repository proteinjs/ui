/**
 * formatRelativeDate — the long form and its compact variant.
 *
 * The long form is the row-metadata date most list rows carry: "Today at 8:32 PM" /
 * "Yesterday at 8:32 PM" / "Sep 8, 2026". The compact form is the same clock in the fewest
 * characters a narrow row can afford — the time alone today, the word alone yesterday, month
 * and day within the current year, the full date beyond it — so a phone-width row keeps its
 * title room. Both forms share ONE set of day boundaries, taken in the viewer's own zone
 * (a moment in local mode): 23:59 yesterday is "Yesterday" one minute later, whatever UTC says.
 *
 * The clock is faked (jest's modern timers), and the suite's zone is pinned by the package's
 * jest globalSetup (test/timezone.js: UTC+12, no daylight saving) so a local-day/UTC-day
 * confusion is observable on every machine — CI runs in UTC, where the two coincide.
 */
import { formatRelativeDate } from '../src/formatters';

/** 2026-09-16 09:00 in the pinned zone (UTC+12) = 2026-09-15T21:00:00Z: the UTC day is still the 15th. */
const NOW = new Date(2026, 8, 16, 9, 0, 0);

const local = (year: number, monthIndex: number, day: number, hour = 0, minute = 0) =>
  new Date(year, monthIndex, day, hour, minute, 0);

describe('formatRelativeDate', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('runs in the pinned zone (UTC+12) — otherwise the boundary cases below cannot bite', () => {
    expect(NOW.getTimezoneOffset()).toBe(-720);
    expect(NOW.toISOString()).toBe('2026-09-15T21:00:00.000Z');
  });

  describe('the long form (the default)', () => {
    it('today: "Today at" the time', () => {
      expect(formatRelativeDate(local(2026, 8, 16, 20, 32))).toBe('Today at 8:32 PM');
    });

    it('yesterday: "Yesterday at" the time', () => {
      expect(formatRelativeDate(local(2026, 8, 15, 20, 32))).toBe('Yesterday at 8:32 PM');
    });

    it('earlier this year: the full date, year included', () => {
      expect(formatRelativeDate(local(2026, 8, 8, 20, 32))).toBe('Sep 8, 2026');
    });

    it('an earlier year: the full date', () => {
      expect(formatRelativeDate(local(2025, 8, 8, 20, 32))).toBe('Sep 8, 2025');
    });

    it('is unchanged by the compact form existing: form "long" is the default', () => {
      expect(formatRelativeDate(local(2026, 8, 16, 20, 32), { form: 'long' })).toBe('Today at 8:32 PM');
      expect(formatRelativeDate(local(2026, 8, 8, 20, 32), { form: 'long' })).toBe('Sep 8, 2026');
    });
  });

  describe('the compact form', () => {
    const compact = (date: Date) => formatRelativeDate(date, { form: 'compact' });

    it('today: the time alone', () => {
      expect(compact(local(2026, 8, 16, 20, 32))).toBe('8:32 PM');
      expect(compact(local(2026, 8, 16, 0, 5))).toBe('12:05 AM');
    });

    it('yesterday: the word alone', () => {
      expect(compact(local(2026, 8, 15, 20, 32))).toBe('Yesterday');
    });

    it('earlier this year: month and day, no year', () => {
      expect(compact(local(2026, 8, 8, 20, 32))).toBe('Sep 8');
      expect(compact(local(2026, 0, 1, 0, 0))).toBe('Jan 1');
    });

    it('an earlier year: the full date', () => {
      expect(compact(local(2025, 8, 8, 20, 32))).toBe('Sep 8, 2025');
      expect(compact(local(2025, 11, 31, 23, 59))).toBe('Dec 31, 2025');
    });

    it('honors the format options the long form honors', () => {
      expect(formatRelativeDate(local(2026, 8, 16, 20, 32), { form: 'compact', todayFormat: 'HH:mm' })).toBe('20:32');
      expect(formatRelativeDate(local(2026, 8, 8, 20, 32), { form: 'compact', thisYearFormat: 'D MMM' })).toBe('8 Sep');
      expect(formatRelativeDate(local(2025, 8, 8, 20, 32), { form: 'compact', defaultFormat: 'YYYY-MM-DD' })).toBe(
        '2025-09-08'
      );
    });
  });

  describe('the day boundaries are the viewer’s (local), in both forms', () => {
    // 23:59 yesterday, local. In UTC it is 11:59Z on the 15th — the SAME UTC day as now
    // (21:00Z on the 15th): a UTC-day comparison would call it today.
    const lateYesterday = local(2026, 8, 15, 23, 59);
    // 00:05 today, local. In UTC it is 12:05Z on the 15th — again now's UTC day, and the
    // UTC day BEFORE the local one.
    const earlyToday = local(2026, 8, 16, 0, 5);

    it('one minute before local midnight is yesterday', () => {
      expect(formatRelativeDate(lateYesterday)).toBe('Yesterday at 11:59 PM');
      expect(formatRelativeDate(lateYesterday, { form: 'compact' })).toBe('Yesterday');
    });

    it('five minutes after local midnight is today', () => {
      expect(formatRelativeDate(earlyToday)).toBe('Today at 12:05 AM');
      expect(formatRelativeDate(earlyToday, { form: 'compact' })).toBe('12:05 AM');
    });

    it('the year boundary is local too: 23:59 on Dec 31 last year stays last year', () => {
      // 2025-12-31 23:59 local = 2025-12-31T11:59Z — the same calendar year in both, but a
      // zone west of UTC would have read a local Jan 1 00:30 as Dec 31 (UTC), so pin the
      // eastern case the pinned zone can show: local Jan 1 00:30 = Dec 31 12:30Z.
      expect(formatRelativeDate(local(2025, 11, 31, 23, 59), { form: 'compact' })).toBe('Dec 31, 2025');
      expect(formatRelativeDate(local(2026, 0, 1, 0, 30), { form: 'compact' })).toBe('Jan 1');
    });
  });

  it('throws on an invalid date', () => {
    expect(() => formatRelativeDate('not a date')).toThrow('Invalid date provided');
  });
});
