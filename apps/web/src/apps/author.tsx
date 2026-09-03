import { Route, Routes, Navigate } from 'react-router';
import { ConstructorScreen } from '../screens/constructor/constructor.tsx';
import { CompendiumScreen } from '../screens/compendium/compendium.tsx';
import { WorldBar } from '../screens/constructor/world-bar.tsx';
import { SystemStart, CompendiumStart } from '../screens/author/start.tsx';

export default function AuthorApp() {
  return (
    <Routes>
      <Route index element={<Navigate to="start" replace />} />
      <Route path="start" element={<SystemStart />} />
      <Route path="compendium/start" element={<CompendiumStart />} />
      <Route path="system/*" element={<><WorldBar /><ConstructorScreen /></>} />
      <Route path="compendium" element={<><WorldBar /><CompendiumScreen /></>} />
      <Route path="*" element={<Navigate to="start" replace />} />
    </Routes>
  );
}
