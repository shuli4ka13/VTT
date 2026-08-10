// Приложение ПАРТИИ: лист персонажа и стол.
//
// Правит значения и принадлежности, состав правил не трогает. Ни один модуль
// конструктора сюда не импортируется — граница держится сборкой, а не
// договорённостью: в чанке партии кода конструктора физически нет.
//
// Оба экрана смотрят в ОДНО состояние комнаты: играют в один мир.

import { useEffect } from 'react';
import { Route, Routes, Navigate } from 'react-router';
import { SheetScreen } from '../screens/play/sheet.tsx';
import { TableScreen } from '../screens/play/table.tsx';
import { listenToRoom } from '../store/room.ts';

export default function PlayApp() {
  // Подписка одна на приложение: иначе два экрана обработали бы одну дельту
  // дважды, и журнал двоился бы.
  useEffect(() => { listenToRoom(); }, []);

  return (
    <Routes>
      <Route index element={<Navigate to="table" replace />} />
      <Route path="sheet" element={<SheetScreen />} />
      <Route path="table" element={<TableScreen />} />
      <Route path="*" element={<Navigate to="table" replace />} />
    </Routes>
  );
}
