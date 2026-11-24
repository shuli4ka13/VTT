import type { ReactElement } from 'react';
import { Segmented } from '../../../../ui/primitives.tsx';
import { useEffectView, type EffectView } from '../../../../store/effect-view.ts';
import { useT } from '../../../../i18n/author.ts';

export function ViewSwitch(): ReactElement {
  const t = useT('sun');
  const view = useEffectView(s => s.view);
  const setView = useEffectView(s => s.setView);
  return (
    <span className="sun-switch" aria-label={t('switch.label')}>
      <Segmented<EffectView>
        value={view}
        options={[
          { key: 'sun', label: t('switch.bubbles'), title: t('switch.bubblesTitle') },
          { key: 'form', label: t('switch.form'), title: t('switch.formTitle') },
          { key: 'map', label: t('switch.map'), title: t('switch.mapTitle') },
        ]}
        onChange={setView}
      />
    </span>
  );
}
