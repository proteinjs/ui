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
 * timestamp on hover, clamped long text, structured values as row-sized content, and quiet
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

/**
 * Long text: body copy clamped at three lines so a blob can never take over a row. String
 * content wraps at identifier humps first (see {@link withIdentifierBreaks}); `overflow-wrap:
 * anywhere` stays the last resort for genuinely unbreakable runs (URLs, hashes).
 */
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
      {typeof children === 'string' ? withIdentifierBreaks(children) : children}
    </Typography>
  );
}

/** A whitespace-free run this long is treated as a name, not a word — short words never gain breaks. */
const IDENTIFIER_MIN_LENGTH = 12;
/**
 * A hump segment up to this long renders as an unbreakable atom (`white-space: nowrap`), so the
 * table's auto layout sizes the column to the longest segment instead of to one character (the
 * anywhere fallback offers a break at every character, which is what shrank the Name column to
 * "Truncat / e / Thou…"). Longer segments stay breakable — a pathological run must never widen a
 * table past its card.
 */
const ATOM_MAX_LENGTH = 24;

/**
 * Soft break opportunities inside identifier-like tokens — camelCase / snake_case / dotted or
 * slashed names (a migration's class name, a column name, a package path): a `<wbr>` before
 * each hump and after each separator, so a narrow column wraps "BackfillUserStatusActive" as
 * Backfill / User / Status / Active instead of mid-word ("Backfill / UserSt / atusA…", which is
 * what `overflow-wrap: anywhere` alone produced). `<wbr>` carries no text: the cell's
 * textContent, copy, and search are byte-identical. Prose is untouched — only whitespace-free
 * runs of {@link IDENTIFIER_MIN_LENGTH}+ characters with internal humps or separators qualify.
 * Written without regex lookbehind on purpose (Safari before 16.4 fails to PARSE such a
 * literal, which would brick the whole bundle, not just this cell).
 */
export function withIdentifierBreaks(text: string): React.ReactNode {
  const parts = text.split(/(\s+)/);
  if (!parts.some((part) => part.length >= IDENTIFIER_MIN_LENGTH && hasBreakOpportunity(part))) {
    return text;
  }

  const nodes: React.ReactNode[] = [];
  parts.forEach((part, partIndex) => {
    if (part.length < IDENTIFIER_MIN_LENGTH || /\s/.test(part) || !hasBreakOpportunity(part)) {
      nodes.push(part);
      return;
    }

    const atom = (segment: string, key: string) =>
      segment.length <= ATOM_MAX_LENGTH ? (
        <span key={key} style={{ whiteSpace: 'nowrap' }}>
          {segment}
        </span>
      ) : (
        segment
      );
    let segment = '';
    for (let i = 0; i < part.length; i++) {
      const char = part[i];
      const previous = part[i - 1];
      const humpBoundary = i > 0 && isUpper(char) && isLowerOrDigit(previous);
      const afterSeparator = i > 0 && isSeparator(previous) && !isSeparator(char);
      if (humpBoundary || afterSeparator) {
        nodes.push(atom(segment, `${partIndex}-${i}-a`), <wbr key={`${partIndex}-${i}`} />);
        segment = '';
      }
      segment += char;
    }
    nodes.push(atom(segment, `${partIndex}-end`));
  });
  return nodes;
}

const isUpper = (char: string) => char >= 'A' && char <= 'Z';
const isLowerOrDigit = (char: string) => (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
const isSeparator = (char: string) => char === '_' || char === '.' || char === '/' || char === '-';
const hasBreakOpportunity = (token: string) => {
  for (let i = 1; i < token.length; i++) {
    if ((isUpper(token[i]) && isLowerOrDigit(token[i - 1])) || (isSeparator(token[i - 1]) && !isSeparator(token[i]))) {
      return true;
    }
  }
  return false;
};

/** Lines a structured cell shows at rest — the same bound as clamped text (three lines a row). */
export const STRUCTURED_CELL_COLLAPSED_LINES = 3;
/** Nested arrays/objects summarize to this many items/keys before "+n more". */
const STRUCTURED_SUMMARY_ITEMS = 4;
const STRUCTURED_TOOLTIP_CAP = 1000;

/** One line of a structured value: a key (objects) or none (array items), and the value's one-line text. */
export type StructuredEntry = { key?: string; text: string };

/**
 * THE ENTRY GRAMMAR for a structured value (an object or array — an ObjectColumn, a JSON column,
 * a blob a driver deserializes): the top level is the content, one line per key (or item); a
 * nested value reads as its one-line summary — scalars as themselves, `—` for null, an array of
 * scalars as its first items, an array of records as its count, an object as its key names —
 * so the cell tells what is IN the value without being the value. A JSON string is read as the
 * value it encodes; any other scalar is one line of text.
 */
export function structuredEntries(value: unknown): StructuredEntry[] {
  const parsed = parseIfJson(value);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => ({ text: summarizeStructured(item) }));
  }
  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed).map(([key, item]) => ({ key, text: summarizeStructured(item) }));
  }
  return [{ text: summarizeStructured(parsed) }];
}

const isScalar = (value: unknown): boolean =>
  value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

function summarizeStructured(value: unknown): string {
  if (value == null) {
    return '—';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[ ]';
    }
    if (value.every(isScalar)) {
      const shown = value.slice(0, STRUCTURED_SUMMARY_ITEMS).map(summarizeStructured);
      const rest = value.length - shown.length;
      return rest > 0 ? `${shown.join(', ')}, +${rest} more` : shown.join(', ');
    }
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return '{ }';
    }
    const shown = keys.slice(0, STRUCTURED_SUMMARY_ITEMS);
    const rest = keys.length - shown.length;
    return `{ ${shown.join(', ')}${rest > 0 ? `, +${rest} more` : ''} }`;
  }
  return String(value);
}

function parseIfJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function structuredJson(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Structured values (objects/arrays) as CONTENT, sized for a row (founder, R7 round 3: an object
 * in a column "should display that as content, but leverage the content size scalability
 * features of the ui to not be a problem if it's large"): the entry grammar above, one line per
 * top-level key/item — quiet key, then the value's one-line text — collapsed to
 * {@link STRUCTURED_CELL_COLLAPSED_LINES} lines at rest with the house in-place disclosure
 * ("Show more (n)" / "Show less", the notification row's grammar) for the rest; the whole
 * JSON on hover. The disclosure is its own control: it never fires the row's click. Nested
 * values summarize (they never grow the cell); the record form is where a value opens in full.
 */
export function JsonSnippetCellValue({ value }: { value: unknown }) {
  const [expanded, setExpanded] = React.useState(false);
  if (value == null) {
    return <EmptyCellValue />;
  }

  const entries = structuredEntries(value);
  const hidden = Math.max(0, entries.length - STRUCTURED_CELL_COLLAPSED_LINES);
  const shown = expanded ? entries : entries.slice(0, STRUCTURED_CELL_COLLAPSED_LINES);
  const json = structuredJson(parseIfJson(value));
  return (
    <Box
      data-structured-cell
      data-structured-cell-expanded={expanded ? 'true' : 'false'}
      title={json.length > STRUCTURED_TOOLTIP_CAP ? `${json.slice(0, STRUCTURED_TOOLTIP_CAP)}…` : json}
      sx={{ minWidth: 0 }}
    >
      {shown.map((entry, index) => (
        <Box
          key={index}
          data-structured-cell-entry
          sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}
        >
          {entry.key !== undefined && (
            <Typography
              component='span'
              data-structured-cell-key
              sx={{
                fontSize: '0.75rem',
                lineHeight: 1.5,
                color: 'text.secondary',
                flex: 'none',
                maxWidth: '45%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.key}
            </Typography>
          )}
          <Typography
            variant='body2'
            component='span'
            data-structured-cell-text
            sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {entry.text}
          </Typography>
        </Box>
      ))}
      {hidden > 0 && (
        <Box
          component='button'
          type='button'
          data-structured-cell-toggle
          aria-expanded={expanded}
          onClick={(event: React.MouseEvent) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          sx={{
            font: 'inherit',
            fontSize: '0.71875rem',
            lineHeight: 1.5,
            fontWeight: 500,
            color: 'text.secondary',
            background: 'none',
            border: 0,
            padding: 0,
            marginTop: '2px',
            cursor: 'pointer',
            '&:hover': { color: 'text.primary' },
          }}
        >
          {expanded ? 'Show less' : `Show more (${hidden})`}
        </Box>
      )}
    </Box>
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
