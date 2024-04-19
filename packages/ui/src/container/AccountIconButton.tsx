import React from 'react';
import { Button, IconButton, Menu, MenuItem } from '@mui/material';
import AccountCircle from '@mui/icons-material/AccountCircle';
import { useNavigate } from 'react-router-dom';
import { LinkOrDialog } from './NavMenu';
import { Page } from '../router/Page';

export type AccountIconButtonProps = {
  loginClicked: boolean,
  setLoginClicked: React.Dispatch<React.SetStateAction<boolean>>,
  auth?: {
    isLoggedIn: boolean,
    canViewPage: (page: Page) => boolean,
    /** Either a dialog component, or a path to be redirected to */
    login: LinkOrDialog,
    logout: () => Promise<string>
  },
  profileMenuItems?: { name: string, action: LinkOrDialog }[],
}

export const AccountIconButton = ({ loginClicked, setLoginClicked, auth, profileMenuItems }: AccountIconButtonProps) => {
  const navigate = useNavigate();
  const [selectedProfileMenuItem, setSelectedProfileMenuItem] = React.useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = React.useState<number>(1);
  const [anchorEl, setAccountMenuAnchorEl] = React.useState<null|HTMLElement>(null);
  const open = Boolean(anchorEl);

  if (!auth)
      return null;

  if (auth.isLoggedIn) {
      return (
          <div>
              <IconButton
                  sx={{
                      '&:hover': {
                          color: '#fff',
                          backgroundColor: 'transparent',
                      },
                      backgroundColor: 'transparent',
                  }}
                  onClick={event => setAccountMenuAnchorEl(event.currentTarget)}
              >
                  <AccountCircle />
              </IconButton>
              <Menu
                  anchorEl={anchorEl}
                  keepMounted
                  open={open}
                  onClose={() => setAccountMenuAnchorEl(null)}
              >
                  {profileMenuItems &&
                      profileMenuItems.map((profileMenuItem, index) => (
                          <MenuItem 
                              onClick={event => {
                                  if (typeof profileMenuItem.action === 'string') {
                                      navigate(qualifiedPath(profileMenuItem.action));
                                      return;
                                  }
                                  setSelectedIndex(index);
                              }}
                              selected={selectedIndex === index}
                          >
                              {profileMenuItem.name}
                          </MenuItem>
                      ))
                  }
                  <MenuItem 
                      onClick={async (event) => {
                          const redirectPath = await auth.logout();
                          navigate(qualifiedPath(redirectPath));
                      }}
                  >
                      Logout
                  </MenuItem>
              </Menu>
              <ProfileMenuItemAction />
          </div>
      );
  }

  return (
      <div>
          <Button
            color='inherit'
            onClick={event => auth && typeof auth.login === 'string' ? navigate(qualifiedPath(auth.login)) : setLoginClicked(!loginClicked)}
          >
              Login
          </Button>
          <Login />
      </div>
  );

  function ProfileMenuItemAction() {
    if (selectedProfileMenuItem == -1 || !auth || !profileMenuItems)
        return null;
  
    const menuItem = profileMenuItems[selectedProfileMenuItem];
    if (typeof menuItem.action === 'string')
        return null;
  
    return <menuItem.action onClose={() => setSelectedProfileMenuItem(-1)} />;
  }
  
  function Login() {
    if (!loginClicked || !auth || typeof auth.login === 'string')
        return null;
  
    return <auth.login onClose={() => setLoginClicked(false)} />;
  }
  
  function qualifiedPath(path: string) {
    if (path.startsWith('/'))
        return path;
  
    return `/${path}`;
  }
}