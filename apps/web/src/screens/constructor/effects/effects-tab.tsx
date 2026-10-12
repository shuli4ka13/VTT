import { rolesOf, ROLE_WORDS, type Role } from './roles.ts';
import { useOpened } from '../../../store/opened.ts';
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
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import type { Effect } from '@vtt/schema';
import { freeGroupName } from '../groups.ts';

export function EffectsTab() {
  const system = useWorld(s => s.system);
  const activeId = useWorld(s => s.activeEffectId);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const tree = blockTree<[string, Effect]>(system, Object.entries(system.effects), ([, effect]) => blockOf(system, effect));
  const active = activeId ? system.effects[activeId] : undefined;
  const compendium = useWorld(s => s.compendium);
  const roles = rolesOf(system, compendium);

  const addCalled = () => {
    const made = newCalled(system);
    editSystem(draft => { draft.effects[made.key] = made.value; });
    useOpened.getState().setOpen([`effect-props|${made.key}`], true);
    pick({ activeEffectId: made.key });
  };

  const addTo = (block: string) => {
    const made = newEffect(system, 'manual');
    editSystem(draft => { draft.effects[made.key] = { ...made.value, group: block }; });
    useOpened.getState().setOpen([`effect-props|${made.key}`], true);
    pick({ activeEffectId: made.key });
  };

  const add = (kind: LaunchKind) => {
    const made = newEffect(system, kind);
    editSystem(draft => { draft.effects[made.key] = made.value; });
    useOpened.getState().setOpen([`effect-props|${made.key}`], true);
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
                    render={([id, effect]) => (
                      <ListItem
                        key={id}
                        name={effect.label ?? id}
                        meta={metaOf(effect, roles.get(id) ?? 'step', everyone.has(id))}
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
              <Button size="sm" wide onClick={addCalled} title="Его никто не нажимает: его зовут другие эффекты и передают ему входы">
                + шаг для других
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

const metaOf = (effect: Effect, role: Role, everyone: boolean) => {
  const kind = `${ROLE_WORDS[role]}${everyone ? ' · у всех' : ''}`;
  const idle = !effect.steps?.length && !effect.cost?.length && !effect.modifiers?.length
    && !(effect.on ?? []).some(handler => handler.steps?.length || handler.cost?.length);
  return idle ? `${kind.toLowerCase()} · ничего не делает` : kind.toLowerCase();
};
