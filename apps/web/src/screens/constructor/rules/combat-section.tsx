import type { System } from '@vtt/schema';
import { DEFAULT_LIMITS } from '@vtt/engine';
import type { Limits } from '@vtt/engine';
import { Card, CardHead, Field, Fold, Select, NumInput, Button, Input } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { TagsField } from '../tags-field.tsx';
import { dieEntries } from './dice-section.tsx';
import type { WorldState } from '../../../store/world.ts';
import { useT, t } from '../../../i18n/author.ts';

type EditSystem = WorldState['editSystem'];

const limitLabels = (): Record<keyof Limits, string> => ({
  handlerDepth: t('rolls:combat.limit.handlerDepth'),
  budget: t('rolls:combat.limit.budget'),
  settleRounds: t('rolls:combat.limit.settleRounds'),
  callDepth: t('rolls:combat.limit.callDepth'),
  probes: t('rolls:combat.limit.probes'),
});

const diagonals = () => [['one', t('rolls:combat.diagonalOne')], ['alt', t('rolls:combat.diagonalAlt')], ['line', t('rolls:combat.diagonalLine')]] as const;

export function CombatSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const t = useT('rolls');
  const labels = limitLabels();
  const initiative = system.initiative;
  const grid = system.grid;
  const limits = (system as { limits?: Partial<Limits> }).limits ?? {};
  return (
    <Card>
      <CardHead
        title={t('combat.title')}
        sub={t('combat.sub')}
        actions={initiative ? null : (
          <Button size="sm" onClick={() => editSystem(draft => {
            const die = dieEntries(draft)[0]?.[0];
            if (die) draft.initiative = { die };
          })} disabled={!dieEntries(system).length}>{t('combat.addInitiative')}</Button>
        )}
      />
      {initiative ? (
        <div className="row">
          <Field label={t('combat.initiativeDie')}>
            <Select<string>
              value={initiative.die}
              options={dieEntries(system).map(([key, c]) => [key, c.label || key] as const)}
              onChange={next => editSystem(draft => { if (draft.initiative) draft.initiative.die = next; })}
            />
          </Field>
          <Field label={t('combat.bonus')} hint={t('combat.bonusHint')}>
            <FormulaField
              value={String(initiative.bonus?.expr ?? '')}
              system={system}
              where={t('combat.bonusWhere')}
              placeholder={t('combat.bonusPlaceholder')}
              onCommit={text => editSystem(draft => { if (!draft.initiative) return; if (text.trim()) draft.initiative.bonus = { expr: text.trim() }; else delete draft.initiative.bonus; })}
            />
          </Field>
          <Field label={t('combat.tags')}>
            <TagsField
              system={system} value={initiative.tags}
              onChange={next => editSystem(draft => { if (!draft.initiative) return; const list = next.filter((t): t is string => typeof t === 'string'); if (list.length) draft.initiative.tags = list; else delete draft.initiative.tags; })}
            />
          </Field>
          <Button size="sm" variant="ghost" onClick={() => editSystem(draft => { delete draft.initiative; })}>{t('combat.dropInitiative')}</Button>
        </div>
      ) : null}
      <Field label={t('combat.grid')} hint={t('combat.gridHint')}>
        <label className="inline inline--tight">
          <input
            type="checkbox" className="sheet-grid__check"
            aria-label={t('combat.gridCheck')}
            checked={Boolean(grid)}
            onChange={e => editSystem(draft => { if (e.target.checked) draft.grid ??= { step: 1 }; else delete draft.grid; })}
          />
          <span>{t('combat.gridCheck')}</span>
        </label>
      </Field>
      {grid ? (
        <div className="row">
          <Field label={t('combat.step')}>
            <NumInput least={0.01} value={grid.step} onCommit={n => editSystem(draft => { if (draft.grid && n > 0) draft.grid.step = n; })} />
          </Field>
          <Field label={t('combat.unit')} hint={t('combat.unitHint')}>
            <Input
              value={grid.unit ?? ''}
              placeholder={t('combat.unitPlaceholder')}
              onChange={next => editSystem(draft => { if (!draft.grid) return; if (next) draft.grid.unit = next; else delete draft.grid.unit; })}
            />
          </Field>
          <Field label={t('combat.diagonal')}>
            <Select<string>
              value={grid.diagonal ?? 'one'}
              options={diagonals()}
              onChange={next => editSystem(draft => { if (!draft.grid) return; if (next === 'one') delete draft.grid.diagonal; else draft.grid.diagonal = next as 'alt' | 'line'; })}
            />
          </Field>
        </div>
      ) : null}
      <Fold title={t('common:more')} summary={t('combat.limitsSummary')}>
        <span className="faint">{t('combat.limitsHint')}</span>
        <div className="row">
          {(Object.keys(DEFAULT_LIMITS) as (keyof Limits)[]).map(key => (
            <Field key={key} label={labels[key]}>
              <NumInput int least={1} value={limits[key] ?? DEFAULT_LIMITS[key]} onCommit={n => editSystem(draft => {
                const own = { ...((draft as { limits?: Partial<Limits> }).limits ?? {}) };
                if (n === DEFAULT_LIMITS[key]) delete own[key]; else own[key] = n;
                if (Object.keys(own).length) (draft as { limits?: Partial<Limits> }).limits = own;
                else delete (draft as { limits?: unknown }).limits;
              })} />
            </Field>
          ))}
        </div>
      </Fold>
    </Card>
  );
}
