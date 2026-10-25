import { useEffect } from 'react';
import { Route, Routes, Navigate } from 'react-router';
import { SheetScreen } from '../screens/play/sheet.tsx';
import { TableScreen } from '../screens/play/table.tsx';
import { listenToRoom } from '../store/room.ts';
import { PendingBar } from '../screens/play/pending-bar.tsx';

export default function PlayApp() {

  useEffect(() => { listenToRoom(); }, []);

  return (
    <>
      <PendingBar />
      <Routes>
        <Route index element={<Navigate to="table" replace />} />
        <Route path="sheet" element={<SheetScreen />} />
        <Route path="table" element={<TableScreen />} />
        <Route path="*" element={<Navigate to="table" replace />} />
      </Routes>
    </>
  );
}
