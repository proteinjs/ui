import React from 'react';
import { Box, Link, Typography } from '@mui/material';

/**
 * Default 404 page for unmatched routes. Deliberately framework-neutral: it renders outside any
 * app ThemeProvider (see Router), so it sticks to plain MUI defaults — no product branding.
 * Apps replace it via `AppOptions.pageNotFound`.
 */
export function NotFound() {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        px: 3,
        textAlign: 'center',
      }}
    >
      <Typography variant='h5' component='h1'>
        Page not found
      </Typography>
      <Typography color='text.secondary'>It may have been moved or no longer exists.</Typography>
      <Link href='/' underline='hover'>
        Go to home
      </Link>
    </Box>
  );
}
