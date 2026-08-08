import React from 'react';
import { Box, Typography } from '@mui/material';
import { Page } from '../router/Page';

export type UnauthorizedPageProps = {
  /** The page the user attempted to view. */
  page: Page;
};

/**
 * Rendered by `PageContainer` when the user is logged in but doesn't have access to the page.
 * Apps can replace it via `PageContainerProps.unauthorizedPage`.
 */
export function DefaultUnauthorizedPage() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', px: 3, pt: 12 }}>
      <Box
        sx={{
          width: '100%',
          maxWidth: 440,
          p: 4,
          textAlign: 'center',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant='h6' sx={{ mb: 1 }}>
          You don't have access to this page
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          If you think you should have access, contact your administrator.
        </Typography>
      </Box>
    </Box>
  );
}
