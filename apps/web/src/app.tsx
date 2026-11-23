import { Fragment, Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router';
import { GateScreen } from './screens/gate/gate.tsx';
import { useSession } from './store/session.ts';
import { useLocale } from './store/locale.ts';
import { useT } from './i18n/index.ts';

const AuthorApp = lazy(() => import('./apps/author.tsx'));
const BookApp = lazy(() => import('./apps/book.tsx'));
const PlayApp = lazy(() => import('./apps/play.tsx'));

export function App() {
  const { pathname } = useLocation();
  const lang = useLocale(state => state.lang);
  const t = useT('app');

  return (
    <div className="shell">
      <Fragment key={lang}>
        {pathname === '/' || pathname.startsWith('/author/system') ? null : (
          <TopBar where={whereOf(pathname)} bare={pathname.endsWith('/start')} />
        )}
        <Suspense fallback={<div className="column column--main"><span className="faint">{t('loading')}</span></div>}>
          <Routes>
            <Route path="/" element={<GateScreen />} />
            <Route path="/author/*" element={<Guarded><AuthorApp /></Guarded>} />
            <Route path="/book/*" element={<Guarded><BookApp /></Guarded>} />
            <Route path="/play/*" element={<Guarded><PlayApp /></Guarded>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Fragment>
    </div>
  );
}

type Where = 'system' | 'book' | 'play';

const whereOf = (pathname: string): Where =>
  pathname.startsWith('/author') ? 'system' : pathname.startsWith('/book') ? 'book' : 'play';

function TopBar({ where, bare }: { where: Where; bare?: boolean }) {
  const t = useT('app');
  const title = where === 'system' ? t('title.system') : where === 'book' ? t('title.book') : t('title.play');
  return (
    <header className="topbar">
      <NavLink className="topbar__brand" to="/" title={t('switchRole')}>
        <em>VTT</em> {title}
      </NavLink>
      <nav className="topbar__nav">
        {bare || where !== 'play' ? null : (
          <>
            <NavLink className="topbar__link" to="/play/sheet">{t('nav.sheet')}</NavLink>
            <NavLink className="topbar__link" to="/play/table">{t('nav.table')}</NavLink>
          </>
        )}
      </nav>
      <span className="spacer" />
    </header>
  );
}

function Guarded({ children }: { children: ReactNode }) {
  const signed = useSession(s => s.signed);
  return signed ? <>{children}</> : <Navigate to="/" replace />;
}
