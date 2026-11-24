import { Route, Routes, Navigate } from 'react-router';
import { RecordChainLayer } from '../screens/constructor/effects/sun/chain/chain-layer.tsx';
import { CompendiumScreen } from '../screens/compendium/compendium.tsx';
import { BookBar } from '../screens/compendium/book-bar.tsx';
import { BookStart } from '../screens/compendium/book-start.tsx';
import { RestoreNotice } from '../ui/restore-notice.tsx';

export default function BookApp() {
  return (
    <Routes>
      <Route index element={<Navigate to="start" replace />} />
      <Route path="start" element={<><RestoreNotice /><BookStart /></>} />
      <Route path="edit" element={<><BookBar /><RestoreNotice /><CompendiumScreen /><RecordChainLayer linked={false} /></>} />
      <Route path="*" element={<Navigate to="start" replace />} />
    </Routes>
  );
}
