import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { localizedPath } from './next-router';

type CompatWindow = { RL: { data: { locale: string } } };
const rlData = () => (window as unknown as CompatWindow).RL.data;

/** next/link sem o runtime do Next: <a> comum, com o prefixo do idioma. */
export default function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  const qi = href.indexOf('?');
  const path = qi < 0 ? href : href.slice(0, qi);
  const full = path.charAt(0) === '/' ? localizedPath(path, rlData().locale) + (qi < 0 ? '' : href.slice(qi)) : href;
  return (
    <a href={full} {...rest}>
      {children}
    </a>
  );
}
