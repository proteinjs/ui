import React from 'react';
import { SxProps, Theme } from '@mui/material';
import { Loadable, SourceRepository } from '@proteinjs/reflection';
import { NavigateFunction } from 'react-router-dom';

export const getPages = () => SourceRepository.get().objects<Page>('@proteinjs/ui/Page');

export type PageComponentProps = {
  urlParams: { [key: string]: string };
};

export interface Page extends Loadable {
  name: string;
  path: string | string[];
  component: React.ComponentType<PageComponentProps>;
  /** Render component on its own without any additional, top-level container */
  noPageContainer?: boolean;
  auth?: {
    /** If true, the user does not need to be logged in or have any roles to access this page. If blank, defaults to false. */
    public?: boolean;
    /** If true, the user does not need to have any roles to access this page, but must be logged in. If blank, defaults to false. */
    allUsers?: boolean;
    /** The user must be logged in and have these roles to access this page. If blank, defaults to requiring the 'admin' role. */
    roles?: string[];
    /**
     * The user must hold this abstract permission slug, resolved to roles at runtime through the
     * consumer app's `PermissionRolesMapping` (enforced by the auth container's `canViewPage` —
     * see @proteinjs/user-ui). Generic pages declare permissions; only the consumer names roles.
     * Takes precedence over `roles` when both are set. Admin passes every permission (break-glass).
     */
    permission?: string;
  };
  pageContainerSxProps?: (theme: Theme) => SxProps;
}
