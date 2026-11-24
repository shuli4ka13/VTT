import { useWorld } from '../../store/world.ts';
import { SheetTab } from './sheet-tab.tsx';
import { EffectsTab } from './effects/effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import { RulesTab } from './rules/rules-tab.tsx';
import { useLocale } from '../../store/locale.ts';
import { Fragment } from 'react';
import { RecordChainLayer } from './effects/sun/chain/chain-layer.tsx';

export function ConstructorScreen() {
  const tab = useWorld(s => s.activeTab);
  const lang = useLocale(s => s.lang);

  return (
    <Fragment key={lang}>
      {tab === 'sheet' ? <SheetTab /> : null}
      {tab === 'effects' ? <EffectsTab /> : null}
      {tab === 'records' ? <RecordsTab /> : null}
      {tab === 'dictionaries' ? <RulesTab /> : null}
      <RecordChainLayer />
    </Fragment>
  );
}
