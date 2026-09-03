import { Route, Routes, Navigate } from 'react-router';
import { ConstructorScreen } from '../screens/constructor/constructor.tsx';
import { SystemBar } from '../screens/constructor/world-bar.tsx';
import { SystemStart } from '../screens/author/start.tsx';

export default function AuthorApp() {
  return (
    <Routes>
      <Route index element={<Navigate to="start" replace />} />
      <Route path="start" element={<SystemStart />} />
      <Route path="system/*" element={<><SystemBar /><ConstructorScreen /></>} />
      <Route path="*" element={<Navigate to="start" replace />} />
    </Routes>
  );
}
