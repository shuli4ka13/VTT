import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router';
import { GateScreen } from './screens/gate/gate.tsx';
import { useSession } from './store/session.ts';

const AuthorApp = lazy(() => import('./apps/author.tsx'));
const BookApp = lazy(() => import('./apps/book.tsx'));
const PlayApp = lazy(() => import('./apps/play.tsx'));

export function App() {
  const { pathname } = useLocation();

  return (
    <div className="shell">
      {pathname === '/' || pathname.startsWith('/author/system') ? null : (
        <TopBar where={whereOf(pathname)} bare={pathname.endsWith('/start')} />
      )}
      <Suspense fallback={<div className="column column--main"><span className="faint">загрузка…</span></div>}>
        <Routes>
          <Route path="/" element={<GateScreen />} />
          <Route path="/author/*" element={<Guarded><AuthorApp /></Guarded>} />
          <Route path="/book/*" element={<Guarded><BookApp /></Guarded>} />
          <Route path="/play/*" element={<Guarded><PlayApp /></Guarded>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

type Where = 'system' | 'book' | 'play';

const whereOf = (pathname: string): Where =>
  pathname.startsWith('/author') ? 'system' : pathname.startsWith('/book') ? 'book' : 'play';

const TITLE: Record<Where, string> = {
  system: 'система',
  book: 'компендиум',
  play: 'партия',
};

function TopBar({ where, bare }: { where: Where; bare?: boolean }) {
  return (
    <header className="topbar">
      <NavLink className="topbar__brand" to="/" title="сменить роль">
        <em>VTT</em> {TITLE[where]}
      </NavLink>
      <nav className="topbar__nav">
        {bare || where !== 'play' ? null : (
          <>
            <NavLink className="topbar__link" to="/play/sheet">Персонаж</NavLink>
            <NavLink className="topbar__link" to="/play/table">Стол</NavLink>
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
