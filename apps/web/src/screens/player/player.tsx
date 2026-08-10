// Лист персонажа. Правит ЗНАЧЕНИЯ и ПРИНАДЛЕЖНОСТИ — состав полей не трогает.
//
// Граница режимов держится импортами: этот файл не знает ни одного модуля,
// который правит систему. Кнопок правки полей здесь нет — не спрятаны,
// а не созданы. Закрыто тестом (src/app.border.test.ts).
//
// Правая колонка переделана целиком: в PoC там сплошной лентой шли снаряжение,
// эффекты, броски, действия и «применить» — без единой границы между ними.
// Здесь это сворачиваемые секции со счётчиками, и открыта по умолчанию
// та, ради которой на лист обычно и заходят.

import { useWorld, fieldsByGroup } from '../../store/world.ts';
import { useReader, show } from '../../engine/use-calc.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import {
  Card, CardHead, Field, Input, Button, Empty, Fold, Chip, Verdict,
} from '../../ui/primitives.tsx';
import type { Sheet, System, Field as FieldModel, StoredValue } from '@vtt/schema';
import { availableActions } from '@vtt/engine/events/envelope';
import { wornEffects } from '@vtt/engine/engine/effects';

export function PlayerScreen() {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const sheets = useWorld(s => s.sheets);
  const activeId = useWorld(s => s.activeSheetId);
  const pick = useWorld(s => s.pick);
  const editSheets = useWorld(s => s.editSheets);

  const sheet = sheets.find(s => s.id === activeId) ?? null;
  const reader = useReader(system, sheet, compendium);

  const create = () => {
    const id = `sheet-${sheets.length + 1}`;
    editSheets(draft => {
      draft.push({
        id,
        systemId: system.id ?? 'new-system',
        kind: 'pc',
        name: 'Новый персонаж',
        values: {},
        equipped: [],
        effects: [],
        actions: [],
      });
    });
    pick({ activeSheetId: id });
  };

  return (
    <Columns
      left={{
        head: 'Персонажи',
        tools: <Button size="sm" onClick={create}>+ лист</Button>,
        body: sheets.length === 0
          ? <Empty title="Листов нет" hint="Заведите первый — он будет считаться по текущей системе." />
          : (
            <List>
              {sheets.map(item => (
                <ListItem
                  key={item.id}
                  icon={item.kind === 'npc' ? '◇' : '◆'}
                  name={item.name ?? item.id}
                  meta={item.kind === 'npc' ? 'НПС' : 'персонаж игрока'}
                  active={item.id === activeId}
                  onClick={() => pick({ activeSheetId: item.id })}
                />
              ))}
            </List>
          ),
      }}
      main={{
        body: sheet
          ? <SheetBody sheet={sheet} system={system} reader={reader} />
          : <Empty title="Выберите персонажа слева" hint="Или заведите нового." />,
      }}
      right={sheet ? {
        head: 'Снаряжение и действия',
        body: <SidePanel sheet={sheet} system={system} />,
      } : undefined}
    />
  );
}

function SheetBody({ sheet, system, reader }: {
  sheet: Sheet;
  system: System;
  reader: ReturnType<typeof useReader>;
}) {
  const editSheets = useWorld(s => s.editSheets);

  const setValue = (tag: string, value: StoredValue) => {
    editSheets(draft => {
      const target = draft.find(s => s.id === sheet.id);
      if (target) target.values[tag] = value;
    });
  };

  const setName = (name: string) => {
    editSheets(draft => {
      const target = draft.find(s => s.id === sheet.id);
      if (target) target.name = name;
    });
  };

  const groups = fieldsByGroup(system);

  if (!system.fields.length) {
    return (
      <Empty
        title="В системе нет ни одного поля"
        hint="Лист собирается из полей, а их объявляет автор в конструкторе."
      />
    );
  }

  return (
    <>
      <Card>
        <Field label="Имя персонажа">
          <Input value={sheet.name ?? ''} onChange={setName} />
        </Field>
      </Card>

      {groups.map(([group, fields]) => (
        <Card key={group}>
          <CardHead title={group} />
          <div className="row">
            {fields.map(field => (
              <FieldCell
                key={field.tag}
                field={field}
                sheet={sheet}
                reader={reader}
                onChange={setValue}
              />
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

/**
 * Ячейка листа. Хранимое — правится, вычисленное — только показывается:
 * вычисленное НИКОГДА не попадает в чарник, его считает движок при каждой
 * отрисовке. Ошибка расчёта рисуется в ячейке и не роняет экран.
 */
function FieldCell({ field, sheet, reader, onChange }: {
  field: FieldModel;
  sheet: Sheet;
  reader: ReturnType<typeof useReader>;
  onChange: (tag: string, value: StoredValue) => void;
}) {
  if (field.value.kind === 'stored') {
    const stored = sheet.values[field.tag] ?? field.value.default;

    if (field.value.type === 'boolean') {
      return (
        <Field label={field.label}>
          <Button
            variant={stored ? 'primary' : undefined}
            onClick={() => onChange(field.tag, !stored)}
          >
            {stored ? 'да' : 'нет'}
          </Button>
        </Field>
      );
    }

    return (
      <Field label={field.label}>
        <Input
          type={field.value.type === 'number' ? 'number' : 'text'}
          value={String(stored ?? '')}
          onChange={next => onChange(field.tag, field.value.kind === 'stored' && field.value.type === 'number'
            ? (Number(next) || 0) : next)}
        />
      </Field>
    );
  }

  const computed = show(reader.valueOf(field.tag));
  return (
    <Field label={field.label} hint={field.value.kind === 'formula' ? 'считает движок' : 'из таблицы'}>
      <div
        className={`input num ${computed.bad ? 'input--bad' : ''}`}
        title={computed.title}
        style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}
      >
        {computed.text}
      </div>
    </Field>
  );
}

/** Правая колонка: разведена на секции со счётчиками вместо сплошной ленты. */
function SidePanel({ sheet, system }: { sheet: Sheet; system: System }) {
  const compendium = useWorld(s => s.compendium);
  const editSheets = useWorld(s => s.editSheets);

  const edit = (change: (draft: Sheet) => void) => {
    editSheets(draft => {
      const target = draft.find(s => s.id === sheet.id);
      if (target) change(target);
    });
  };

  const items = compendium.items ?? [];
  const actions = compendium.actions ?? [];
  const equipped = new Set(sheet.equipped ?? []);
  const known = new Set(sheet.actions ?? []);

  let available: { id: string; label: string }[] = [];
  try { available = availableActions(sheet, { system, compendium }); } catch { available = []; }

  let worn: { id: string; effect: { label?: string } }[] = [];
  try { worn = wornEffects(system, sheet, { strict: false }); } catch { worn = []; }

  const passives = Object.entries(system.effects)
    .filter(([, effect]) => (effect.activation ?? 'manual') === 'passive');

  return (
    <>
      <Fold title="Что применить" count={available.length} open>
        {available.length === 0
          ? <span className="faint">Нечего: наденьте предмет или выучите действие ниже.</span>
          : (
            <div className="stack stack--tight">
              {available.map(action => (
                <Card key={action.id} tone="flat">
                  <span className="nowrap">{action.label}</span>
                  <span className="faint" style={{ fontSize: 'var(--fs-2)' }}>
                    применяется за столом — там есть по кому
                  </span>
                </Card>
              ))}
            </div>
          )}
      </Fold>

      <Fold title="Снаряжение" count={equipped.size}>
        {items.length === 0
          ? <span className="faint">В компендиуме нет предметов.</span>
          : items.map(item => (
            <Chip
              key={item.id}
              active={equipped.has(item.id)}
              onClick={() => edit(draft => {
                const list = draft.equipped ??= [];
                const at = list.indexOf(item.id);
                if (at < 0) list.push(item.id); else list.splice(at, 1);
              })}
            >
              {item.label ?? item.id}
            </Chip>
          ))}
      </Fold>

      <Fold title="Известные действия" count={known.size}>
        {actions.length === 0
          ? <span className="faint">В компендиуме нет действий.</span>
          : actions.map(action => (
            <Chip
              key={action.id}
              active={known.has(action.id)}
              onClick={() => edit(draft => {
                const list = draft.actions ??= [];
                const at = list.indexOf(action.id);
                if (at < 0) list.push(action.id); else list.splice(at, 1);
              })}
            >
              {action.label ?? action.id}
            </Chip>
          ))}
      </Fold>

      <Fold title="Висящие эффекты" count={worn.length}>
        {passives.length === 0
          ? <span className="faint">Пассивных эффектов в системе нет.</span>
          : (
            <>
              <div className="inline inline--tight">
                {passives.map(([id, effect]) => {
                  const on = (sheet.effects ?? []).some(e => e.effectId === id);
                  return (
                    <Chip
                      key={id}
                      active={on}
                      onClick={() => edit(draft => {
                        const list = draft.effects ??= [];
                        const at = list.findIndex(e => e.effectId === id);
                        if (at < 0) list.push({ effectId: id }); else list.splice(at, 1);
                      })}
                    >
                      {effect.label ?? id}
                    </Chip>
                  );
                })}
              </div>
              <span className="faint" style={{ fontSize: 'var(--fs-2)' }}>
                Эффекты живут в системе: их правит автор, игрок только вешает и снимает.
              </span>
            </>
          )}
      </Fold>

      {system.room_rules?.length ? (
        <Fold title="Действует на всех в комнате" count={system.room_rules.length}>
          <div className="inline inline--tight">
            {system.room_rules.map(id => (
              <Chip key={id}>{system.effects[id]?.label ?? id}</Chip>
            ))}
          </div>
        </Fold>
      ) : null}

      {sheet.systemId !== system.id ? (
        <Verdict tone="warn">
          Лист собран по другой системе ({sheet.systemId}) — часть полей может не считаться.
        </Verdict>
      ) : null}
    </>
  );
}
