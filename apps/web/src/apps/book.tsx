import { Route, Routes, Navigate } from 'react-router';
import { CompendiumScreen } from '../screens/compendium/compendium.tsx';
import { BookBar } from '../screens/compendium/book-bar.tsx';
import { BookStart } from '../screens/compendium/book-start.tsx';

export default function BookApp() {
  return (
    <Routes>
      <Route index element={<Navigate to="start" replace />} />
      <Route path="start" element={<BookStart />} />
      <Route path="edit" element={<><BookBar /><CompendiumScreen /></>} />
      <Route path="*" element={<Navigate to="start" replace />} />
    </Routes>
  );
}
