import { useState } from 'react';
import {
  CRIT_OPTIONS, ARMOR_OPTIONS, critOf, armorOf, setCrit, setArmor,
} from '@vtt/engine/model/toggles';
import type { ArmorChoice } from '@vtt/engine/model/toggles';
import { Card, CardHead, Field, Segmented, Select, Verdict, Button, DangerButton } from '../../../ui/primitives.tsx';
import type { System } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem }

const numberFields = (system: System) =>
  system.fields.filter(f => f.value.kind === 'stored' && f.value.type === 'number');

export function TogglesSection({ system, editSystem }: Props) {
  const crit = critOf(system);
  const events = Object.entries(system.events ?? {});
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
  const tail = system.events?.[event]?.receive ?? [];

  const write = () => {
    if (!event || !hpTag) return;
    editSystem(draft => { setArmor(draft, wanted, { event, armor: armorTag, hp: hpTag }); });
    setChoice(null);
  };

  return (
    <Card>
      <CardHead
        title="Тоглы"
        sub="Переключатели, которые пишут данные за вас. Что именно записалось — видно на вкладке «Эффекты»."
      />

      <Field label="Крит" hint={CRIT_OPTIONS.find(o => o.key === crit)?.hint}>
        <Segmented
          value={crit}
          options={CRIT_OPTIONS.map(o => ({ key: o.key, label: o.label, title: o.hint }))}
          onChange={next => editSystem(draft => { setCrit(draft, next); })}
        />
      </Field>

      {events.length === 0 ? (
        <Verdict tone="warn">
          Броне нужен общий эффект урона — заведите его на вкладке «Эффекты» в группе «Общие», и здесь появится переключатель.
        </Verdict>
      ) : (
        <>
          <div className="row">
            <Field label="Общий эффект урона">
              <Select
                value={event}
                options={events.map(([key, e]) => [key, e.label || key] as const) as never}
                onChange={next => { setEvent(next); setChoice(null); setArmorTag(''); setHpTag(''); }}
              />
            </Field>
            <Field label="Поле брони">
              <Select
                value={armorTag}
                options={numbers.map(f => [f.tag, f.label] as const) as never}
                onChange={setArmorTag}
              />
            </Field>
            <Field label="Поле хитов">
              <Select
                value={hpTag}
                options={numbers.map(f => [f.tag, f.label] as const) as never}
                onChange={setHpTag}
              />
            </Field>
          </div>
          <Field label="Броня" hint={ARMOR_OPTIONS.find(o => o.key === wanted)?.hint}>
            <Segmented
              value={wanted}
              options={ARMOR_OPTIONS.map(o => ({ key: o.key, label: o.label, title: o.hint }))}
              onChange={setChoice}
            />
          </Field>
          {changed ? (
            <Verdict
              tone="warn"
              action={tail.length
                ? <DangerButton size="sm" onConfirm={write}>Переписать</DangerButton>
                : <Button size="sm" variant="primary" onClick={write}>Записать</Button>}
            >
              {tail.length
                ? `Общий эффект «${system.events?.[event]?.label || event}» будет переписан: ${tail.length} ${tail.length === 1 ? 'шаг' : 'шага'} заменятся готовыми.`
                : `В общий эффект «${system.events?.[event]?.label || event}» лягут готовые шаги.`}
            </Verdict>
          ) : null}
        </>
      )}
    </Card>
  );
}
