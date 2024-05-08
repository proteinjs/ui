import React from 'react';
import { Drawer, Toolbar, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { Navigate } from 'react-router-dom';

export type LinkOrDialog = string | React.ComponentType<{ onClose: () => void }>;

export type NavMenuItem = {
  name: string;
  action: LinkOrDialog;
  icon?: React.ComponentType;
  /** Use to make this item a divider */
  // isDivider?: boolean,
  /** Use to make this item a nested menu */
  // children?: NavMenuItems
};

export type NavMenuProps = {
  navMenuItems?: NavMenuItem[];
  navMenuOpen: boolean;
  setNavMenuOpen: (open: boolean) => void;
};

const drawerWidth = 240;

export const NavMenu: React.FC<NavMenuProps> = ({ navMenuItems, navMenuOpen, setNavMenuOpen }) => {
  const [selectedNavMenuItem, setSelectedNavMenuItem] = React.useState<number>(-1);

  const handleNavMenuItemClick = (index: number) => {
    setSelectedNavMenuItem(index);
    setNavMenuOpen(false);
  };

  const NavMenuItemAction = () => {
    if (selectedNavMenuItem == -1 || !navMenuItems) return null;

    const menuItem = navMenuItems[selectedNavMenuItem];

    React.useEffect(() => {
      setSelectedNavMenuItem(-1);
    }, [selectedNavMenuItem]);

    if (typeof menuItem.action === 'string') return <Navigate to={qualifiedPath(menuItem.action)} />;

    return <menuItem.action onClose={() => setSelectedNavMenuItem(-1)} />;
  };

  const qualifiedPath = (path: string) => {
    if (path.startsWith('/')) return path;

    return `/${path}`;
  };

  return (
    <div>
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
        }}
        variant='temporary'
        anchor='left'
        open={navMenuOpen}
        onClose={(_, reason) => reason === 'backdropClick' && setNavMenuOpen(false)}
      >
        <Toolbar />
        <List>
          {navMenuItems?.map((navMenuItem, index) => (
            <ListItem key={index}>
              <ListItemButton onClick={() => handleNavMenuItemClick(index)}>
                {navMenuItem.icon && (
                  <ListItemIcon>
                    <navMenuItem.icon />
                  </ListItemIcon>
                )}
                <ListItemText primary={navMenuItem.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>
      <NavMenuItemAction />
    </div>
  );
};
