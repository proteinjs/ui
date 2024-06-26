import React from 'react';
import { useNavigate } from 'react-router-dom';
import S from 'string';
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
  defaultRowsPerPage?: number;
  buttons?: TableButton<T>[];
};

export function Table<T>({
  title,
  description,
  columns,
  tableLoader,
  rowOnClickRedirectUrl,
  defaultRowsPerPage = 10,
  buttons,
}: TableProps<T>) {
  const [rowsPerPage, setRowsPerPage] = React.useState(defaultRowsPerPage);
  const [page, setPage] = React.useState(0);
  const [totalRows, setTotalRows] = React.useState(0);
  const [rows, setRows] = React.useState<T[]>([]);
  const [selectedRows, setSelectedRows] = React.useState<{ [key: number]: T }>({});
  const [selectAll, setSelectAll] = React.useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    const fetchData = async () => {
      const startIndex = page * rowsPerPage;
      const endIndex = startIndex + rowsPerPage;
      const rowWindow = await tableLoader.load(startIndex, endIndex);
      setRows(rowWindow.rows);
      setTotalRows(rowWindow.totalCount);
    };

    fetchData();
  }, [page, rowsPerPage, tableLoader]);

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
    <div style={{ overflow: 'auto', width: '100%' }}>
      {(title || description || (buttons && buttons.length > 0)) && (
        <TableToolbar
          title={title}
          description={description}
          selectedRows={Object.values(selectedRows)}
          buttons={buttons}
        />
      )}
      <TableContainer>
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
                        <Typography variant='subtitle1'>{cellValue}</Typography>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </MuiTable>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50, 100, 200]}
        component='div'
        count={totalRows}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(event, newPage) => setPage(newPage)}
        onRowsPerPageChange={(event) => updateRowsPerPage(parseInt(event.target.value))}
      />
    </div>
  );
}
