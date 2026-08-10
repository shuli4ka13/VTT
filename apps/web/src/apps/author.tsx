// Приложение АВТОРА: конструктор системы и компендиум.
//
// Здесь вводятся новые теги — и потому это режим автора целиком. Экранов
// партии тут нет и быть не может: они лежат в соседнем чанке, который сюда
// не импортируется.

import { Route, Routes, Navigate } from 'react-router';
import { ConstructorScreen } from '../screens/constructor/constructor.tsx';
import { CompendiumScreen } from '../screens/compendium/compendium.tsx';

export default function AuthorApp() {
  return (
    <Routes>
      <Route index element={<Navigate to="system" replace />} />
      <Route path="system/*" element={<ConstructorScreen />} />
      <Route path="compendium" element={<CompendiumScreen />} />
      <Route path="*" element={<Navigate to="system" replace />} />
    </Routes>
  );
}
