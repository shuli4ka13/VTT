import type { System, SlotRef, ItemGrant } from '@vtt/schema';
import { Button } from '../../ui/primitives.tsx';
import { MultiChoice } from '../../ui/multi-choice.tsx';
import { calledOf, isPipeline, grantIds, grantOf, paramsOf, recordKindOf } from '@vtt/engine';
import { useT } from '../../i18n/author.ts';
import { ArgsTable } from './button-editor.tsx';

type Shared = {
  system: System;
  except?: string;
  hanging?: boolean;
  onCreate?: () => void;
  kindId?: string;
};

type Props = Shared & (
  | { withArgs: true; value: ItemGrant[] | undefined; onChange: (next: ItemGrant[] | undefined) => void }
  | { withArgs?: false; value: string[] | undefined; onChange: (next: string[] | undefined) => void }
);

export function GrantsEditor(props: Props) {
  const { system, except, hanging = false, onCreate, withArgs = false, kindId } = props;
  const value = props.value as ItemGrant[] | undefined;
  const onChange = props.onChange as (next: ItemGrant[] | undefined) => void;
  const t = useT('records');
  const called = new Set(calledOf(system).map(([key]) => key));
  const options = Object.entries(system.effects)
    .filter(([key, effect]) => key !== except && !called.has(key) && !(hanging && isPipeline(effect)))
    .map(([key, effect]) => ({ value: key, label: effect.label || key, group: isPipeline(effect) ? t('grants.buttons') : t('grants.rules') }));
  const create = onCreate ? <Button size="sm" variant="ghost" onClick={onCreate}>{t('grants.create')}</Button> : null;
  if (!options.length && !(value ?? []).length) {
    return (
      <div className="inline inline--tight">
        <span className="faint">
          {onCreate ? t('grants.nothing') : t('grants.nothingHint')}
        </span>
        {create}
      </div>
    );
  }
  const list = value ?? [];
  const commit = (next: ItemGrant[]) => onChange(next.length ? next : undefined);
  const pick = (names: string[]) => {
    const kept = list.filter(item => names.includes(grantIds([item])[0]!));
    const have = new Set(grantIds(kept));
    commit([...kept, ...names.filter(name => !have.has(name))]);
  };
  const setArg = (effect: string, key: string, next: SlotRef | null) => {
    commit(list.map(item => {
      const own = grantOf(item);
      if (own.effect !== effect) return item;
      const args: Record<string, { expr: string }> = { ...(own.args as Record<string, { expr: string }> | undefined) };
      if (next) args[key] = next as { expr: string }; else delete args[key];
      return Object.keys(args).length ? { effect, args } : effect;
    }));
  };
  const kind = withArgs && kindId ? recordKindOf(system, kindId) : undefined;
  const tables = kind ? list.map(grantOf).filter(own => {
    const effect = system.effects[own.effect];
    return effect && paramsOf(system, effect).some(param => param.kind !== 'sheet');
  }) : [];
  const chooser = <MultiChoice value={grantIds(list)} options={options} onChange={pick} />;
  const head = create ? <div className="inline inline--tight">{chooser}{create}</div> : chooser;
  if (!kind || !tables.length) return head;
  return (
    <div className="stack">
      {head}
      {tables.map(own => (
        <div key={own.effect} className="stack">
          <span className="faint">{t('grants.argsOf', { name: system.effects[own.effect]!.label || own.effect })}</span>
          <ArgsTable
            effectId={own.effect}
            args={own.args as Record<string, unknown> | undefined}
            system={system}
            recordKind={kind}
            kindId={kindId!}
            where={system.effects[own.effect]!.label || own.effect}
            onArg={(key, next) => setArg(own.effect, key, next)}
          />
        </div>
      ))}
    </div>
  );
}
