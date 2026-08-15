import React from 'react';
import { TableButton } from './TableButton';
import { IconButton, Toolbar, ToolbarProps, Tooltip, Typography, lighten, useTheme } from '@mui/material';
import { useNavigate } from 'react-router';
import { ConfirmationDialog } from '../components/ConfirmationDialog';

export type TableToolbarProps = {
  title?: string;
  selectedRows: any[];
  description?: () => JSX.Element;
  content?: React.ReactNode;
  buttons?: TableButton<any>[];
  sx?: ToolbarProps['sx'];
};

export const TableToolbar = (props: TableToolbarProps) => {
  const { title, selectedRows, content, buttons, sx } = props;
  const navigate = useNavigate();
  const theme = useTheme();
  /**
   * A button with `confirm` routes here on click: its action and the rows it would act on wait
   * in this state until the dialog's confirm runs them; cancel discards them.
   */
  const [pendingConfirmation, setPendingConfirmation] = React.useState<{
    button: TableButton<any>;
    rows: any[];
  }>();

  function onButtonClick(button: TableButton<any>, rows: any[]) {
    if (button.confirm) {
      setPendingConfirmation({ button, rows });
      return;
    }

    button.onClick(rows, navigate);
  }

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
      {content && content}
      <div>
        <Buttons />
      </div>
      {pendingConfirmation && pendingConfirmation.button.confirm && (
        <ConfirmationDialog
          open
          {...pendingConfirmation.button.confirm(pendingConfirmation.rows)}
          onConfirm={() => {
            setPendingConfirmation(undefined);
            pendingConfirmation.button.onClick(pendingConfirmation.rows, navigate);
          }}
          onCancel={() => setPendingConfirmation(undefined)}
        />
      )}
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
            <IconButton aria-label={button.name} onClick={(event) => onButtonClick(button, selectedRows)}>
              <button.icon />
            </IconButton>
          </Tooltip>
        ));
    }

    return buttons
      .filter((button) => button.visibility.showWhenNoRowsSelected)
      .map((button, index) => (
        <Tooltip key={index} title={button.name}>
          <IconButton aria-label={button.name} onClick={(event) => onButtonClick(button, [])}>
            <button.icon />
          </IconButton>
        </Tooltip>
      ));
  }
};
