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
} from '@mui/material';
import moment from 'moment';
import { StringUtil } from '@proteinjs/util';
import { TableLoader } from './TableLoader';
import { TableButton } from './TableButton';
import { TableToolbar } from './TableToolbar';

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
  toolbarSx?: ToolbarProps['sx'];
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
}: TableProps<T>) {
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [page, setPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [rows, setRows] = React.useState<T[]>([]);
  const [loadingMoreRows, setLoadingMoreRows] = useState(false);
  const [selectedRows, setSelectedRows] = useState<{ [key: number]: T }>({});
  const [selectAll, setSelectAll] = useState(false);
  const navigate = useNavigate();
  const totalPages = Math.ceil(totalRows / rowsPerPage);

  // Pagination fetch data logic
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

  // Infinite scroll fetch data logic
  useEffect(() => {
    const fetchData = async () => {
      setLoadingMoreRows(true);
      if (page === 0) {
        setPage(1);
      }
      if (page <= totalPages) {
        const startIndex = rows.length;
        const endIndex = startIndex + rowsPerPage;
        const rowWindow = await tableLoader.load(startIndex, endIndex);
        setRows((prevRows) => [...prevRows, ...rowWindow.rows]);
        setTotalRows(rowWindow.totalCount);
      }
      setLoadingMoreRows(false);
    };

    if (infiniteScroll) {
      fetchData();
    }
  }, [page]);

  const observer = useRef(
    new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first.isIntersecting) {
        setPage((num) => num + 1);
      }
    })
  );

  const loadMoreRef = useCallback((row: HTMLTableRowElement) => {
    if (observer.current) {
      observer.current.disconnect();
    }

    if (row) {
      observer.current.observe(row);
    }
  }, []);

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

  return (
    <Box
      sx={{
        overflow: 'auto',
        width: '100%',
        height: '100%',
      }}
    >
      <Box>
        {(title || description || (buttons && buttons.length > 0)) && (
          <TableToolbar
            title={title}
            description={description}
            selectedRows={Object.values(selectedRows)}
            buttons={buttons}
            sx={toolbarSx}
          />
        )}
        <TableContainer sx={tableContainerSx}>
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
            <TableBody>
              {rows.map((row, index) => {
                const isLastRow = infiniteScroll && index === rows.length - 1 && !loadingMoreRows && page <= totalPages;
                index = rowsPerPage * page + index;
                return (
                  <TableRow
                    hover
                    role='checkbox'
                    tabIndex={-1}
                    key={index}
                    selected={typeof selectedRows[index] !== 'undefined'}
                    ref={isLastRow ? loadMoreRef : null}
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
          </MuiTable>
        </TableContainer>
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
