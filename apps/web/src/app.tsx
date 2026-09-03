import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router';
import { GateScreen } from './screens/gate/gate.tsx';
import { useSession } from './store/session.ts';

const AuthorApp = lazy(() => import('./apps/author.tsx'));
const PlayApp = lazy(() => import('./apps/play.tsx'));

export function App() {
  const { pathname } = useLocation();

  return (
    <div className="shell">
      {pathname === '/' ? null : <TopBar author={pathname.startsWith('/author')} />}
      <Suspense fallback={<div className="column column--main"><span className="faint">загрузка…</span></div>}>
        <Routes>
          <Route path="/" element={<GateScreen />} />
          <Route path="/author/*" element={<Guarded><AuthorApp /></Guarded>} />
          <Route path="/play/*" element={<Guarded><PlayApp /></Guarded>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function TopBar({ author }: { author: boolean }) {
  return (
    <header className="topbar">
      <NavLink className="topbar__brand" to="/" title="сменить роль">
        <em>VTT</em> {author ? 'автор' : 'партия'}
      </NavLink>
      <nav className="topbar__nav">
        {author ? (
          <>
            <NavLink className="topbar__link" to="/author/system">Система</NavLink>
            <NavLink className="topbar__link" to="/author/compendium">Компендиум</NavLink>
            <NavLink className="topbar__link" to="/author/start">Сменить систему</NavLink>
          </>
        ) : (
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
