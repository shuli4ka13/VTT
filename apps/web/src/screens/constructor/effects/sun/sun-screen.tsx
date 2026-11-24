import { useEffect, useMemo, useState } from 'react';
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
import { Button } from '../../../../ui/primitives.tsx';
import { useT } from '../../../../i18n/author.ts';
import { Palette } from './edit/palette.tsx';
import { SunPanel } from './edit/panel.tsx';
import { useSunEdit } from './edit/use-sun-edit.ts';
import type { Mode } from './edit/ops.ts';
import './sun.css';

export function SunScreen({ id }: { id: string }): ReactElement | null {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const pick = useWorld(s => s.pick);
  const push = useEffectView(s => s.push);
  const back = useEffectView(s => s.back);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<Mode>('inside');
  const [shut, setShut] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  const [notice, setNotice] = useState<unknown>(null);
  const e = useT('sunEdit');
  const editing = useSunEdit(id);

  const lang = useLocale(state => state.lang);
  const sun = useMemo(() => sunOf(system, id, compendium), [system, id, compendium, lang]);
  const layout = useMemo(() => (sun ? layoutOf(sun) : null), [sun]);
  const found = layout ? layout.placed.some(one => one.id === selectedId) : false;
  useEffect(() => {
    if (selectedId && !found) setSelectedId(null);
  }, [selectedId, found]);
  if (!sun || !layout) return null;

  const selected = layout.placed.find(one => one.id === selectedId) ?? null;
  const effect = system.effects[id];
  const ray = selected && selected.what !== 'center' ? selected.ray ?? null : null;

  const onPick = (placed: Placed) => {
    setSelectedId(placed.id);
    setOpened(placed.what === 'group');
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

  const after = (move: () => boolean) => () => {
    if (move()) { setSelectedId(null); setOpened(false); setNotice(null); }
  };

  const around = (
    <Inspector system={system} sun={sun} selected={selected} onOpenEffect={onOpenEffect} onOpenForm={onOpenForm} />
  );

  return (
    <div className="sun">
      <SunHead
        system={system} sun={sun} effectId={id} onBack={onBack}
        undo={{ canUndo: editing.canUndo, canRedo: editing.canRedo, onUndo: after(editing.undo), onRedo: after(editing.redo) }}
      />
      <div className={`sun__body${shut ? ' sun__body--shut' : ''}`}>
        {effect ? (
          <Palette
            system={system} sun={sun} effectId={id} effect={effect} ray={ray} mode={mode}
            edit={editing.edit} onSelect={setSelectedId} collapsed={shut} onToggle={() => setShut(!shut)}
          />
        ) : null}
        <div className="sun__stage">
          {notice && effect === notice ? (
            <div className="sun-notice" role="status">
              <span>{e('head.removed')}</span>
              <Button size="sm" onClick={after(editing.undo)}>{e('head.restore')}</Button>
            </div>
          ) : null}
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
        {effect ? (
          <SunPanel
            system={system} sun={sun} effectId={id} effect={effect} ray={ray}
            around={around} aroundOpen={!ray || selected?.what === 'group'}
            edit={editing.edit} mode={mode} onMode={setMode} onSelect={setSelectedId}
            onRemoved={() => setNotice(useWorld.getState().system.effects[id] ?? null)}
            onAbout={() => setOpened(true)}
          />
        ) : null}
      </div>
      <SunDock system={system} effectId={id} sun={sun} onOpenEffect={onOpenEffect} onOpenForm={onOpenForm} />
    </div>
  );
}
