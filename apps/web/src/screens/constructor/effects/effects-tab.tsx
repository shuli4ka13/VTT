import { useWorld } from '../../../store/world.ts';
import { blockTree, BlockBranches } from '../block-tree.tsx';
import { blockOf } from '@vtt/engine/model/blocks';
import { newEffect } from '../factory.ts';
import { Columns, List, ListItem } from '../../../ui/layout.tsx';
import { Button, Empty } from '../../../ui/primitives.tsx';
import { PreviewPanel } from './preview-panel.tsx';
import { LAUNCH_KINDS } from './words.ts';
import { EffectEditor } from './effect-editor.tsx';
import { RoomRules } from './room-rules.tsx';
import { newCalled } from '../factory.ts';
import { launchOf, activationFor, LAUNCHES } from '@vtt/engine/model/effect-kinds';
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
    const made = newEffect(system, activationFor({ kind: 'manual', moment: 'after', ask: false }));
    editSystem(draft => { draft.effects[made.key] = { ...made.value, group: block }; });
    pick({ activeEffectId: made.key });
  };

  const add = (kind: LaunchKind) => {
    const made = newEffect(system, activationFor({ kind, moment: 'after', ask: false }));
    editSystem(draft => { draft.effects[made.key] = made.value; });
    pick({ activeEffectId: made.key });
  };

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
                    nodes={tree}
                    addTo={addTo}
                    lineage={{
                      keyOf: ([id]) => id,
                      baseOf: ([, effect]) => effect.extends,
                    }}
                    render={([id, effect]) => (
                      <ListItem
                        key={id}
                        name={effect.label ?? id}
                        meta={metaOf(effect, called.has(id))}
                        active={id === activeId}
                        onClick={() => pick({ activeEffectId: id })}
                      />
                    )}
                  />
                </List>
              )}

            <div className="stack stack--tight">
              <span className="field__label">Создать с нуля</span>
              {LAUNCH_KINDS.map(kind => (
                <Button key={kind.key} size="sm" wide onClick={() => add(kind.key)} title={kind.title}>
                  + {kind.label.toLowerCase()}
                </Button>
              ))}
              <Button size="sm" wide onClick={addCalled} title="Его никто не нажимает: его зовут другие эффекты и передают число — урон, лечение, трата ячейки">
                + вызываемый
              </Button>
            </div>

            <RoomRules system={system} />
          </>
        ),
      }}
      main={{
        head: active ? 'Эффект' : undefined,
        body: active && activeId
          ? <EffectEditor id={activeId} effect={active} system={system} />
          : <Empty
              title="Выберите эффект слева"
              hint="Эффект — единица автоматизации: всё, что мир делает сам. Проверки, изменения полей, состояния — а как их назвать, решаете вы."
            />,
      }}
      right={{ head: 'Рядом', body: <PreviewPanel effectId={activeId} /> }}
    />
  );
}

const metaOf = (effect: Effect, called: boolean) => {
  const kind = called ? 'вызывают другие' : LAUNCHES[launchOf(effect).kind].label;
  const idle = !effect.steps?.length && !effect.self?.length && !effect.modifiers?.length;
  return idle ? `${kind.toLowerCase()} · ничего не делает` : kind.toLowerCase();
};
