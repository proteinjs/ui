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

export type TableProps<T> = {
  title?: string;
  description?: () => JSX.Element;
  columns: (keyof T)[];
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
  const [totalRows, setTotalRows] = useState(0);
  const [rows, setRows] = React.useState<T[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [selectedRows, setSelectedRows] = useState<{ [key: number]: T }>({});
  const [selectAll, setSelectAll] = useState(false);
  const navigate = useNavigate();

  // Pagination fetch
  useEffect(() => {
    const fetchData = async () => {
      const startIndex = page * rowsPerPage;
      const endIndex = startIndex + rowsPerPage;
      const rowWindow = await tableLoader.load(startIndex, endIndex);
      setRows(rowWindow.rows);
      setTotalRows(rowWindow.totalCount);
    };

    if (pagination) {
      fetchData();
    }
  }, [page, rowsPerPage, tableLoader]);

  // Func to be used inside inf scroll component to fetch data
  const fetchDataInfScroll = async () => {
    console.log('fetching more data');
    setLoadingRows(true);
    const startIndex = rows.length;
    const endIndex = startIndex + rowsPerPage;
    const rowWindow = await tableLoader.load(startIndex, endIndex);
    setRows((prevRows) => [...prevRows, ...rowWindow.rows]);
    setTotalRows(rowWindow.totalCount);
    setLoadingRows(false);
  };

  // Infinite scroll, reset data fetch for new table loader
  useEffect(() => {
    setPage(0);
    setRows([]);
    setLoadingRows(true);

    const fetchInitialData = async () => {
      const rowWindow = await tableLoader.load(0, rowsPerPage);
      setRows(rowWindow.rows);
      setTotalRows(rowWindow.totalCount);
      setLoadingRows(false);
    };

    if (infiniteScroll && !loadingRows) {
      fetchInitialData();
    }
  }, [tableLoader]);

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

  function formatCellValue(value: any): string {
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

  console.log(`[table] hasMore: ${rows.length < totalRows}, rowlength: ${rows.length} and total rows: ${totalRows}`);

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
        <InfiniteScroll
          dataLength={rows.length}
          next={fetchDataInfScroll}
          hasMore={rows.length < totalRows}
          loader={<Typography sx={{ p: 2 }}>Loading...</Typography>}
          scrollableTarget='infinite-scroll-container'
        >
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
                      <Typography variant='h6'>{StringUtil.humanizeCamel(column as string)}</Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              {rows.length === 0 && !loadingRows && <Typography sx={{ p: 2 }}>No rows to display.</Typography>}
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
                      >
                        {buttons && buttons.length > 0 && (
                          <TableCell padding='checkbox'>
                            <Checkbox
                              checked={typeof selectedRows[index] !== 'undefined'}
                              onChange={(event, value) => toggleSelectRow(index, row)}
                              inputProps={{
                                'aria-label': 'Select row',
                              }}
                            />
                          </TableCell>
                        )}
                        {columns.map((column, index) => {
                          const cellValue = formatCellValue(row[column]);
                          return (
                            <TableCell key={index} onClick={(event: any) => handleRowOnClick(row)}>
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
        </InfiniteScroll>
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
