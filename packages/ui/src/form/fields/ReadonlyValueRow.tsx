import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Check, ContentCopy } from '@mui/icons-material';
import { FieldShell } from './FieldShell';

/**
 * A read-only field presented as a value ROW, not an input: quiet label over selectable text,
 * with the field's description inline after the value (the relative time on stored timestamps)
 * and a copy control that surfaces on hover (always faintly present on touch, where hover
 * doesn't exist). The reference grammar (Notion/Linear property rows): data an admin came to
 * READ never wears input chrome — the round-1 readonly inputs kept a border and input padding
 * around values that are not editable.
 */
export function ReadonlyValueRow({
  label,
  value,
  description,
  monospace,
}: {
  label: string;
  value: string;
  /** Quiet inline suffix after the value (e.g. '2 hours ago' on a timestamp). */
  description?: string;
  monospace?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions/insecure context): the text itself stays selectable.
    }
  };

  return (
    <FieldShell label={label}>
      <Box
        data-readonly-value-row
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 0.75,
          minWidth: 0,
          minHeight: 24,
          // The copy control stays out of the ink until the row is hovered or it holds focus;
          // touch pointers (no hover) see it faintly so the affordance isn't hidden from them.
          '& .readonly-copy': { opacity: 0, transition: 'opacity 120ms' },
          '&:hover .readonly-copy, & .readonly-copy:focus-visible': { opacity: 1 },
          '@media (hover: none)': { '& .readonly-copy': { opacity: 0.55 } },
        }}
      >
        <Typography
          component='span'
          sx={{
            fontSize: monospace ? '0.8125rem' : '0.875rem',
            lineHeight: 1.5,
            color: 'text.primary',
            userSelect: 'text',
            overflowWrap: 'anywhere',
            minWidth: 0,
            ...(monospace ? { fontFamily: 'ui-monospace, Menlo, monospace' } : {}),
          }}
        >
          {value || '—'}
        </Typography>
        {description && (
          <Typography
            component='span'
            sx={{ fontSize: '0.8125rem', color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            · {description}
          </Typography>
        )}
        {value && (
          <Tooltip title={copied ? 'Copied' : 'Copy'}>
            <IconButton
              className='readonly-copy'
              aria-label={`Copy ${label}`}
              size='small'
              onClick={copy}
              sx={{ alignSelf: 'center', padding: '2px', color: 'text.secondary' }}
            >
              {copied ? <Check sx={{ fontSize: 14 }} /> : <ContentCopy sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </FieldShell>
  );
}
