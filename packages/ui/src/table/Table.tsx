import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TableContainer,
  Table as MuiTable,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  Checkbox,
  Box,
  TableContainerOwnProps,
  ToolbarProps,
  CircularProgress,
  TablePaginationProps,
  TableCellProps,
} from '@mui/material';
import moment from 'moment';
import { StringUtil } from '@proteinjs/util';
import { TableLoader } from './TableLoader';
import { TableButton } from './TableButton';
import { TableToolbar } from './TableToolbar';
import { useTableData } from './tableData';
import { InfiniteScroll } from './InfiniteScroll';
import { hasTextSelectionInRow, PointerPosition, shouldRunRowClickAction } from './rowClickIntent';
import { resolveTableBodyState, tableLoadErrorText } from './tableLoadState';
import { ScrollTopButton, ScrollTopButtonStyleProps } from '../components/ScrollTopButton';
import { useFormFactor } from '../hooks/useFormFactor';

type ColumnValue<T, K extends keyof T> = T[K];
export type CustomRenderer<T, K extends keyof T> = (value: ColumnValue<T, K>, row: T) => React.ReactNode;
export type ColumnConfig<T> = {
  [K in keyof T]?: {
    cellProps?: TableCellProps;
    renderer?: CustomRenderer<T, K>;
    /** If no header is provided, a default header will be used. Pass in `null` if you'd like the header to be omitted. */
    header?: string | React.ReactNode;
  };
};

type RowClickAction<T> =
  | string
  | ((row: T, event?: React.MouseEvent) => void | Promise<void> | string | Promise<string>);

export type TableProps<T> = {
  title?: string;
  description?: () => JSX.Element;
  columns: (keyof T)[];
  columnConfig?: ColumnConfig<T>;
  hideColumnHeaders?: boolean;
  tableLoader: TableLoader<T>;
  refetchOnWindowFocus?: boolean;
  /** Setter which will be used to update the row count when rows are loaded */
  setRowCount?: React.Dispatch<React.SetStateAction<number | undefined>>;
  rowOnClick?: RowClickAction<T>;
  /** Buttons displayed in the table head */
  buttons?: TableButton<T>[];
  /** If true, use pagination for table page navigation, if false uses infinite scroll. Defaults to false. */
  pagination?: boolean;
  /** Props passed into the TablePagination component. This component is only displayed if `pagination` is true. */
  tablePaginationProps?: Partial<TablePaginationProps>;
  /* Number of rows that are loaded per page. */
  rowsPerPage?: number;
  /* Styling set on the root element of the toolbar. */
  toolbarSx?: ToolbarProps['sx'];
  /* Content that will be displayed in the toolbar section of the table. */
  toolbarContent?: React.ReactNode;
  /* Styling set on the container element of the table. */
  tableContainerSx?: TableContainerOwnProps['sx'];
  /* Styling set on the scroll container element that wraps the table. */
  scrollContainerSx?: TableContainerOwnProps['sx'];
  /* Component displayed when there are no rows to display. */
  emptyTableComponent?: React.ReactNode;
  /* Loading skeleton that's displayed before the table rows are first fetched.\
   * You can use these class names to target the containers with styling:
   * - `loading-skeleton-table-body`
   * - `loading-skeleton-row`
   * - `loading-skeleton-cell`
   */
  skeleton?: React.ReactNode;
  /** Loader to display while items are fetching. Only applicable when pagination prop is false. */
  infiniteScrollLoader?: React.ReactNode;
  /**
   * Opt-in floating back-to-top button over the table's scroll container. `true` renders the
   * framework-default styling; pass `ScrollTopButtonStyleProps` (e.g. an app's house preset) to
   * restyle. Off by default.
   */
  scrollTopButton?: boolean | ScrollTopButtonStyleProps;
};

export function Table<T>({
  title,
  description,
  columns,
  columnConfig = {},
  hideColumnHeaders = false,
  tableLoader,
  refetchOnWindowFocus = false,
  rowOnClick,
  setRowCount,
  pagination = false,
  tablePaginationProps,
  rowsPerPage: rowsPerPageProp = 10,
  buttons,
  tableContainerSx,
  scrollContainerSx,
  toolbarSx,
  toolbarContent,
  emptyTableComponent,
  skeleton,
  infiniteScrollLoader,
  scrollTopButton,
}: TableProps<T>) {
  const infiniteScroll = !pagination;
  /**
   * The phone card face (MOBILE_SUPPORT §4.5): below the phone line rows present as a stacked
   * card list — an MUI table's fixed column grid cannot fit a phone without horizontal page
   * scroll. One machinery, two faces: the loader pipeline, toolbar, selection model, row-click
   * intent guard, and infinite scroll are shared; only the row presentation forks.
   */
  const { isPhone } = useFormFactor();
  const [rowsPerPage, setRowsPerPage] = useState(rowsPerPageProp);
  const [page, setPage] = useState(0);
  const [selectedRows, setSelectedRows] = useState<{ [key: number]: T }>({});
  const [selectAll, setSelectAll] = useState(false);
  const [infScrollContainer, setInfScrollContainer] = useState<HTMLDivElement | null>(null);
  const infScrollContainerRef = useCallback((node: HTMLDivElement | null) => {
    setInfScrollContainer(node);
  }, []);
  const navigate = useNavigate();
  /**
   * Where the pointer went down for the in-progress gesture, so a drag that ends on a row can be
   * told apart from a click on it. Cleared after each click; a keyboard-activated click never sets
   * it. A ref rather than state: this must not re-render rows.
   */
  const pointerDownAt = useRef<PointerPosition | undefined>(undefined);

  const { rows, totalRows, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, resetQuery } =
    useTableData<T>(tableLoader, rowsPerPage, page, infiniteScroll, setRowCount, refetchOnWindowFocus);

  const maxPage = Math.max(0, Math.ceil((totalRows || 0) / rowsPerPage) - 1);

  // Adjust page if it exceeds maxPage
  useEffect(() => {
    if (!pagination || isLoading) {
      return;
    }

    if (page > maxPage && maxPage >= 0) {
      setPage(maxPage);
    }
  }, [page, maxPage, pagination, isLoading, totalRows]);

  /**
   * Reset (page 0 + refetch) when the loader's DATA changes — keyed by the loader's react-query
   * keys (its value identity), never by object identity. Parents construct a fresh loader every
   * render (RecordTable does), and an identity-keyed reset refetched on every parent re-render:
   * react-query flips a refetching errored query back to `loading`, so a denied table (DbService
   * 400) rendered as a perpetual spinner re-issuing the failed query instead of its honest error
   * state (/record/table?name=migration as a non-admin).
   */
  const { dataKey: loaderDataKey, dataQueryKey: loaderDataQueryKey } = tableLoader.reactQueryKeys;
  useEffect(() => {
    resetQuery();
    setPage(0);
    // resetQuery is intentionally not a dependency: this must run only when the loader's keys
    // change, and refetch-function identity is not a data change.
  }, [loaderDataKey, loaderDataQueryKey]);

  useEffect(() => {
    setSelectedRows({});
    setSelectAll(false);
  }, [rows]);

  useEffect(() => {
    if (!setRowCount || !totalRows) {
      return;
    }

    setRowCount(totalRows);
  }, [totalRows, setRowCount]);

  const handleFetchNextPage = useCallback(() => {
    if (!isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, isFetchingNextPage]);

  async function handleRowOnClick<T>(
    row: T,
    event: React.MouseEvent,
    action: RowClickAction<T>,
    navigate: (url: string) => void
  ) {
    if (!action) {
      return;
    }

    const gestureStart = pointerDownAt.current;
    pointerDownAt.current = undefined;
    const runAction = shouldRunRowClickAction({
      pointerDownAt: gestureStart,
      clickAt: { x: event.clientX, y: event.clientY },
      hasTextSelectionInRow: hasTextSelectionInRow(event.currentTarget, window.getSelection()),
    });
    if (!runAction) {
      return;
    }

    if (typeof action === 'string') {
      // If action is a string, treat it as a URL
      let url = action;
      if (!url.startsWith('/')) {
        url = `/${url}`;
      }
      navigate(url);
      return;
    }

    // If action is a function, execute it
    const result = action(row, event);

    if (result instanceof Promise) {
      // If the result is a Promise, wait for it to resolve
      const resolvedResult = await result;
      if (typeof resolvedResult === 'string') {
        let url = resolvedResult;
        if (!url.startsWith('/')) {
          url = `/${url}`;
        }
        navigate(url);
      }
    } else if (typeof result === 'string') {
      let url = result;
      if (!url.startsWith('/')) {
        url = `/${url}`;
      }
      navigate(url);
    }
    // If result is void, do nothing (the action has been performed in the function)
  }

  function updateRowsPerPage(newValue: number) {
    setRowsPerPage(newValue);
    setPage(0);
  }

  function toggleSelectRow(rowIndex: number, row: T) {
    const newSelectedRows = Object.assign({}, selectedRows);
    if (newSelectedRows[rowIndex]) {
      delete newSelectedRows[rowIndex];
    } else {
      newSelectedRows[rowIndex] = row;
    }

    setSelectedRows(newSelectedRows);

    if (selectAll && Object.keys(selectedRows).length != rows.length) {
      setSelectAll(false);
    } else if (!selectAll && Object.keys(selectedRows).length == rows.length) {
      setSelectAll(true);
    }
  }

  function toggleSelectAll(selected: boolean) {
    if (selected) {
      const newSelectedRows = Object.assign({}, selectedRows);
      for (let i = 0; i < rows.length; i++) {
        const index = rowsPerPage * page + i;
        if (!newSelectedRows[index]) {
          newSelectedRows[index] = rows[i];
        }
      }
      setSelectedRows(newSelectedRows);
    } else {
      setSelectedRows({});
    }

    setSelectAll(selected);
  }

  function formatCellValue(value: any, column: keyof T, row: T): { value: React.ReactNode; isCustomRendered: boolean } {
    const customRenderer = columnConfig[column]?.renderer;
    if (customRenderer) {
      return {
        value: customRenderer(value, row),
        isCustomRendered: true,
      };
    }

    // Default formatting logic
    let formattedValue: React.ReactNode;
    if (value == null) {
      formattedValue = '';
    } else if (typeof value === 'boolean') {
      formattedValue = value ? 'True' : 'False';
    } else if (moment.isMoment(value)) {
      formattedValue = value.format('ddd, MMM Do YY, h:mm:ss a');
    } else if (typeof value === 'object') {
      formattedValue = JSON.stringify(value);
    } else {
      formattedValue = value.toString();
    }

    return { value: formattedValue, isCustomRendered: false };
  }

  /** One column's block on a phone card: quiet label over the value. The first column is the
   *  card's identity line, so its value renders emphasized. Labels follow the header contract
   *  (`columnConfig.header`, `null` omits; `hideColumnHeaders` suppresses all). */
  const renderPhoneCardField = (row: T, column: keyof T, columnIndex: number) => {
    const { value: cellValue, isCustomRendered } = formatCellValue(row[column], column, row);
    const header = columnConfig[column]?.header;
    return (
      <Box key={String(column)} sx={{ minWidth: 0, '& + &': { marginTop: 0.75 } }}>
        {!hideColumnHeaders && header !== null && (
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
            {header || StringUtil.humanizeCamel(column as string)}
          </Typography>
        )}
        {isCustomRendered ? (
          <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{cellValue}</Box>
        ) : (
          <Typography
            sx={{
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              ...(columnIndex === 0 ? { fontWeight: 600 } : {}),
            }}
          >
            {cellValue}
          </Typography>
        )}
      </Box>
    );
  };

  /** The phone card list: same body states and handlers as the table face, presented as
   *  stacked hairline-divided cards that can never require horizontal scroll. */
  const renderPhoneList = () => {
    const bodyState = resolveTableBodyState({ isLoading, hasRows: rows.length > 0, error });

    return (
      <Box data-table-phone-face sx={{ minWidth: 0 }}>
        {bodyState === 'loading' && (
          <Box className='loading-skeleton-table-body' sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
            {skeleton ? skeleton : <CircularProgress />}
          </Box>
        )}
        {bodyState === 'error' && (
          <Box sx={{ py: 3, px: 2, textAlign: 'center' }}>
            <Typography color='error'>Couldn't load rows.</Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
              {tableLoadErrorText(error)}
            </Typography>
          </Box>
        )}
        {bodyState === 'empty' && (
          <Box sx={{ py: 3, px: 2, textAlign: 'center' }}>
            {emptyTableComponent ? emptyTableComponent : <Typography>No rows to display.</Typography>}
          </Box>
        )}
        {bodyState === 'rows' &&
          rows.map((row, index) => {
            index = rowsPerPage * page + index;
            const isSelected = typeof selectedRows[index] !== 'undefined';
            return (
              <Box
                data-table-phone-row
                key={index}
                onPointerDown={
                  rowOnClick
                    ? (event: React.PointerEvent) => {
                        pointerDownAt.current = { x: event.clientX, y: event.clientY };
                      }
                    : undefined
                }
                onClick={
                  rowOnClick
                    ? (event: React.MouseEvent) => handleRowOnClick(row, event, rowOnClick, navigate)
                    : undefined
                }
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  px: 2,
                  py: 1.5,
                  minWidth: 0,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-of-type': { borderBottom: 'none' },
                  ...(isSelected ? { backgroundColor: 'action.selected' } : {}),
                  ...(rowOnClick ? { cursor: 'pointer', '&:active': { backgroundColor: 'action.selected' } } : {}),
                }}
              >
                {buttons && buttons.length > 0 && (
                  <Checkbox
                    checked={isSelected}
                    onChange={(event) => {
                      event.stopPropagation();
                      toggleSelectRow(index, row);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    inputProps={{
                      'aria-label': 'Select row',
                    }}
                    // pulls the checkbox's built-in padding out of the card's edge so the
                    // glyph aligns with the card gutter and the first label's baseline
                    sx={{ ml: -1, mt: -1 }}
                  />
                )}
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  {columns.map((column, columnIndex) => renderPhoneCardField(row, column, columnIndex))}
                </Box>
              </Box>
            );
          })}
      </Box>
    );
  };

  const renderTableContainer = () => {
    const totalColumns = columns.length + (buttons && buttons.length > 0 ? 1 : 0);
    const bodyState = resolveTableBodyState({ isLoading, hasRows: rows.length > 0, error });

    return (
      <TableContainer sx={{ ...tableContainerSx }}>
        <MuiTable stickyHeader>
          <TableHead>
            <TableRow>
              {buttons && buttons.length > 0 && (
                <TableCell padding='checkbox'>
                  <Checkbox
                    checked={selectAll}
                    onChange={(event, selected) => toggleSelectAll(selected)}
                    inputProps={{
                      'aria-label': 'Select all',
                    }}
                  />
                </TableCell>
              )}
              {!hideColumnHeaders &&
                columns.map((column, index) => (
                  <TableCell key={index}>
                    {columnConfig[column]?.header !== null && (
                      <Typography variant='h6'>
                        {columnConfig[column]?.header || StringUtil.humanizeCamel(column as string)}
                      </Typography>
                    )}
                  </TableCell>
                ))}
            </TableRow>
          </TableHead>
          {bodyState === 'loading' && (
            <TableBody className='loading-skeleton-table-body'>
              <TableRow className='loading-skeleton-row'>
                <TableCell colSpan={totalColumns} align='center' className='loading-skeleton-cell' sx={{ py: 3 }}>
                  {skeleton ? skeleton : <CircularProgress />}
                </TableCell>
              </TableRow>
            </TableBody>
          )}
          {bodyState === 'error' && (
            <TableBody>
              <TableRow>
                <TableCell colSpan={totalColumns} align='center' sx={{ py: 3 }}>
                  <Typography color='error'>Couldn't load rows.</Typography>
                  <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
                    {tableLoadErrorText(error)}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          )}
          {bodyState === 'empty' && (
            <TableBody>
              <TableRow>
                <TableCell colSpan={totalColumns} align='center'>
                  {emptyTableComponent ? emptyTableComponent : <Typography>No rows to display.</Typography>}
                </TableCell>
              </TableRow>
            </TableBody>
          )}
          {bodyState === 'rows' && (
            <TableBody>
              {rows.map((row, index) => {
                index = rowsPerPage * page + index;
                const isSelected = typeof selectedRows[index] !== 'undefined';
                return (
                  <TableRow
                    hover
                    tabIndex={-1}
                    key={index}
                    selected={isSelected}
                    onPointerDown={
                      rowOnClick
                        ? (event: React.PointerEvent) => {
                            pointerDownAt.current = { x: event.clientX, y: event.clientY };
                          }
                        : undefined
                    }
                    onClick={
                      rowOnClick
                        ? (event: React.MouseEvent) => handleRowOnClick(row, event, rowOnClick, navigate)
                        : undefined
                    }
                  >
                    {buttons && buttons.length > 0 && (
                      <TableCell padding='checkbox'>
                        <Checkbox
                          checked={isSelected}
                          onChange={(event) => {
                            event.stopPropagation();
                            toggleSelectRow(index, row);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          inputProps={{
                            'aria-label': 'Select row',
                          }}
                        />
                      </TableCell>
                    )}
                    {columns.map((column, index) => {
                      const { value: cellValue, isCustomRendered } = formatCellValue(row[column], column, row);
                      return (
                        <TableCell key={index} {...columnConfig?.[column]?.cellProps}>
                          {isCustomRendered ? cellValue : <Typography>{cellValue}</Typography>}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          )}
        </MuiTable>
      </TableContainer>
    );
  };

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {(title || description || (buttons && buttons.length > 0)) && (
        <TableToolbar
          title={title}
          description={description}
          selectedRows={Object.values(selectedRows)}
          content={toolbarContent}
          buttons={buttons}
          sx={toolbarSx}
        />
      )}
      <Box
        ref={infScrollContainerRef}
        sx={[
          { width: '100%', flexGrow: 1, overflow: 'auto' },
          ...(Array.isArray(scrollContainerSx) ? scrollContainerSx : [scrollContainerSx]),
        ]}
      >
        {infiniteScroll ? (
          <InfiniteScroll
            next={handleFetchNextPage}
            hasMore={!!hasNextPage}
            isFetching={isFetchingNextPage}
            loader={
              infiniteScrollLoader || (
                <Typography variant='body2' sx={{ p: 2 }}>
                  Loading...
                </Typography>
              )
            }
            scrollableTarget={infScrollContainer}
          >
            {isPhone ? renderPhoneList() : renderTableContainer()}
          </InfiniteScroll>
        ) : isPhone ? (
          renderPhoneList()
        ) : (
          renderTableContainer()
        )}
        {pagination && (
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50, 100, 200]}
            component='div'
            count={totalRows || 0}
            rowsPerPage={rowsPerPage}
            page={isLoading ? page : Math.min(page, maxPage)}
            onPageChange={(event, newPage) => setPage(newPage)}
            onRowsPerPageChange={(event) => updateRowsPerPage(parseInt(event.target.value))}
            {...tablePaginationProps}
          />
        )}
      </Box>
      {/* Sibling immediately AFTER the scroller: the zero-height strip floats the button over
          the scroller's bottom edge without taking layout space. */}
      {scrollTopButton && (
        <ScrollTopButton scrollContainer={infScrollContainer} {...(scrollTopButton === true ? {} : scrollTopButton)} />
      )}
    </Box>
  );
}
