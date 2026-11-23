import { useState } from 'react';
import { CRIT_OPTIONS, ARMOR_OPTIONS, critOf, armorOf, setCrit, setArmor, sheetInputOf, calledOf, fieldsOf } from '@vtt/engine';
import type { ArmorChoice } from '@vtt/engine';
import { Card, CardHead, Field, Segmented, Select, Verdict, Button, DangerButton } from '../../../ui/primitives.tsx';
import type { System } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';
import { useT } from '../../../i18n/author.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem }

const numberFields = (system: System) =>
  fieldsOf(system).filter(f => f.value.kind === 'stored' && f.value.type === 'number');

export function TogglesSection({ system, editSystem }: Props) {
  const t = useT('rolls');
  const crit = critOf(system);
  const events = calledOf(system);
  const [event, setEvent] = useState<string>(events[0]?.[0] ?? '');
  const reading = event ? armorOf(system, event) : { choice: 'none' as const, armor: null, hp: null };
  const numbers = numberFields(system);
  const [armor, setArmorTag] = useState<string>('');
  const [hp, setHpTag] = useState<string>('');
  const [choice, setChoice] = useState<ArmorChoice | null>(null);

  const armorTag = armor || reading.armor || numbers[0]?.tag || '';
  const hpTag = hp || reading.hp || numbers.find(f => f.tag !== armorTag)?.tag || '';
  const wanted = choice ?? reading.choice;
  const changed = wanted !== reading.choice || (reading.armor && armorTag !== reading.armor) || (reading.hp && hpTag !== reading.hp);
  const tail = system.effects?.[event]?.steps ?? [];
  const whom = sheetInputOf(system.effects?.[event]);

  const write = () => {
    if (!event || !hpTag || !whom) return;
    editSystem(draft => { setArmor(draft, wanted, { event, armor: armorTag, hp: hpTag }); });
    setChoice(null);
  };

  return (
    <Card>
      <CardHead
        title={t('toggles.title')}
        sub={t('toggles.sub')}
      />

      <Field label={t('toggles.crit')} hint={CRIT_OPTIONS.find(o => o.key === crit)?.hint}>
        <Segmented
          value={crit}
          options={CRIT_OPTIONS.map(o => ({ key: o.key, label: o.label, title: o.hint }))}
          onChange={next => editSystem(draft => { setCrit(draft, next); })}
        />
      </Field>

      {events.length === 0 ? (
        <Verdict tone="warn">
          {t('toggles.needDamage')}
        </Verdict>
      ) : (
        <>
          <div className="row">
            <Field label={t('toggles.damage')}>
              <Select
                value={event}
                options={events.map(([key, e]) => [key, e.label || key] as const) as never}
                onChange={next => { setEvent(next); setChoice(null); setArmorTag(''); setHpTag(''); }}
              />
            </Field>
            <Field label={t('toggles.armorField')}>
              <Select
                value={armorTag}
                options={numbers.map(f => [f.tag, f.label] as const) as never}
                onChange={setArmorTag}
              />
            </Field>
            <Field label={t('toggles.hpField')}>
              <Select
                value={hpTag}
                options={numbers.map(f => [f.tag, f.label] as const) as never}
                onChange={setHpTag}
              />
            </Field>
          </div>
          <Field label={t('toggles.armor')} hint={ARMOR_OPTIONS.find(o => o.key === wanted)?.hint}>
            <Segmented
              value={wanted}
              options={ARMOR_OPTIONS.map(o => ({ key: o.key, label: o.label, title: o.hint }))}
              onChange={setChoice}
            />
          </Field>
          {changed && !whom ? (
            <Verdict tone="bad">
              {t('toggles.noInput', { name: system.effects?.[event]?.label || event })}
            </Verdict>
          ) : null}
          {changed && whom ? (
            <Verdict
              tone="warn"
              action={tail.length
                ? <DangerButton size="sm" onConfirm={write}>{t('toggles.rewrite')}</DangerButton>
                : <Button size="sm" variant="primary" onClick={write}>{t('toggles.write')}</Button>}
            >
              {tail.length
                ? t('toggles.replaced', { name: system.effects?.[event]?.label || event, count: tail.length })
                : t('toggles.put', { name: system.effects?.[event]?.label || event })}
            </Verdict>
          ) : null}
        </>
      )}
    </Card>
  );
}
