import React from 'react';
import { Page } from '../router/Page';
import { LinkOrDialog } from './NavMenu';
import { useNavigate } from 'react-router-dom';

export type AccountAuth = {
  isLoggedIn: boolean;
  canViewPage: (page: Page) => boolean;
  /** Either a dialog component, or a path to be redirected to */
  login: LinkOrDialog;
  logout: () => Promise<string>;
};

interface LoginProps {
  auth: AccountAuth;
  loginClicked: boolean;
  setLoginClicked: React.Dispatch<React.SetStateAction<boolean>>;
}

export function LoginComponent({ auth, loginClicked, setLoginClicked }: LoginProps) {
  if (!loginClicked || !auth || typeof auth.login === 'string') {
    return null;
  }

  const LoginComponent = auth.login as React.ComponentType<{ onClose: () => void }>;

  return <LoginComponent onClose={() => setLoginClicked(false)} />;
}

export function useAuthActions(
  auth: AccountAuth | undefined,
  loginClicked: boolean,
  setLoginClicked: React.Dispatch<React.SetStateAction<boolean>>
) {
  const navigate = useNavigate();

  const logout = async () => {
    if (!auth) {
      return;
    }
    const redirectPath = await auth.logout();
    navigate(qualifiedPath(redirectPath));
  };

  const login = () => {
    if (auth && typeof auth.login === 'string') {
      navigate(qualifiedPath(auth.login));
    } else {
      setLoginClicked(!loginClicked);
    }
  };

  return { login, logout };
}

export function qualifiedPath(path: string) {
  if (path.startsWith('/')) {
    return path;
  }

  return `/${path}`;
}
