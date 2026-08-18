// Конструктор систем: четыре вкладки, разведённые по тому, ЧТО они правят,
// и стоящие в порядке сборки мира.
//
//   Лист     — какие поля бывают у персонажа и как считаются
//   Словари  — чем бросают, что бывает с броском, какие бывают броски:
//              общий словарь системы, на который опираются соседи справа
//   Эффекты  — что мир делает сам
//   Записи   — какие бывают рода записей компендиума, то есть формы заполнения
//
// Всё это — режим АВТОРА: здесь вводятся новые теги. Экран, который только
// комбинирует существующие, автору не принадлежит и живёт отдельно.

import { useState } from 'react';
import { Tabs } from '../../ui/layout.tsx';
import { SheetTab } from './sheet-tab.tsx';
import { EffectsTab } from './effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import { DictionariesTab } from './dictionaries.tsx';

type Tab = 'sheet' | 'effects' | 'records' | 'dictionaries';

// Порядок вкладок = порядок сборки мира, а не список разделов.
// Сперва из чего мир состоит («Лист», «Словари»), потом что он делает сам
// («Эффекты»), потом чем это раздаётся («Записи»). Обратный порядок и был
// причиной вопроса «а откуда в эффекте взялась эта кость»: словарь стоял
// последним, хотя эффекты на него опираются — новая проверка берёт кость
// из словаря сама (cards.ts, blankCheck).
const TABS = [
  { key: 'sheet' as const, label: 'Лист' },
  { key: 'dictionaries' as const, label: 'Словари' },
  { key: 'effects' as const, label: 'Эффекты' },
  { key: 'records' as const, label: 'Записи' },
];

export function ConstructorScreen() {
  const [tab, setTab] = useState<Tab>('sheet');

  return (
    <>
      <Tabs value={tab} options={TABS} onChange={setTab} />
      {tab === 'sheet' ? <SheetTab /> : null}
      {tab === 'effects' ? <EffectsTab /> : null}
      {tab === 'records' ? <RecordsTab /> : null}
      {tab === 'dictionaries' ? <DictionariesTab /> : null}
    </>
  );
}
