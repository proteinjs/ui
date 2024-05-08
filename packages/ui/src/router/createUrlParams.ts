import { useLocation } from 'react-router';

export function createUrlParams() {
  const urlParams: { [paramName: string]: string } = {};
  const location = useLocation();
  const serializedParams = location.search.substring(1).split('&');
  for (const serializedParam of serializedParams) {
    if (serializedParam === '') continue;

    const kvp = serializedParam.split('=');
    urlParams[decodeURIComponent(kvp[0])] = decodeURIComponent(kvp[1]);
  }

  return urlParams;
}
