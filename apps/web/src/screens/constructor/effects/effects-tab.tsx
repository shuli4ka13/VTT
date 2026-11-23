import { rolesOf, roleWordsOf, type Role } from './roles.ts';
import { useOpened } from '../../../store/opened.ts';
import { useWorld } from '../../../store/world.ts';
import { blockTree, BlockBranches } from '../block-tree.tsx';
import { blockOf, labelBlock } from '@vtt/engine';
import type { LaunchKind } from '@vtt/engine';
import { newEffect } from '../factory.ts';
import { createEffect } from './factory.ts';
import { Columns, List, ListItem } from '../../../ui/layout.tsx';
import { useFreshKeys } from '../../../store/fresh.ts';
import { useLookupPane } from '../lookup-panel.tsx';
import { Button, Empty } from '../../../ui/primitives.tsx';
import { PreviewPanel } from './preview-panel.tsx';
import { CREATE_KINDS } from './words.ts';
import { EffectEditor } from './effect-editor.tsx';
import type { Effect } from '@vtt/schema';
import { newGroup } from '../groups.ts';
import { focusNew } from '../../../ui/focus-new.ts';
import { useT, t as tt } from '../../../i18n/author.ts';

export function EffectsTab() {
  const t = useT('effects');
  const system = useWorld(s => s.system);
  const activeId = useWorld(s => s.activeEffectId);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const tree = blockTree<[string, Effect]>(system, Object.entries(system.effects), ([, effect]) => blockOf(system, effect));
  const active = activeId ? system.effects[activeId] : undefined;
  const compendium = useWorld(s => s.compendium);
  const roles = rolesOf(system, compendium);

  const addTo = (block: string, title?: string) => {
    focusNew(t('common:name.effect'));
    const made = newEffect(system, 'manual');
    editSystem(draft => {
      draft.effects[made.key] = { ...made.value, group: block };
      if (title) labelBlock(draft, block, title);
    });
    useOpened.getState().setOpen([`effect-props|${made.key}`], true);
    pick({ activeEffectId: made.key });
  };

  const add = (kind: LaunchKind) => { createEffect(kind); };

  const right = useLookupPane({ head: t('tab.near'), body: <PreviewPanel effectId={activeId} /> });
  const freshEffects = useFreshKeys('effect');
  const everyone = new Set(system.grants ?? []);

  return (
    <Columns
      left={{
        head: t('tab.library'),
        tools: <Button size="sm" onClick={() => { const fresh = newGroup(system); addTo(fresh.key, fresh.title); }}>{t('tab.addBlock')}</Button>,
        body: (
          <>
            {tree.length === 0
              ? <Empty
                  title={t('tab.noneTitle')}
                  hint={t('tab.noneHint')}
                  action={<Button size="sm" onClick={() => add('manual')}>{t('tab.addButton')}</Button>}
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
              <span className="field__label">{t('tab.createFromScratch')}</span>
              {CREATE_KINDS.map(kind => (
                <Button key={kind.key} size="sm" wide onClick={() => add(kind.key)} title={kind.title}>
                  + {kind.label.toLowerCase()}
                </Button>
              ))}
            </div>
          </>
        ),
      }}
      main={{
        body: active && activeId
          ? <EffectEditor key={activeId} id={activeId} effect={active} system={system} />
          : <Empty
              title={t('tab.pickTitle')}
              hint={t('tab.pickHint')}
            />,
      }}
      right={right}
    />
  );
}

const metaOf = (effect: Effect, role: Role, everyone: boolean) => {
  const kind = everyone ? tt('effects:tab.everyone', { kind: roleWordsOf(effect, role) }) : roleWordsOf(effect, role);
  const idle = !effect.steps?.length && !effect.cost?.length && !effect.modifiers?.length
    && !effect.attach?.length && !effect.detach?.length && !effect.grants?.length
    && !(effect.on ?? []).some(handler => handler.steps?.length || handler.cost?.length);
  return idle ? tt('effects:tab.idle', { kind: kind.toLowerCase() }) : kind.toLowerCase();
};
