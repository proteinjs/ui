import React from 'react';
import moment from 'moment';
import { Box, Typography } from '@mui/material';
import { Check } from '@mui/icons-material';
import { formatRelativeDate } from '../formatters';

/**
 * The default cell-value presentations the base Table (and RecordTable's per-column-type
 * renderers) share — one owner for how a TYPE of value presents in a data table, so every
 * consumer inherits the same grammar: quiet dashes for empty, a jade check / muted dash for
 * booleans (never emoji or 'True'/'False' strings), humanized times with the precise
 * timestamp on hover, clamped long text, ellipsized mono for structured blobs, and quiet
 * chips with a tone dot for status-like values.
 */

/** Empty/null: a quiet dash — data that isn't there shouldn't demand attention. */
export function EmptyCellValue() {
  return (
    <Typography variant='body2' component='span' sx={{ color: 'text.disabled' }}>
      —
    </Typography>
  );
}

/** Boolean: true is a jade check; false is a non-event (dash), never a red X. */
export function BooleanCellValue({ value }: { value: boolean | null | undefined }) {
  if (value == null) {
    return <EmptyCellValue />;
  }

  if (!value) {
    return (
      <Typography variant='body2' component='span' aria-label='No' sx={{ color: 'text.disabled' }}>
        —
      </Typography>
    );
  }

  return (
    <Check
      titleAccess='Yes'
      sx={{ fontSize: 18, color: 'success.main', verticalAlign: 'middle', display: 'inline-block' }}
    />
  );
}

export type DateTimeCellInput = Date | string | number | moment.Moment | null | undefined;

/** The one place the humanized + precise pairing is derived (cells and tooltips alike). */
export function formatDateTimeCell(value: DateTimeCellInput): { text: string; full: string } | undefined {
  if (value == null || value === '') {
    return undefined;
  }

  const m = moment.isMoment(value) ? value : moment(value as Date | string | number);
  if (!m.isValid()) {
    return undefined;
  }

  return {
    text: formatRelativeDate(m.toDate()),
    full: m.format('ddd, MMM D YYYY, h:mm:ss A'),
  };
}

/**
 * Timestamp: humanized (Today at 2:30 PM / Yesterday at… / MMM D, YYYY) with the full
 * absolute on hover — relative for the fast scan, absolute for precision. Secondary ink:
 * timestamps are meta, and a row should spend its primary ink on identity (round 2's
 * fewer-competing-inks pass).
 */
export function DateTimeCellValue({ value }: { value: DateTimeCellInput }) {
  const formatted = formatDateTimeCell(value);
  if (!formatted) {
    return <EmptyCellValue />;
  }

  return (
    <Typography
      variant='body2'
      component='span'
      title={formatted.full}
      sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}
    >
      {formatted.text}
    </Typography>
  );
}

/** Date-only: MMM D, YYYY (no time-of-day theater for a date). */
export function DateCellValue({ value }: { value: Date | string | number | null | undefined }) {
  if (value == null || value === '') {
    return <EmptyCellValue />;
  }

  const m = moment(value);
  if (!m.isValid()) {
    return <EmptyCellValue />;
  }

  return (
    <Typography variant='body2' component='span' sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
      {m.format('MMM D, YYYY')}
    </Typography>
  );
}

/** Long text: body copy clamped at three lines so a blob can never take over a row. */
export function ClampedTextCellValue({ children, lines = 3 }: { children: React.ReactNode; lines?: number }) {
  return (
    <Typography
      variant='body2'
      sx={{
        display: '-webkit-box',
        WebkitLineClamp: lines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </Typography>
  );
}

/** Structured values (objects/arrays): one ellipsized mono line, full value on hover. */
export function JsonSnippetCellValue({ value }: { value: unknown }) {
  if (value == null) {
    return <EmptyCellValue />;
  }

  let json: string;
  try {
    json = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    json = String(value);
  }

  const tooltipCap = 1000;
  return (
    <Typography
      variant='body2'
      component='span'
      title={json.length > tooltipCap ? `${json.slice(0, tooltipCap)}…` : json}
      sx={{
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '0.8125rem',
        color: 'text.secondary',
        display: 'inline-block',
        maxWidth: 280,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      {json}
    </Typography>
  );
}

/**
 * Tone classes for status-like values: the success family gets the jade dot, the failure
 * family the red one, everything else neutral. A word-class map, not per-product config —
 * consumers with their own semantics pass their own renderer.
 */
const STATUS_TONES: { [tone: string]: string[] } = {
  success: ['success', 'active', 'complete', 'completed', 'done', 'invited', 'sent', 'approved', 'verified'],
  error: ['failure', 'failed', 'error', 'declined', 'rejected', 'expired', 'deactivated'],
};

export function statusTone(value: string): 'success' | 'error' | 'neutral' {
  const normalized = value.trim().toLowerCase();
  if (STATUS_TONES.success.includes(normalized)) {
    return 'success';
  }
  if (STATUS_TONES.error.includes(normalized)) {
    return 'error';
  }
  return 'neutral';
}

/** Status-like short values: a quiet outlined chip with a tone dot — scannable, not loud. */
export function StatusChipCellValue({ value }: { value: string | null | undefined }) {
  if (value == null || !String(value).trim()) {
    return <EmptyCellValue />;
  }

  const tone = statusTone(String(value));
  return (
    <Box
      component='span'
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 22,
        px: 1.125,
        borderRadius: 999,
        border: '1px solid',
        borderColor: 'divider',
        fontSize: '0.75rem',
        fontWeight: 500,
        lineHeight: 1,
        color: 'text.secondary',
        whiteSpace: 'nowrap',
      }}
    >
      <Box
        component='span'
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: tone === 'success' ? 'success.main' : tone === 'error' ? 'error.main' : 'text.disabled',
        }}
      />
      {String(value)}
    </Box>
  );
}

/**
 * Whether a column name reads as a status-like enum (status/state/phase/…): the deterministic
 * gate RecordTable's default string renderer uses before reaching for the chip.
 */
export function isStatusLikeColumnName(columnPropertyName: string): boolean {
  return ['status', 'state', 'phase', 'stage', 'level', 'tier', 'severity', 'priority'].includes(
    columnPropertyName.toLowerCase()
  );
}
