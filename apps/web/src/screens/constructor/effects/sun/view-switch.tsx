import type { ReactElement } from 'react';
import { Segmented } from '../../../../ui/primitives.tsx';
import { useEffectView, BUBBLES_SETTLED, type EffectView } from '../../../../store/effect-view.ts';
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
          { key: 'form', label: t('switch.form'), title: t('switch.formTitle') },
          { key: 'sun', label: t('switch.bubbles'), title: BUBBLES_SETTLED ? t('switch.bubblesTitle') : t('switch.bubblesRough'), dim: !BUBBLES_SETTLED },
          { key: 'map', label: t('switch.map'), title: BUBBLES_SETTLED ? t('switch.mapTitle') : t('switch.mapRough'), dim: !BUBBLES_SETTLED },
        ]}
        onChange={setView}
      />
    </span>
  );
}
