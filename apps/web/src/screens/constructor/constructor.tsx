import { useWorld } from '../../store/world.ts';
import { SheetTab } from './sheet-tab.tsx';
import { EffectsTab } from './effects/effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import { RulesTab } from './rules/rules-tab.tsx';

export function ConstructorScreen() {
  const tab = useWorld(s => s.activeTab);

  return (
    <>
      {tab === 'sheet' ? <SheetTab /> : null}
      {tab === 'effects' ? <EffectsTab /> : null}
      {tab === 'records' ? <RecordsTab /> : null}
      {tab === 'dictionaries' ? <RulesTab /> : null}
    </>
  );
}
