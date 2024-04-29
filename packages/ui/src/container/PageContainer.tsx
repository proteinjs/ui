import React from 'react';
import { AppBar, Toolbar, Box, IconButton, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { NavigateFunction, useNavigate } from 'react-router-dom';
import { Page } from '../router/Page';
import { createUrlParams } from '../router/createUrlParams';
import { LinkOrDialog, NavMenu, NavMenuItem } from './NavMenu';
import { AccountIconButton } from './AccountIconButton';

export type PageContainerProps = {
    appName: string,
    page: Page,
    toolbarChildren?: React.ReactNode,
    auth?: {
        isLoggedIn: boolean,
        canViewPage: (page: Page) => boolean,
        /** Either a dialog component, or a path to be redirected to */
        login: LinkOrDialog,
        logout: () => Promise<string>
    },
    profileMenuItems?: { name: string, action: LinkOrDialog }[],
    navMenuItems?: NavMenuItem[],
}

const Page = React.memo(({ auth, page, navigate, loginClicked, setLoginClicked }: { auth: PageContainerProps['auth'], page: PageContainerProps['page'], navigate: NavigateFunction, loginClicked: boolean, setLoginClicked: (loginClicked: boolean) => void }) => {
    if (auth?.canViewPage(page))
        return <page.component urlParams={createUrlParams()} navigate={navigate} />;

    if (!auth?.isLoggedIn) {
        if (!loginClicked)
            setLoginClicked(true);
        
        return null;
    }

    navigate('/');
    return null;
});

export function PageContainer(props: PageContainerProps) {
    const navigate = useNavigate();
    const { appName, page, toolbarChildren, auth, profileMenuItems, navMenuItems } = props;
    const [loginClicked, setLoginClicked] = React.useState(false);
    const [navMenuOpen, setNavMenuOpen] = React.useState(false);
    
    React.useEffect(() => {
        if (auth?.canViewPage(page))
            return;

        if (!auth?.isLoggedIn) {
            console.log(`User not logged in, redirecting to login`);
            if (typeof auth?.login === 'string') {
                const p = qualifiedPath(auth.login);
                navigate(p);
            }
        }
    }, [page]);

    return (
        <Box sx={(theme) => {
            const defaultStyles = {};
            if (!page.pageContainerSxProps)
                return defaultStyles;

            let resolvedStyles = Object.assign({}, defaultStyles, page.pageContainerSxProps(theme));

            return resolvedStyles;
        }}>
            <AppBar position='static'>
                <Toolbar>
                    { navMenuItems && 
                        <IconButton
                            aria-label='menu'
                            onClick={event => setNavMenuOpen(!navMenuOpen)} 
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
                    }
                    <Typography variant='h5' sx={{ flexGrow: 1, color: 'common.white', }}>
                        {appName}
                    </Typography>
                    {toolbarChildren}
                    <AccountIconButton loginClicked={loginClicked} setLoginClicked={setLoginClicked} auth={auth} profileMenuItems={profileMenuItems} />
                </Toolbar>
            </AppBar>
            <NavMenu navMenuItems={navMenuItems} navMenuOpen={navMenuOpen} setNavMenuOpen={setNavMenuOpen} />
            <Page auth={auth} page={page} navigate={navigate} loginClicked={loginClicked} setLoginClicked={setLoginClicked} />
        </Box>
    );

    function qualifiedPath(path: string) {
        if (path.startsWith('/'))
            return path;

        return `/${path}`;
    }
}