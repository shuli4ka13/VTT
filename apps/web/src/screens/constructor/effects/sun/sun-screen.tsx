import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { sunOf } from '@vtt/engine';
import { useWorld } from '../../../../store/world.ts';
import { useEffectView } from '../../../../store/effect-view.ts';
import { useLocale } from '../../../../store/locale.ts';
import { Canvas } from './canvas.tsx';
import { SunHead } from './head.tsx';
import { Inspector } from './inspector.tsx';
import { layoutOf, type Placed } from './layout.ts';
import { BubbleWindow } from './windows/index.tsx';
import { SunDock } from './dock/index.tsx';
import './sun.css';

export function SunScreen({ id }: { id: string }): ReactElement | null {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const pick = useWorld(s => s.pick);
  const push = useEffectView(s => s.push);
  const back = useEffectView(s => s.back);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  const lang = useLocale(state => state.lang);
  const sun = useMemo(() => sunOf(system, id, compendium), [system, id, compendium, lang]);
  const layout = useMemo(() => (sun ? layoutOf(sun) : null), [sun]);
  if (!sun || !layout) return null;

  const selected = layout.placed.find(one => one.id === selectedId) ?? null;

  const onPick = (placed: Placed) => {
    setSelectedId(placed.id);
    setOpened(placed.what !== 'center');
  };
  const onOpenEffect = (next: string) => {
    push(id);
    pick({ activeEffectId: next });
  };
  const onOpenForm = (step: number | null) => {
    useEffectView.getState().setView('form');
    pick({ activeStepIndex: step ?? undefined });
  };
  const onBack = () => {
    const previous = back();
    if (previous) pick({ activeEffectId: previous });
  };

  return (
    <div className="sun">
      <SunHead system={system} sun={sun} effectId={id} onBack={onBack} />
      <div className="sun__body">
        <div className="sun__stage">
          <Canvas
            sun={sun}
            layout={layout}
            selectedId={selectedId}
            description={system.effects[id]?.description}
            onPick={onPick}
            onEscape={() => setOpened(false)}
          />
          {opened && selected && selected.what !== 'center' ? (
            <BubbleWindow
              system={system}
              effectId={id}
              sun={sun}
              placed={selected}
              onClose={() => setOpened(false)}
              onOpenEffect={onOpenEffect}
              onOpenForm={onOpenForm}
            />
          ) : null}
        </div>
        <Inspector system={system} sun={sun} selected={selected} onOpenEffect={onOpenEffect} onOpenForm={onOpenForm} />
      </div>
      <SunDock system={system} effectId={id} sun={sun} onOpenEffect={onOpenEffect} onOpenForm={onOpenForm} />
    </div>
  );
}
