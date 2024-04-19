import React from 'react';
import { PaperProps, Paper } from '@mui/material';

export function FormPaper(props: PaperProps) {
    return (
        <Paper 
            sx={(theme) => ({
                padding: theme.spacing(2, 2, 1),
		        width: 'fit-content'
            })} 
            {...props}
        >
            {props.children}
        </Paper>
    );
}