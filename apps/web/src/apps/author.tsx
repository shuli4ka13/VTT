import { Route, Routes, Navigate } from 'react-router';
import { ConstructorScreen } from '../screens/constructor/constructor.tsx';
import { SystemBar } from '../screens/constructor/world-bar.tsx';
import { SystemStart } from '../screens/author/start.tsx';
import { RestoreNotice } from '../ui/restore-notice.tsx';
import { GuideLayer } from '../guide/guide-card.tsx';

export default function AuthorApp() {
  return (
    <Routes>
      <Route index element={<Navigate to="start" replace />} />
      <Route path="start" element={<><RestoreNotice /><SystemStart /></>} />
      <Route path="system/*" element={<><SystemBar /><RestoreNotice /><ConstructorScreen /><GuideLayer /></>} />
      <Route path="*" element={<Navigate to="start" replace />} />
    </Routes>
  );
}
