import moment from 'moment';

/**
 * The two forms of a relative date.
 * - `long` (the default): "Today at 2:30 PM" · "Yesterday at 2:30 PM" · "Oct 27, 2024".
 * - `compact`: the same day boundaries in the fewest characters a narrow row can afford — the
 *   time alone today ("2:30 PM"), the word alone yesterday ("Yesterday"), month and day within
 *   the current year ("Oct 27"), the full date beyond it ("Oct 27, 2024").
 */
export type RelativeDateForm = 'long' | 'compact';

/**
 * Configuration options for date formatting
 */
export interface DateFormatterOptions {
  /** Format for time on today's dates (default: 'h:mm A') */
  todayFormat?: string;
  /** Format for time on yesterday's dates — the long form only; the compact form is the word alone (default: 'h:mm A') */
  yesterdayFormat?: string;
  /** Format for dates within the current year — the compact form only; the long form keeps the year (default: 'MMM D') */
  thisYearFormat?: string;
  /** Format for older dates (default: 'MMM D, YYYY') */
  defaultFormat?: string;
  /** The string's form (default: 'long'); see {@link RelativeDateForm} */
  form?: RelativeDateForm;
}

/**
 * Valid input types for the date parameter
 */
type DateInput = Date | string | number;

/**
 * Formats a date relative to now. The long form reads "Today at HH:MM AM/PM",
 * "Yesterday at HH:MM AM/PM", or "MMM D, YYYY"; the compact form reads "HH:MM AM/PM",
 * "Yesterday", "MMM D" (this year), or "MMM D, YYYY". The day and year boundaries are the
 * viewer's own (local time), the same in both forms.
 *
 * @param {Date|string|number} inputDate - The date to format (Date object, ISO string, or timestamp)
 * @param {Object} options - Configuration options
 * @param {string} options.todayFormat - Format for time on today's dates (default: 'h:mm A')
 * @param {string} options.yesterdayFormat - Format for time on yesterday's dates, long form (default: 'h:mm A')
 * @param {string} options.thisYearFormat - Format for dates within the current year, compact form (default: 'MMM D')
 * @param {string} options.defaultFormat - Format for older dates (default: 'MMM D, YYYY')
 * @param {'long'|'compact'} options.form - The string's form (default: 'long')
 * @returns {string} The formatted date string
 * @throws {Error} If inputDate is invalid
 *
 * @example
 * formatRelativeDate(new Date()) // "Today at 2:30 PM"
 * formatRelativeDate('2024-10-28') // "Yesterday at 12:00 AM"
 * formatRelativeDate('2024-10-27') // "Oct 27, 2024"
 * formatRelativeDate(new Date(), { form: 'compact' }) // "2:30 PM"
 * formatRelativeDate('2024-10-28', { form: 'compact' }) // "Yesterday"
 * formatRelativeDate('2024-10-20', { form: 'compact' }) // "Oct 20" (in 2024)
 */
export function formatRelativeDate(inputDate: DateInput, options: DateFormatterOptions = {}): string {
  const {
    todayFormat = 'h:mm A',
    yesterdayFormat = 'h:mm A',
    thisYearFormat = 'MMM D',
    defaultFormat = 'MMM D, YYYY',
    form = 'long',
  } = options;

  // Convert input to moment object
  const date = moment(inputDate);

  // Validate input
  if (!date.isValid()) {
    throw new Error('Invalid date provided');
  }

  const now = moment();
  const compact = form === 'compact';

  // Format based on relative time
  if (date.isSame(now, 'day')) {
    const time = date.format(todayFormat);
    return compact ? time : `Today at ${time}`;
  }

  if (date.isSame(now.clone().subtract(1, 'day'), 'day')) {
    return compact ? 'Yesterday' : `Yesterday at ${date.format(yesterdayFormat)}`;
  }

  if (compact && date.isSame(now, 'year')) {
    return date.format(thisYearFormat);
  }

  return date.format(defaultFormat);
}

/** Capitalize the first character in a string. Returns empty string for invalid inputs. */
export const capitalizeFirst = (str?: string | null): string => {
  if (!str || typeof str !== 'string' || str.length === 0) {
    return '';
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
};
