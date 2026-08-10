// Лист персонажа в партии. Показывает лист ИЗ КОМНАТЫ — того мира, в который
// играют. Локального мира автора здесь нет: иначе персонаж жил бы в одном
// мире, а стол в другом.
//
// Правит только ЗНАЧЕНИЯ и ПРИНАДЛЕЖНОСТИ. Состав полей не трогает — этот
// файл не знает ни одного модуля конструктора, и граница держится сборкой:
// код автора лежит в другом чанке.

import { useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { useReader, show } from '../../engine/use-calc.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { Card, CardHead, Field, Input, Button, Empty, Fold, Chip } from '../../ui/primitives.tsx';
import { Lobby } from './lobby.tsx';
import type { Sheet, System, Field as FieldModel, StoredValue, RoomState } from '@vtt/schema';
import { availableActions } from '@vtt/engine/events/envelope';

export function SheetScreen() {
  const room = useRoom(s => s.room);
  const mySheetId = useRoom(s => s.mySheetId);
  const pickSheet = useRoom(s => s.pickSheet);
  const [newName, setNewName] = useState('');

  if (!room) return <Lobby />;

  const sheet = room.sheets.find(s => s.id === mySheetId) ?? null;

  // Лист заводится В КОМНАТЕ: мир волен приезжать вообще без персонажей —
  // конструктор отдаёт систему, а героев партия делает себе сама.
  const create = () => {
    const name = newName.trim();
    if (!name) return;
    tableSocket.createSheet(room.id, name);
    setNewName('');
  };

  return (
    <Columns
      left={{
        head: 'Листы стола',
        body: (
          <>
            {room.sheets.length === 0
              ? <Empty
                  title="Листов ещё нет"
                  hint="Мир приехал без персонажей — заведите первого ниже."
                />
              : (
                <List>
                  {room.sheets.map(item => (
                    <ListItem
                      key={item.id}
                      icon={item.kind === 'npc' ? '◇' : '◆'}
                      name={item.name ?? item.id}
                      meta={item.kind === 'npc' ? 'НПС' : 'персонаж игрока'}
                      active={item.id === mySheetId}
                      onClick={() => pickSheet(item.id)}
                    />
                  ))}
                </List>
              )}
            <div className="stack stack--tight">
              <Input value={newName} onChange={setNewName} placeholder="имя нового персонажа" />
              <Button size="sm" wide onClick={create} disabled={!newName.trim()}>+ лист</Button>
            </div>
          </>
        ),
      }}
      main={{
        body: sheet
          ? <SheetBody room={room} sheet={sheet} />
          : <Empty title="Выберите лист слева" hint="Тот, которым играете." />,
      }}
      right={sheet ? { head: 'Снаряжение и действия', body: <SidePanel room={room} sheet={sheet} /> } : undefined}
    />
  );
}

function SheetBody({ room, sheet }: { room: RoomState; sheet: Sheet }) {
  const reader = useReader(room.system as System, sheet, room.compendium);

  // Правка уходит НА СЕРВЕР: за столом лист общий, и сосед должен увидеть
  // изменение. Локально ничего не меняем — придёт дельтой.
  const setValue = (tag: string, value: StoredValue) =>
    tableSocket.setValue(room.id, sheet.id, tag, value);

  const groups = new Map<string, FieldModel[]>();
  for (const field of room.system.fields) {
    const key = field.group ?? 'Без блока';
    const list = groups.get(key);
    if (list) list.push(field as FieldModel);
    else groups.set(key, [field as FieldModel]);
  }

  return (
    <>
      <Card>
        <CardHead title={sheet.name ?? sheet.id} badge={<Chip>{sheet.kind === 'npc' ? 'НПС' : 'игрок'}</Chip>} />
      </Card>

      {[...groups].map(([group, fields]) => (
        <Card key={group}>
          <CardHead title={group} />
          <div className="row">
            {fields.map(field => (
              <FieldCell key={field.tag} field={field} sheet={sheet} reader={reader} onChange={setValue} />
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

/**
 * Ячейка листа. Хранимое правится, вычисленное только показывается: оно
 * НИКОГДА не попадает в чарник, его считает движок при каждой отрисовке.
 * Ошибка расчёта рисуется в ячейке и не роняет экран.
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
          <Button variant={stored ? 'primary' : undefined} onClick={() => onChange(field.tag, !stored)}>
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
          onChange={next => onChange(
            field.tag,
            field.value.kind === 'stored' && field.value.type === 'number' ? (Number(next) || 0) : next,
          )}
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

/**
 * Правая колонка: принадлежности листа. Всё — ссылки на объявленное миром:
 * надел/снял, выучил/забыл, повесил/снял. Правка уходит НА СЕРВЕР и приходит
 * дельтой всем: за столом лист общий.
 */
function SidePanel({ room, sheet }: { room: RoomState; sheet: Sheet }) {
  let available: { id: string; label: string }[] = [];
  try {
    available = availableActions(sheet, { system: room.system, compendium: room.compendium });
  } catch { available = []; }

  const equipped = new Set(sheet.equipped ?? []);
  const known = new Set(sheet.actions ?? []);
  const wornOf = (id: string) => (sheet.effects ?? []).find(e => e.effectId === id);

  const toggle = (list: 'equipped' | 'actions' | 'effects', id: string, on: boolean) =>
    tableSocket.setBelonging(room.id, sheet.id, list, id, on);

  const items = room.compendium.items ?? [];
  const actions = room.compendium.actions ?? [];
  // Вешают пассивные и триггерные; активируемые — применяют, их тут нет.
  const hangable = Object.entries(room.system.effects)
    .filter(([, effect]) => (effect.activation ?? 'manual') !== 'manual');

  return (
    <>
      <Fold title="Что применить" count={available.length} open>
        {available.length === 0
          ? <span className="faint">Нечего: наденьте предмет или выучите действие ниже.</span>
          : available.map(action => (
            <Card key={action.id} tone="flat">
              <span className="nowrap">{action.label}</span>
              <span className="faint" style={{ fontSize: 'var(--fs-2)' }}>применяется за столом</span>
            </Card>
          ))}
      </Fold>

      <Fold title="Снаряжение" count={equipped.size}>
        {items.length === 0
          ? <span className="faint">В компендиуме мира нет предметов.</span>
          : (
            <div className="inline inline--tight">
              {items.map(item => (
                <Chip
                  key={item.id}
                  active={equipped.has(item.id)}
                  onClick={() => toggle('equipped', item.id, !equipped.has(item.id))}
                >
                  {item.label ?? item.id}
                </Chip>
              ))}
            </div>
          )}
        <span className="faint" style={{ fontSize: 'var(--fs-2)' }}>
          Надел — получил действия предмета, снял — потерял.
        </span>
      </Fold>

      <Fold title="Известные действия" count={known.size}>
        {actions.length === 0
          ? <span className="faint">В компендиуме мира нет действий.</span>
          : (
            <div className="inline inline--tight">
              {actions.map(action => (
                <Chip
                  key={action.id}
                  active={known.has(action.id)}
                  onClick={() => toggle('actions', action.id, !known.has(action.id))}
                >
                  {action.label ?? action.id}
                </Chip>
              ))}
            </div>
          )}
      </Fold>

      <Fold title="Висящие эффекты" count={(sheet.effects ?? []).length}>
        {hangable.length === 0
          ? <span className="faint">В системе нет эффектов, которые можно повесить.</span>
          : (
            <div className="inline inline--tight">
              {hangable.map(([id, effect]) => {
                const entry = wornOf(id);
                return (
                  <Chip
                    key={id}
                    active={Boolean(entry)}
                    title={entry?.usesLeft ? `осталось: ${entry.usesLeft}` : undefined}
                    onClick={() => toggle('effects', id, !entry)}
                  >
                    {(effect.activation ?? 'manual') === 'triggered' ? '⚡ ' : ''}
                    {effect.label ?? id}
                    {entry?.usesLeft ? ` · ${entry.usesLeft}` : ''}
                  </Chip>
                );
              })}
            </div>
          )}
        <span className="faint" style={{ fontSize: 'var(--fs-2)' }}>
          Обычно их вешают события — отравление при провале спасброска; руками
          тоже можно, это и есть «наложить состояние».
        </span>
      </Fold>

      {room.system.room_rules?.length ? (
        <Fold title="Действует на всех" count={room.system.room_rules.length}>
          <div className="inline inline--tight">
            {room.system.room_rules.map(id => (
              <Chip key={id}>{room.system.effects[id]?.label ?? id}</Chip>
            ))}
          </div>
        </Fold>
      ) : null}
    </>
  );
}
