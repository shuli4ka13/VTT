import { Route, Routes, Navigate } from 'react-router';
import { ConstructorScreen } from '../screens/constructor/constructor.tsx';
import { CompendiumScreen } from '../screens/compendium/compendium.tsx';
import { WorldBar } from '../screens/constructor/world-bar.tsx';

export default function AuthorApp() {
  return (
    <><WorldBar /><Routes>
      <Route index element={<Navigate to="system" replace />} />
      <Route path="system/*" element={<ConstructorScreen />} />
      <Route path="compendium" element={<CompendiumScreen />} />
      <Route path="*" element={<Navigate to="system" replace />} />
    </Routes></>
  );
}
