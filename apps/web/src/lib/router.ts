import { useEffect, useState } from 'react';

export function currentRoute(): string[] {
  const h = location.hash.replace(/^#\/?/, '');
  return h ? h.split('/').map(decodeURIComponent) : [];
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const on = () => setRoute(currentRoute());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(path: string, replace = false): void {
  const target = '#/' + path.replace(/^\//, '');
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) dispatchEvent(new HashChangeEvent('hashchange'));
}

export const href = (path: string) => '#/' + path.replace(/^\//, '');
