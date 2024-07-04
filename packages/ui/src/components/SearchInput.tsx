import React, { useCallback, useRef } from 'react';
import { Box, InputAdornment, TextField, IconButton, SxProps, Theme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { Debouncer } from '@proteinjs/util';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  debounceTime?: number;
  placeholder?: string;
  sx?: SxProps<Theme>;
  inputSx?: SxProps<Theme>;
  variant?: 'standard' | 'filled' | 'outlined';
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onClear,
  debounceTime = 500,
  placeholder = 'Search...',
  sx,
  inputSx,
  variant = 'outlined',
}) => {
  const searchDebouncerRef = useRef(new Debouncer(debounceTime));

  const handleChangeSearchInput = useCallback<React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>>(
    (event) => {
      const newValue = event.target.value;
      searchDebouncerRef.current.debounce(() => {
        onChange(newValue);
      });
    },
    [onChange]
  );

  return (
    <Box sx={sx}>
      <TextField
        variant={variant}
        value={value}
        onChange={handleChangeSearchInput}
        placeholder={placeholder}
        InputProps={{
          startAdornment: (
            <InputAdornment position='start'>
              <SearchIcon />
            </InputAdornment>
          ),
          endAdornment: value && onClear && (
            <InputAdornment position='end'>
              <IconButton onClick={onClear} edge='end' size='small'>
                <ClearIcon />
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={inputSx}
      />
    </Box>
  );
};
