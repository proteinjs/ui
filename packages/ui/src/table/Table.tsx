import React, { useCallback, useEffect, useState } from 'react';
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
  /** Setter which will be used to update the row data when rows are loaded */
  setRows?: React.Dispatch<React.SetStateAction<T | undefined>>;
  rowOnClick?: RowClickAction<T>;
  /** Buttons displayed in the table head */
  buttons?: TableButton<T>[];
  /** If true, use pagination for table page navigation, if false uses infinite scroll. Defaults to false. */
  pagination?: boolean;
  /** Props passed into the TablePagination component. This component is only displayed if `pagination` is true. */
  tablePaginationProps?: Partial<TablePaginationProps>;
  /* Pertains to pagination or infinite scroll, depending on which is enabled. */
  defaultRowsPerPage?: number;
  /* Styling set on the root element of the toolbar. */
  toolbarSx?: ToolbarProps['sx'];
  /* Content that will be displayed in the toolbar section of the table. */
  toolbarContent?: React.ReactNode;
  /* Styling set on the container element of the table. */
  tableContainerSx?: TableContainerOwnProps['sx'];
  /* Component displayed when there are no rows to display. */
  emptyTableComponent?: React.ReactNode;
  /* Loading skeleton that's displayed before the table rows are first fetched.\
   * You can use these class names to target the containers with styling:
   * - `loading-skeleton-table-body`
   * - `loading-skeleton-row`
   * - `loading-skeleton-cell`
   */
  skeleton?: React.ReactNode;
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
  defaultRowsPerPage = 10,
  buttons,
  tableContainerSx,
  toolbarSx,
  toolbarContent,
  emptyTableComponent,
  skeleton,
}: TableProps<T>) {
  const infiniteScroll = !pagination;
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [page, setPage] = useState(0);
  const [selectedRows, setSelectedRows] = useState<{ [key: number]: T }>({});
  const [selectAll, setSelectAll] = useState(false);
  const navigate = useNavigate();

  const { rows, totalRows, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, resetQuery } =
    useTableData<T>(tableLoader, rowsPerPage, page, infiniteScroll, setRowCount, refetchOnWindowFocus);

  const isLoadingTrue = true;

  useEffect(() => {
    resetQuery();
    setPage(0);
  }, [tableLoader, resetQuery]);

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

  const renderTableContainer = () => {
    const totalColumns = columns.length + (buttons && buttons.length > 0 ? 1 : 0);

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
          {isLoading && (
            <TableBody className='loading-skeleton-table-body'>
              <TableRow className='loading-skeleton-row'>
                <TableCell colSpan={totalColumns} align='center' className='loading-skeleton-cell' sx={{ py: 3 }}>
                  {skeleton ? skeleton : <CircularProgress />}
                </TableCell>
              </TableRow>
            </TableBody>
          )}
          {rows.length === 0 && !isLoading && (
            <TableBody>
              <TableRow>
                <TableCell colSpan={totalColumns} align='center'>
                  {emptyTableComponent ? emptyTableComponent : <Typography>No rows to display.</Typography>}
                </TableCell>
              </TableRow>
            </TableBody>
          )}
          {rows.length > 0 && (
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
      <Box id='infinite-scroll-container' sx={{ width: '100%', flexGrow: 1, overflow: 'auto' }}>
        {infiniteScroll ? (
          <InfiniteScroll
            dataLength={rows.length}
            next={handleFetchNextPage}
            hasMore={!!hasNextPage}
            loader={
              <Typography variant='body2' sx={{ p: 3 }}>
                Loading...
              </Typography>
            }
            scrollableTarget='infinite-scroll-container'
          >
            {renderTableContainer()}
          </InfiniteScroll>
        ) : (
          renderTableContainer()
        )}
        {pagination && (
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50, 100, 200]}
            component='div'
            count={totalRows || 0}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(event, newPage) => setPage(newPage)}
            onRowsPerPageChange={(event) => updateRowsPerPage(parseInt(event.target.value))}
            {...tablePaginationProps}
          />
        )}
      </Box>
    </Box>
  );
}
