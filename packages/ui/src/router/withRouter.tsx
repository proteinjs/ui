import React from 'react';
import { NavigateFunction, useNavigate } from 'react-router-dom';

export type WithRouterProps = {
  navigate: NavigateFunction
}

export const withRouter = (Component: typeof React.Component) => {
  const Wrapper = (props: any) => {
    const navigate = useNavigate();
    
    return (
      <Component
        navigate={navigate}
        {...props}
      />
    );
  };
  
  return Wrapper;
};
