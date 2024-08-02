import React from 'react';
import { AppBar, Toolbar, Box, IconButton, Typography, AppBarProps, ToolbarProps, MenuProps } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { NavigateFunction, useNavigate } from 'react-router-dom';
import { Page } from '../router/Page';
import { createUrlParams } from '../router/createUrlParams';
import { LinkOrDialog, NavMenu, NavMenuItem } from './NavMenu';
import { AccountIconButton, AccountIconButtonProps } from './AccountIconButton';
import { AccountAuth } from './AccountAuth';

function qualifiedPath(path: string) {
  if (path.startsWith('/')) {
    return path;
  }

  return `/${path}`;
}

export type PageContainerProps = {
  page: Page;
  auth?: AccountAuth;
  appName?: string;
  toolbarChildren?: React.ReactNode;
  /** An array of menu items, each containing a React node and an action triggered when selected, either a string, dialog component, or a function. */
  profileMenuItems?: { menuItemChildren: React.ReactNode; action?: LinkOrDialog }[];
  navMenuItems?: NavMenuItem[];
  appBarProps?: AppBarProps;
  toolbarProps?: ToolbarProps;
  CustomAccountIconButton?: React.ComponentType<AccountIconButtonProps>;
  abovePageSlot?: React.ReactNode;
};

const Page = React.memo(
  ({
    auth,
    page,
    navigate,
    loginClicked,
    setLoginClicked,
  }: {
    auth: PageContainerProps['auth'];
    page: PageContainerProps['page'];
    navigate: NavigateFunction;
    loginClicked: boolean;
    setLoginClicked: (loginClicked: boolean) => void;
  }) => {
    if (auth?.canViewPage(page)) {
      return <page.component urlParams={createUrlParams()} navigate={navigate} />;
    }

    if (!auth?.isLoggedIn) {
      if (!loginClicked) {
        setLoginClicked(true);
      }

      return null;
    }

    navigate('/');
    return null;
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
    abovePageSlot,
  } = props;
  const [loginClicked, setLoginClicked] = React.useState(false);
  const [navMenuOpen, setNavMenuOpen] = React.useState(false);

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

  return (
    <Box
      sx={(theme) => {
        const defaultStyles = { minHeight: '100vh', backgroundColor: theme.palette.background.default };
        if (!page.pageContainerSxProps) {
          return defaultStyles;
        }

        const resolvedStyles = Object.assign({}, defaultStyles, page.pageContainerSxProps(theme));

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
            <CustomAccountIconButton loginClicked={loginClicked} setLoginClicked={setLoginClicked} auth={auth} />
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
      <Page auth={auth} page={page} navigate={navigate} loginClicked={loginClicked} setLoginClicked={setLoginClicked} />
    </Box>
  );
}
