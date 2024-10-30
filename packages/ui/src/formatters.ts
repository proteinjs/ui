import moment from 'moment';

/**
 * Configuration options for date formatting
 */
interface DateFormatterOptions {
  /** Format for time on today's dates (default: 'h:mm A') */
  todayFormat?: string;
  /** Format for time on yesterday's dates (default: 'h:mm A') */
  yesterdayFormat?: string;
  /** Format for older dates (default: 'MMM D, YYYY') */
  defaultFormat?: string;
}

/**
 * Valid input types for the date parameter
 */
type DateInput = Date | string | number;

/**
 * Formats a date relative to now, showing "Today at HH:MM AM/PM",
 * "Yesterday at HH:MM AM/PM", or "MMM D, YYYY"
 *
 * @param {Date|string|number} inputDate - The date to format (Date object, ISO string, or timestamp)
 * @param {Object} options - Configuration options
 * @param {string} options.todayFormat - Format for time on today's dates (default: 'h:mm A')
 * @param {string} options.yesterdayFormat - Format for time on yesterday's dates (default: 'h:mm A')
 * @param {string} options.defaultFormat - Format for older dates (default: 'MMM D, YYYY')
 * @returns {string} The formatted date string
 * @throws {Error} If inputDate is invalid
 *
 * @example
 * formatRelativeDate(new Date()) // "Today at 2:30 PM"
 * formatRelativeDate('2024-10-28') // "Yesterday at 12:00 AM"
 * formatRelativeDate('2024-10-27') // "Oct 27, 2024"
 */
export function formatRelativeDate(inputDate: DateInput, options: DateFormatterOptions = {}): string {
  // Set default options
  const { todayFormat = 'h:mm A', yesterdayFormat = 'h:mm A', defaultFormat = 'MMM D, YYYY' } = options; // Set default options

  // Convert input to moment object
  const date = moment(inputDate);

  // Validate input
  if (!date.isValid()) {
    throw new Error('Invalid date provided');
  }

  const now = moment();

  // Format based on relative time
  if (date.isSame(now, 'day')) {
    return `Today at ${date.format(todayFormat)}`;
  }

  if (date.isSame(now.clone().subtract(1, 'day'), 'day')) {
    return `Yesterday at ${date.format(yesterdayFormat)}`;
  }

  return date.format(defaultFormat);
}
