import React from 'react';
import { TableButton } from './TableButton';
import { IconButton, Toolbar, ToolbarProps, Tooltip, Typography, lighten, useTheme } from '@mui/material';
import { useNavigate } from 'react-router';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { TABLE_READING_EDGE } from './tableReadingEdge';

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
        // One compact height on all widths: MUI's 56→64px desktop jump reads as a page
        // header; this is a card header. One reading edge on all widths and in both states too:
        // the title (or the selection count in its seat) starts where the rows start. MUI re-pads
        // the toolbar to 24px from 600px up inside a media block, which outranks a plain
        // padding — so, like the height, the edge is restated inside that block.
        const readingEdge = theme.spacing(TABLE_READING_EDGE);
        const seatSx = {
          minHeight: 56,
          paddingLeft: readingEdge,
          '@media (min-width: 600px)': { minHeight: 56, paddingLeft: readingEdge },
        };
        const defaultSx =
          selectedRows.length > 0
            ? theme.palette.mode === 'light'
              ? {
                  ...seatSx,
                  color: theme.palette.info.main,
                  backgroundColor: lighten(theme.palette.info.light, 0.85),
                }
              : {
                  ...seatSx,
                  color: theme.palette.info.light,
                  backgroundColor: theme.palette.info.dark,
                }
            : {
                ...seatSx,
                paddingRight: theme.spacing(1),
              };

        return sx ? { ...defaultSx, ...sx } : defaultSx;
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
        }}
      >
        {selectedRows.length > 0 ? (
          <Typography variant='subtitle1' color='inherit'>
            {selectedRows.length} rows selected
          </Typography>
        ) : (
          <div>
            {/* A card header, not a page heading: h6 sits the title with the quieted column labels. */}
            {typeof title !== 'undefined' && <Typography variant='h6'>{title}</Typography>}
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
        <SeatButtons buttons={buttons} selectedRows={selectedRows} onButtonClick={onButtonClick} />
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
};

/**
 * The action seat. A component in its own right, declared once at module level: a component
 * type minted inside the toolbar's render is a new type on every render, and React unmounts and
 * remounts it each time — the seat's buttons lost their element identity (a click under way, a
 * tooltip, the focus) whenever the table re-rendered around them.
 */
function SeatButtons(props: {
  buttons?: TableButton<any>[];
  selectedRows: any[];
  onButtonClick: (button: TableButton<any>, rows: any[]) => void;
}) {
  const { buttons, selectedRows, onButtonClick } = props;
  if (!buttons) {
    return null;
  }

  if (selectedRows.length > 0) {
    return (
      <>
        {buttons
          .filter((button) => button.visibility.showWhenRowsSelected)
          .map((button, index) => (
            <Tooltip key={index} title={button.name}>
              <IconButton aria-label={button.name} onClick={() => onButtonClick(button, selectedRows)}>
                <button.icon />
              </IconButton>
            </Tooltip>
          ))}
      </>
    );
  }

  return (
    <>
      {buttons
        .filter((button) => button.visibility.showWhenNoRowsSelected)
        .map((button, index) => (
          <Tooltip key={index} title={button.name}>
            <IconButton aria-label={button.name} onClick={() => onButtonClick(button, [])}>
              <button.icon />
            </IconButton>
          </Tooltip>
        ))}
    </>
  );
}
