import { useOpened } from '../../../store/opened.ts';
import { useWorld } from '../../../store/world.ts';
import { newEffect } from '../factory.ts';
import type { LaunchKind } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { focusNew } from '../../../ui/focus-new.ts';
import { t } from '../../../i18n/author.ts';

export function createEffect(kind: LaunchKind, alsoIn?: (draft: System, key: string) => void): string {
  focusNew(t('common:name.effect'));
  const { system, editSystem, pick } = useWorld.getState();
  const made = newEffect(system, kind);
  editSystem(draft => {
    draft.effects[made.key] = made.value;
    alsoIn?.(draft, made.key);
  });
  useOpened.getState().setOpen([`effect-props|${made.key}`], true);
  pick({ activeTab: 'effects', activeEffectId: made.key, activeStepIndex: null });
  return made.key;
}
