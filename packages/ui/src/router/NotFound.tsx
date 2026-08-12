import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

/**
 * Default 404 page for unmatched routes. The router routes it through the app's page container
 * (see AppRoutes), so it renders inside the app's theme and chrome like any other page.
 * Deliberately framework-neutral — plain MUI, no product branding. Apps replace it via
 * `AppOptions.pageNotFound`.
 *
 * Geometry: fills the viewport (`100dvh`) when rendered bare, capped at the page container's
 * content area (`maxHeight: 100%`) when containerized — centered in both without branching.
 */
export function NotFound() {
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        height: '100dvh',
        maxHeight: '100%',
        width: '100%',
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
      <Button variant='contained' disableElevation onClick={() => navigate('/', { replace: true })} sx={{ mt: 1 }}>
        Go home
      </Button>
    </Box>
  );
}
