import { useWorld } from '../../../store/world.ts';
import { blockTree, BlockBranches } from '../block-tree.tsx';
import { blockOf } from '@vtt/engine/model/blocks';
import { newEffect } from '../factory.ts';
import { Columns, List, ListItem } from '../../../ui/layout.tsx';
import { useFreshKeys } from '../../../store/fresh.ts';
import { useLookupPane } from '../lookup-panel.tsx';
import { Button, Empty } from '../../../ui/primitives.tsx';
import { PreviewPanel } from './preview-panel.tsx';
import { CREATE_KINDS } from './words.ts';
import { EffectEditor } from './effect-editor.tsx';
import { newCalled } from '../factory.ts';
import { launchOf, LAUNCHES } from '@vtt/engine/model/effect-kinds';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import { calledOf } from '@vtt/engine/engine/effects';
import type { Effect } from '@vtt/schema';
import { freeGroupName } from '../groups.ts';

export function EffectsTab() {
  const system = useWorld(s => s.system);
  const activeId = useWorld(s => s.activeEffectId);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const tree = blockTree<[string, Effect]>(system, Object.entries(system.effects), ([, effect]) => blockOf(system, effect));
  const active = activeId ? system.effects[activeId] : undefined;
  const called = new Set(calledOf(system).map(([key]) => key));

  const addCalled = () => {
    const made = newCalled(system);
    editSystem(draft => { draft.effects[made.key] = made.value; });
    pick({ activeEffectId: made.key });
  };

  const addTo = (block: string) => {
    const made = newEffect(system, 'manual');
    editSystem(draft => { draft.effects[made.key] = { ...made.value, group: block }; });
    pick({ activeEffectId: made.key });
  };

  const add = (kind: LaunchKind) => {
    const made = newEffect(system, kind);
    editSystem(draft => { draft.effects[made.key] = made.value; });
    pick({ activeEffectId: made.key });
  };

  const right = useLookupPane({ head: 'Рядом', body: <PreviewPanel effectId={activeId} /> });
  const freshEffects = useFreshKeys('effect');
  const everyone = new Set(system.grants ?? []);

  return (
    <Columns
      left={{
        head: 'Библиотека эффектов',
        tools: <Button size="sm" onClick={() => addTo(freeGroupName(system, 'Новый блок'))}>+ блок</Button>,
        body: (
          <>
            {tree.length === 0
              ? <Empty
                  title="Эффектов ещё нет"
                  hint="Заведите первый или возьмите готовый из образца справа."
                  action={<Button size="sm" onClick={() => add('manual')}>+ кнопкой</Button>}
                />
              : (
                <List>
                  <BlockBranches
                    list="effects"
                    nodes={tree}
                    isActive={([id]) => id === activeId}
                    isFresh={([id]) => freshEffects.has(id)}
                    addTo={addTo}
                    lineage={{
                      keyOf: ([id]) => id,
                      baseOf: ([, effect]) => effect.extends,
                    }}
                    render={([id, effect]) => (
                      <ListItem
                        key={id}
                        name={effect.label ?? id}
                        meta={metaOf(effect, called.has(id), everyone.has(id))}
                        active={id === activeId}
                        fresh={freshEffects.has(id)}
                        onClick={() => pick({ activeEffectId: id })}
                      />
                    )}
                  />
                </List>
              )}

            <div className="stack stack--tight">
              <span className="field__label">Создать с нуля</span>
              {CREATE_KINDS.map(kind => (
                <Button key={kind.key} size="sm" wide onClick={() => add(kind.key)} title={kind.title}>
                  + {kind.label.toLowerCase()}
                </Button>
              ))}
              <Button size="sm" wide onClick={addCalled} title="Его никто не нажимает: его зовут другие эффекты и передают число — урон, лечение, трата ячейки">
                + вызываемый
              </Button>
            </div>
          </>
        ),
      }}
      main={{
        body: active && activeId
          ? <EffectEditor key={activeId} id={activeId} effect={active} system={system} />
          : <Empty
              title="Выберите эффект слева"
              hint="Эффект — единица автоматизации: всё, что мир делает сам. Проверки, изменения полей, состояния — а как их назвать, решаете вы."
            />,
      }}
      right={right}
    />
  );
}

const metaOf = (effect: Effect, called: boolean, everyone: boolean) => {
  const kind = `${called ? 'вызывают другие' : LAUNCHES[launchOf(effect).kind].label}${everyone ? ' · у всех' : ''}`;
  const idle = !effect.steps?.length && !effect.cost?.length && !effect.modifiers?.length
    && !(effect.on ?? []).some(handler => handler.steps?.length || handler.cost?.length);
  return idle ? `${kind.toLowerCase()} · ничего не делает` : kind.toLowerCase();
};
