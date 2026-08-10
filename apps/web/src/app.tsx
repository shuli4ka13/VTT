// Роутинг и граница режимов.
//
// Граница держится ИМПОРТАМИ, а не стилями: экран игрока не знает модулей,
// которые правят состав полей, и кнопок правки в его разметке нет — не
// спрятаны, а не созданы. То же правило, что в PoC, и оно так же закрыто
// тестом (src/app.border.test.ts).

import { NavLink, Route, Routes, Navigate } from 'react-router';
import { ConstructorScreen } from './screens/constructor/constructor.tsx';
import { CompendiumScreen } from './screens/compendium/compendium.tsx';
import { PlayerScreen } from './screens/player/player.tsx';
import { TableScreen } from './screens/table/table.tsx';

export function App() {
  return (
    <div className="shell">
      <TopBar />
      <Routes>
        <Route path="/" element={<Navigate to="/constructor" replace />} />
        <Route path="/constructor/*" element={<ConstructorScreen />} />
        <Route path="/compendium" element={<CompendiumScreen />} />
        <Route path="/player" element={<PlayerScreen />} />
        <Route path="/table" element={<TableScreen />} />
      </Routes>
    </div>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <span className="topbar__brand"><em>VTT</em> конструктор</span>
      <nav className="topbar__nav">
        <NavLink className="topbar__link" to="/constructor">Конструктор</NavLink>
        <NavLink className="topbar__link" to="/compendium">Компендиум</NavLink>
        <NavLink className="topbar__link" to="/player">Персонаж</NavLink>
        <NavLink className="topbar__link" to="/table">Стол</NavLink>
      </nav>
      <span className="spacer" />
    </header>
  );
}
