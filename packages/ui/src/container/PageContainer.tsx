import React from 'react';
import { AppBar, Toolbar, Box, IconButton, Typography, AppBarProps, ToolbarProps } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { NavigateFunction, useNavigate } from 'react-router-dom';
import { Page } from '../router/Page';
import { useFormFactor } from '../hooks/useFormFactor';
import { createUrlParams } from '../router/createUrlParams';
import { LinkOrDialog, NavMenu, NavMenuItem } from './NavMenu';
import { AccountIconButton, AccountIconButtonProps } from './AccountIconButton';
import { AccountAuth } from './AccountAuth';
import { DefaultUnauthorizedPage, UnauthorizedPageProps } from './DefaultUnauthorizedPage';

function qualifiedPath(path: string) {
  if (path.startsWith('/')) {
    return path;
  }

  return `/${path}`;
}

interface AccountIconButtonWithNavigateProps extends AccountIconButtonProps {
  navigate: NavigateFunction;
}

export interface CustomPageContainerProps {
  page: Page;
  children: React.ReactNode;
  /** The page's own declaration (`Page.pageContainerSxProps`); the custom container resolves it with the theme and the form factor it lays out on. */
  pageContainerSxProps: Page['pageContainerSxProps'];
  loginClicked: boolean;
  setLoginClicked: React.Dispatch<React.SetStateAction<boolean>>;
  auth?: {
    isLoggedIn: boolean;
    canViewPage: (page: Page) => boolean;
    /** Either a dialog component, or a path to be redirected to */
    login: LinkOrDialog;
    logout: () => Promise<string>;
  };
}

export type PageContainerProps = {
  page: Page;
  auth?: AccountAuth;
  /** Will be used to render the `Page` within as children */
  CustomPageContainer?: React.ComponentType<CustomPageContainerProps>;
  /**
   * Rendered in place of the page when the user is logged in but `auth.canViewPage` denies access.
   * Defaults to `DefaultUnauthorizedPage`.
   */
  unauthorizedPage?: React.ComponentType<UnauthorizedPageProps>;
  appName?: string;
  toolbarChildren?: React.ReactNode;
  /** An array of menu items, each containing a React node and an action triggered when selected, either a string, dialog component, or a function. */
  profileMenuItems?: { menuItemChildren: React.ReactNode; action?: LinkOrDialog }[];
  navMenuItems?: NavMenuItem[];
  appBarProps?: AppBarProps;
  toolbarProps?: ToolbarProps;
  CustomAccountIconButton?: React.ComponentType<AccountIconButtonWithNavigateProps>;
  abovePageSlot?: React.ReactNode;
};

const Page = React.memo(
  ({
    auth,
    page,
    loginClicked,
    setLoginClicked,
    unauthorizedPage,
  }: {
    auth: PageContainerProps['auth'];
    page: PageContainerProps['page'];
    loginClicked: boolean;
    setLoginClicked: (loginClicked: boolean) => void;
    unauthorizedPage: PageContainerProps['unauthorizedPage'];
  }) => {
    const urlParams = createUrlParams();
    if (auth?.canViewPage(page)) {
      return <page.component urlParams={urlParams} />;
    }

    if (!auth?.isLoggedIn) {
      if (!loginClicked) {
        setLoginClicked(true);
      }

      return null;
    }

    // Logged in but not allowed to view this page.
    const UnauthorizedPage = unauthorizedPage ?? DefaultUnauthorizedPage;
    return <UnauthorizedPage page={page} />;
  }
);

export function PageContainer(props: PageContainerProps) {
  const navigate = useNavigate();
  const {
    page,
    auth,
    navMenuItems,
    appName,
    toolbarChildren,
    profileMenuItems,
    appBarProps,
    toolbarProps,
    CustomAccountIconButton,
    CustomPageContainer,
    unauthorizedPage,
    abovePageSlot,
  } = props;
  const [loginClicked, setLoginClicked] = React.useState(false);
  const [navMenuOpen, setNavMenuOpen] = React.useState(false);
  // The form factor the page's container styles resolve against (Page.pageContainerSxProps).
  const formFactor = useFormFactor();

  React.useEffect(() => {
    if (auth?.canViewPage(page)) {
      return;
    }

    if (!auth?.isLoggedIn) {
      console.log(`User not logged in, redirecting to login`);
      if (typeof auth?.login === 'string') {
        const p = qualifiedPath(auth.login);
        navigate(p);
      }
    }
  }, [page]);

  if (CustomPageContainer) {
    return (
      <CustomPageContainer
        page={page}
        loginClicked={loginClicked}
        setLoginClicked={setLoginClicked}
        auth={auth}
        pageContainerSxProps={page.pageContainerSxProps}
      >
        <Page
          auth={auth}
          page={page}
          loginClicked={loginClicked}
          setLoginClicked={setLoginClicked}
          unauthorizedPage={unauthorizedPage}
        />
      </CustomPageContainer>
    );
  }

  return (
    <Box
      sx={(theme) => {
        const defaultStyles = { minHeight: '100vh', backgroundColor: theme.palette.background.default };
        if (!page.pageContainerSxProps) {
          return defaultStyles;
        }

        const resolvedStyles = Object.assign({}, defaultStyles, page.pageContainerSxProps(theme, formFactor));

        return resolvedStyles;
      }}
    >
      <AppBar position='static' {...appBarProps}>
        <Toolbar {...toolbarProps}>
          {navMenuItems && (
            <IconButton
              aria-label='menu'
              onClick={() => setNavMenuOpen(!navMenuOpen)}
              sx={(theme) => ({
                marginRight: theme.spacing(2),
                '&:hover': {
                  color: '#fff',
                },
              })}
              style={{ backgroundColor: 'transparent' }}
            >
              <MenuIcon />
            </IconButton>
          )}
          {appName && (
            <Typography variant='h5' sx={{ flexGrow: 1, color: 'common.white' }}>
              {appName}
            </Typography>
          )}
          {toolbarChildren}
          <div style={{ flexGrow: 1 }}></div>
          {CustomAccountIconButton ? (
            <CustomAccountIconButton
              loginClicked={loginClicked}
              setLoginClicked={setLoginClicked}
              auth={auth}
              navigate={navigate}
            />
          ) : (
            <AccountIconButton
              loginClicked={loginClicked}
              setLoginClicked={setLoginClicked}
              auth={auth}
              {...(profileMenuItems ? { profileMenuItems } : {})}
            />
          )}
        </Toolbar>
      </AppBar>
      {navMenuItems && (
        <NavMenu navMenuItems={navMenuItems} navMenuOpen={navMenuOpen} setNavMenuOpen={setNavMenuOpen} />
      )}
      {abovePageSlot}
      <Page
        auth={auth}
        page={page}
        loginClicked={loginClicked}
        setLoginClicked={setLoginClicked}
        unauthorizedPage={unauthorizedPage}
      />
    </Box>
  );
}
