import React from 'react';
import { TableButton } from './TableButton';
import { IconButton, Toolbar, ToolbarProps, Tooltip, Typography, lighten, useTheme } from '@mui/material';
import { useNavigate } from 'react-router';

export type TableToolbarProps = {
  title?: string;
  selectedRows: any[];
  description?: () => JSX.Element;
  buttons?: TableButton<any>[];
  sx?: ToolbarProps['sx'];
};

export const TableToolbar = (props: TableToolbarProps) => {
  const { title, selectedRows, buttons, sx } = props;
  const navigate = useNavigate();
  const theme = useTheme();
  return (
    <Toolbar
      sx={() => {
        const defaultSx =
          selectedRows.length > 0
            ? theme.palette.mode === 'light'
              ? {
                  color: theme.palette.info.main,
                  backgroundColor: lighten(theme.palette.info.light, 0.85),
                }
              : {
                  color: theme.palette.info.light,
                  backgroundColor: theme.palette.info.dark,
                }
            : {
                paddingLeft: theme.spacing(2),
                paddingRight: theme.spacing(1),
              };

        return sx ? { ...defaultSx, ...sx } : defaultSx;
      }}
    >
      <div
        style={{
          marginLeft: 4,
          flex: '0 0 auto',
        }}
      >
        {selectedRows.length > 0 ? (
          <Typography variant='subtitle1' color='inherit'>
            {selectedRows.length} rows selected
          </Typography>
        ) : (
          <div>
            {typeof title !== 'undefined' && <Typography variant='h5'>{title}</Typography>}
            {typeof props.description !== 'undefined' && <props.description />}
          </div>
        )}
      </div>
      <div
        style={{
          flex: '1 1 100%',
        }}
      />
      <div>
        <Buttons />
      </div>
    </Toolbar>
  );

  function Buttons() {
    if (!buttons) {
      return null;
    }

    if (selectedRows.length > 0) {
      return buttons
        .filter((button) => button.visibility.showWhenRowsSelected)
        .map((button, index) => (
          <Tooltip key={index} title={button.name}>
            <IconButton aria-label={button.name} onClick={(event) => button.onClick(selectedRows, navigate)}>
              <button.icon />
            </IconButton>
          </Tooltip>
        ));
    }

    return buttons
      .filter((button) => button.visibility.showWhenNoRowsSelected)
      .map((button, index) => (
        <Tooltip key={index} title={button.name}>
          <IconButton aria-label={button.name} onClick={(event) => button.onClick([], navigate)}>
            <button.icon />
          </IconButton>
        </Tooltip>
      ));
  }
};
