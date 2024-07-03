import React, { useEffect, useState } from 'react';
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
} from '@mui/material';
import moment from 'moment';
import { StringUtil } from '@proteinjs/util';
import { TableLoader } from './TableLoader';
import { TableButton } from './TableButton';
import { TableToolbar } from './TableToolbar';
import InfiniteScroll from 'react-infinite-scroll-component';
import { useTableQuery } from './tableData';

type ColumnValue<T, K extends keyof T> = T[K];
export type CustomRenderer<T, K extends keyof T> = (value: ColumnValue<T, K>, row: T) => React.ReactNode;
export type ColumnConfig<T> = {
  [K in keyof T]?: {
    renderer?: (value: T[K], row: T) => React.ReactNode;
    header?: string | React.ReactNode;
  };
};

export type TableProps<T> = {
  title?: string;
  description?: () => JSX.Element;
  columns: (keyof T)[];
  columnConfig?: ColumnConfig<T>;
  tableLoader: TableLoader<T>;
  rowOnClickRedirectUrl?: (row: T) => Promise<string>;
  buttons?: TableButton<T>[];
  /**
   * Should not use if you have infiniteScroll set to true. Defaults to false.
   *  */
  pagination?: boolean;
  /**
   * Should not use if you have pagination set to true. Defaults to true.
   * */
  infiniteScroll?: boolean;
  /*
   * Pertains to pagination or infinite scroll, depending on which is enabled.
   * */
  defaultRowsPerPage?: number;
  /*
   * Styling set on the root element of the toolbar.
   * */
  toolbarSx?: ToolbarProps['sx'];
  /*
   * Content that will be displayed in the toolbar section of the table.
   * */
  toolbarContent?: React.ReactNode;
  /*
   * Styling set on the container element of the table.
   * */
  tableContainerSx?: TableContainerOwnProps['sx'];
};

export function Table<T>({
  title,
  description,
  columns,
  columnConfig = {},
  tableLoader,
  rowOnClickRedirectUrl,
  pagination = false,
  infiniteScroll = !pagination,
  defaultRowsPerPage = 10,
  buttons,
  tableContainerSx,
  toolbarSx,
  toolbarContent,
}: TableProps<T>) {
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [page, setPage] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [selectedRows, setSelectedRows] = useState<{ [key: number]: T }>({});
  const [selectAll, setSelectAll] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const navigate = useNavigate();

  const startIndex = page * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  // TODO useTableQuery hook is not taking in the new TableLoader
  const { data: rowWindow, isLoading, isFetching, error } = useTableQuery<T>(tableLoader, startIndex, endIndex);
  const rows = rowWindow?.rows || [];
  const totalRows = rowWindow?.totalCount || 0;

  // const fetchDataInfScroll = async () => {
  //   setLoadingRows(true);
  //   const startIndex = rows.length;
  //   const endIndex = startIndex + rowsPerPage;
  //   const rowWindow = await tableLoader.load(startIndex, endIndex);
  //   setRows((prevRows) => [...prevRows, ...rowWindow.rows]);
  //   setTotalRows(rowWindow.totalCount);
  //   setLoadingRows(false);
  // };

  // // Infinite scroll, reset data fetch for new table loader
  // useEffect(() => {
  //   setPage(0);
  //   setRows([]);
  //   setLoadingRows(true);

  //   const fetchInitialData = async () => {
  //     const rowWindow = await tableLoader.load(0, rowsPerPage);
  //     setRows(rowWindow.rows);
  //     setTotalRows(rowWindow.totalCount);
  //     setLoadingRows(false);
  //     if (isFirstLoad) {
  //       setIsFirstLoad(false);
  //     }
  //   };

  //   if (infiniteScroll) {
  //     fetchInitialData();
  //   }
  // }, [tableLoader]);

  async function handleRowOnClick(row: T) {
    if (!rowOnClickRedirectUrl) {
      return;
    }

    let redirectUrl = await rowOnClickRedirectUrl(row);
    if (!redirectUrl.startsWith('/')) {
      redirectUrl = `/${redirectUrl}`;
    }

    navigate(redirectUrl);
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

  function formatCellValue(value: any, column: keyof T, row: T): React.ReactNode {
    const customRenderer = columnConfig[column]?.renderer;
    if (customRenderer) {
      return customRenderer(value, row);
    }

    // Default formatting logic
    if (value == null) {
      return '';
    }

    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }

    if (moment.isMoment(value)) {
      return value.format('ddd, MMM Do YY, h:mm:ss a');
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return value.toString();
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
              {columns.map((column, index) => (
                <TableCell key={index}>
                  <Typography variant='h6'>
                    {columnConfig[column]?.header || StringUtil.humanizeCamel(column as string)}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          {isFirstLoad && (
            <TableBody>
              <TableRow>
                <TableCell colSpan={totalColumns} sx={{ p: 2 }}>
                  <Typography>Loading...</Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          )}
          {rows.length === 0 && !loadingRows && (
            <TableBody>
              <TableRow>
                <TableCell colSpan={totalColumns} align='center'>
                  <Typography>No rows to display.</Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          )}
          {rows.length > 0 && (
            <TableBody>
              {rows.map((row, index) => {
                index = rowsPerPage * page + index;
                return (
                  <TableRow
                    hover
                    role='checkbox'
                    tabIndex={-1}
                    key={index}
                    selected={typeof selectedRows[index] !== 'undefined'}
                    onClick={(event: any) => handleRowOnClick(row)}
                  >
                    {buttons && buttons.length > 0 && (
                      <TableCell padding='checkbox'>
                        <Checkbox
                          checked={typeof selectedRows[index] !== 'undefined'}
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
                      const cellValue = formatCellValue(row[column], column, row);
                      return (
                        <TableCell key={index}>
                          <Typography>{cellValue}</Typography>
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
          <div />
          // <InfiniteScroll
          //   dataLength={rows.length}
          //   next={fetchDataInfScroll}
          //   hasMore={rows.length < totalRows}
          //   loader={<Typography sx={{ p: 2 }}>Loading...</Typography>}
          //   scrollableTarget='infinite-scroll-container'
          // >
          //   {renderTableContainer()}
          // </InfiniteScroll>
        ) : (
          renderTableContainer()
        )}
        {pagination && (
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50, 100, 200]}
            component='div'
            count={totalRows}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(event, newPage) => setPage(newPage)}
            onRowsPerPageChange={(event) => updateRowsPerPage(parseInt(event.target.value))}
          />
        )}
      </Box>
    </Box>
  );
}
