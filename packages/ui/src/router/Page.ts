import React from 'react';
import { SxProps, Theme } from '@mui/material';
import { Loadable, SourceRepository } from '@proteinjs/reflection';
import { NavigateFunction } from 'react-router-dom';
import { FormFactor } from '../hooks/useFormFactor';

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
  /**
   * Styles for the container that hosts this page, resolved against the active theme and the
   * viewer's form factor (`useFormFactor` — the same layout fork the page's own component forks
   * on). A page whose presentation differs by form factor declares its container's styles per
   * posture here — the ground it paints edge to edge, say — so the container and the page never
   * disagree on them. Containers hand the form factor they lay out on (`PageContainer` does, and a
   * `CustomPageContainer` that forks its layout on the form factor hands the same value); a page
   * that forks on it may rely on it. A method signature on purpose: a page may declare the form
   * factor required.
   */
  pageContainerSxProps?(theme: Theme, formFactor?: FormFactor): SxProps;
}
