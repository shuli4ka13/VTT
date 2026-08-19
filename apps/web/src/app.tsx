import { Suspense, lazy } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router';

const AuthorApp = lazy(() => import('./apps/author.tsx'));
const PlayApp = lazy(() => import('./apps/play.tsx'));

export function App() {
  const { pathname } = useLocation();

  return (
    <div className="shell">
      {pathname === '/' ? null : <TopBar author={pathname.startsWith('/author')} />}
      <Suspense fallback={<div className="column column--main"><span className="faint">загрузка…</span></div>}>
        <Routes>
          <Route path="/" element={<RolePicker />} />
          <Route path="/author/*" element={<AuthorApp />} />
          <Route path="/play/*" element={<PlayApp />} />
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

function RolePicker() {
  return (
    <div className="roles">
      <h1 className="roles__title"><em>VTT</em> — конструктор систем и стол</h1>
      <p className="roles__lead">
        Автор публикует мир — партия открывает его за столом.
      </p>

      <div className="roles__grid">
        <NavLink className="role" to="/author/system">
          <span className="role__name">Я автор</span>
          <span className="role__hint">Собрать систему и компендиум, опубликовать мир.</span>
        </NavLink>

        <NavLink className="role" to="/play/table">
          <span className="role__name">Мы играем</span>
          <span className="role__hint">Открыть опубликованный мир, вести персонажа, ходить за столом.</span>
        </NavLink>
      </div>
    </div>
  );
}
