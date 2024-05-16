import React from 'react';
import { Button, IconButton, ListItemIcon, Menu, MenuItem, Typography } from '@mui/material';
import AccountCircle from '@mui/icons-material/AccountCircle';
import { useNavigate } from 'react-router-dom';
import { LinkOrDialog } from './NavMenu';
import LogoutIcon from '@mui/icons-material/Logout';
import { AccountAuth, LoginComponent, qualifiedPath, useAuthActions } from './AccountAuth';

export type AccountIconButtonProps = {
  loginClicked: boolean;
  setLoginClicked: React.Dispatch<React.SetStateAction<boolean>>;
  auth?: AccountAuth;
  profileMenuItems?: { menuItemChildren: React.ReactNode; action?: LinkOrDialog }[];
};

export const AccountIconButton = ({
  loginClicked,
  setLoginClicked,
  auth,
  profileMenuItems,
}: AccountIconButtonProps) => {
  const navigate = useNavigate();
  const { logout, login } = useAuthActions(auth, loginClicked, setLoginClicked);
  const [selectedProfileMenuItem, setSelectedProfileMenuItem] = React.useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = React.useState<number>(1);
  const [anchorEl, setAccountMenuAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  if (!auth) {
    return null;
  }

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
          onClick={(event) => setAccountMenuAnchorEl(event.currentTarget)}
        >
          <AccountCircle />
        </IconButton>
        <Menu anchorEl={anchorEl} keepMounted open={open} onClose={() => setAccountMenuAnchorEl(null)}>
          {profileMenuItems &&
            profileMenuItems.map((profileMenuItem, index) => (
              <MenuItem
                key={index}
                onClick={(event) => {
                  if (typeof profileMenuItem.action === 'string') {
                    navigate(qualifiedPath(profileMenuItem.action));
                    return;
                  } else if (isFunction(profileMenuItem.action)) {
                    setAccountMenuAnchorEl(null);
                    profileMenuItem.action();
                  } else {
                    setSelectedIndex(index);
                  }
                }}
                selected={selectedIndex === index}
              >
                {profileMenuItem.menuItemChildren}
              </MenuItem>
            ))}
          <MenuItem key='logout' onClick={logout}>
            <ListItemIcon>
              <LogoutIcon />
            </ListItemIcon>
            <Typography>Logout</Typography>
          </MenuItem>
        </Menu>
        <ProfileMenuItemAction />
      </div>
    );
  }

  return (
    <div>
      <Button color='inherit' onClick={login}>
        Login
      </Button>
      <LoginComponent auth={auth} loginClicked={loginClicked} setLoginClicked={setLoginClicked} />
    </div>
  );

  function ProfileMenuItemAction() {
    if (selectedProfileMenuItem == -1 || !auth || !profileMenuItems) {
      return null;
    }

    const menuItem = profileMenuItems[selectedProfileMenuItem];
    if (typeof menuItem.action === 'string') {
      return null;
    }

    if (isDialog(menuItem.action)) {
      return <menuItem.action onClose={() => setSelectedProfileMenuItem(-1)} />;
    }

    return null;
  }
};

function isDialog(prop: any): prop is React.ComponentType<{ onClose: () => void }> {
  return typeof prop === 'function' && 'onClose' in prop.prototype;
}

function isFunction(prop: any): prop is () => void {
  return typeof prop === 'function';
}
