import { useWorld, effectsByCategory } from '../../../store/world.ts';
import { newEffect } from '../factory.ts';
import { Columns, List, ListItem, ListGroup } from '../../../ui/layout.tsx';
import { Button, Empty } from '../../../ui/primitives.tsx';
import { groupSteps } from '../cards.ts';
import { PreviewPanel } from './preview-panel.tsx';
import { LAUNCH_KINDS } from './words.ts';
import { STEP } from '../../../words.ts';
import { EffectEditor } from './effect-editor.tsx';
import { RoomRules } from './room-rules.tsx';
import { CommonEffectEditor, COMMON_PREFIX, commonKeyOf } from './common-effect.tsx';
import { newEvent } from '../factory.ts';
import { launchOf, activationFor, LAUNCHES } from '@vtt/engine/model/effect-kinds';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import type { Effect } from '@vtt/schema';

export function EffectsTab() {
  const system = useWorld(s => s.system);
  const activeId = useWorld(s => s.activeEffectId);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const groups = effectsByCategory(system);
  const commonKey = commonKeyOf(activeId);
  const common = commonKey ? system.events?.[commonKey] : undefined;
  const active = activeId && !commonKey ? system.effects[activeId] : undefined;
  const commons = Object.entries(system.events ?? {});

  const addCommon = () => {
    const made = newEvent(system);
    editSystem(draft => { (draft.events ??= {})[made.key] = made.value; });
    pick({ activeEffectId: `${COMMON_PREFIX}${made.key}` });
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
        body: (
          <>
            {groups.length === 0
              ? <Empty title="Эффектов ещё нет" hint="Заведите первый кнопкой ниже или возьмите готовый из образца справа." />
              : (
                <List>
                  {groups.map(([category, effects]) => (
                    <div key={category}>
                      <ListGroup>{category}</ListGroup>
                      {effects.map(([id, effect]) => (
                        <ListItem
                          key={id}
                          name={effect.label ?? id}
                          meta={metaOf(effect)}
                          active={id === activeId}
                          onClick={() => pick({ activeEffectId: id })}
                        />
                      ))}
                    </div>
                  ))}
                </List>
              )}

            <List>
              <ListGroup>Общие · их вызывают другие эффекты</ListGroup>
              {commons.map(([key, event]) => (
                <ListItem
                  key={key}
                  name={event.label || key}
                  meta={`${STEP.manyGen}: ${event.receive?.length ?? 0}`}
                  active={key === commonKey}
                  onClick={() => pick({ activeEffectId: `${COMMON_PREFIX}${key}` })}
                />
              ))}
            </List>

            <div className="stack stack--tight">
              <span className="field__label">Создать с нуля</span>
              {LAUNCH_KINDS.map(kind => (
                <Button key={kind.key} size="sm" wide onClick={() => add(kind.key)} title={kind.title}>
                  + {kind.label.toLowerCase()}
                </Button>
              ))}
              <Button size="sm" wide onClick={addCommon} title="Общий эффект: его вызывают другие, а он делает своё — урон, лечение">
                + общий
              </Button>
            </div>

            <RoomRules system={system} />
          </>
        ),
      }}
      main={{
        head: active ? 'Эффект' : undefined,
        body: common && commonKey
          ? <CommonEffectEditor id={commonKey} event={common} system={system} />
          : active && activeId
            ? <EffectEditor id={activeId} effect={active} system={system} />
          : <Empty
              title="Выберите эффект слева"
              hint="Эффект — единица автоматизации: всё, что мир делает сам. Проверки, изменения полей, состояния — а как их назвать, решаете вы."
            />,
      }}
      right={{ head: 'Рядом', body: <PreviewPanel effectId={commonKey ? null : activeId} /> }}
    />
  );
}

const metaOf = (effect: Effect) => {
  const kind = LAUNCHES[launchOf(effect).kind].label;
  const payload = launchOf(effect).kind === 'passive'
    ? `модификаторов: ${effect.modifiers?.length ?? 0}`
    : `${STEP.manyGen}: ${groupSteps(effect.steps ?? []).length}`;
  return `${kind.toLowerCase()} · ${payload}`;
};
