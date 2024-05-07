import React from 'react';
import { SxProps, Theme } from '@mui/material';
import { Loadable, SourceRepository } from '@proteinjs/reflection';
import { NavigateFunction } from 'react-router-dom';

export const getPages = () => SourceRepository.get().objects<Page>('@proteinjs/ui/Page');

export type PageComponentProps = {
    urlParams: {[key: string]: string}, 
    navigate: NavigateFunction,
}

export interface Page extends Loadable {
    name: string;
    path: string|string[];
    component: React.ComponentType<PageComponentProps>;
    /** Render component on its own without any additional, top-level container */
    noPageContainer?: boolean;
    auth?: {
        /** If true, the user does not need to be logged in or have any roles to access this page. If blank, defaults to false. */
        public?: boolean;
        /** If true, the user does not need to have any roles to access this page, but must be logged in. If blank, defaults to false. */
        allUsers?: boolean,
        /** The user must be logged in and have these roles to access this page. If blank, defaults to requiring the 'admin' role. */
        roles?: string[];
    };
    pageContainerSxProps?: (theme: Theme) => SxProps;
}
