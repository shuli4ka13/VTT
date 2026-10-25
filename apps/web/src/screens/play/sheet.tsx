import { useMemo, useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { useReader } from '../../engine/use-calc.ts';
import { maySheet } from '../../engine/rights.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { Card, CardHead, Empty, Fold, Chip, Input, Button, Field, Select } from '../../ui/primitives.tsx';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { recordDetails } from '../../sheet/record-view.tsx';
import { useSession } from '../../store/session.ts';
import { Lobby } from './lobby.tsx';
import { Hanging } from './hanging.tsx';
import type { Sheet, System, RoomState, Owned, CompendiumRecord } from '@vtt/schema';
import { blockNames, blockOf, NO_BLOCK } from '@vtt/engine/model/blocks';
import { availableActions } from '@vtt/engine/events/actions';
import { recordsOf, isItem, sheetKinds, sheetKindOf, shownOn, recordKindOf } from '@vtt/engine/model/owned';
import { fieldsFor, livesOn } from '@vtt/engine/engine/calc';
import { isGroup, sharedOf } from '@vtt/engine/events/desk';
import { isDesk as atDesk } from '@vtt/engine/engine/owners';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

export function SheetScreen() {
  const room = useRoom(s => s.room);
  const mySheetId = useRoom(s => s.mySheetId);
  const pickSheet = useRoom(s => s.pickSheet);
  const [newName, setNewName] = useState('');
  const [newOf, setNewOf] = useState('');

  if (!room) return <Lobby />;

  const sheet = room.sheets.find(s => s.id === mySheetId) ?? null;

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    tableSocket.createSheet(room.id, name, newOf || undefined);
    setNewName('');
  };
  const kinds = sheetKinds(room.system as System);

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
                      name={item.name ?? item.id}
                      meta={atDesk(item) ? 'общий для всех' : isGroup(item, room.sheets) ? 'группа' : sheetKindOf(room.system as System, item)?.label ?? 'лист'}
                      active={item.id === mySheetId}
                      onClick={() => pickSheet(item.id)}
                    />
                  ))}
                </List>
              )}
            <div className="stack stack--tight">
              <Input value={newName} onChange={setNewName} placeholder="имя нового листа"
                onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) create(); }} />
              {kinds.length ? (
                <Select
                  value={newOf}
                  options={[['', '— без типа —'], ...kinds.map(([key, k]) => [key, k.label ?? key] as const)] as never}
                  onChange={setNewOf}
                />
              ) : null}
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
      right={sheet && !atDesk(sheet) ? { head: 'Снаряжение и действия', body: <SidePanel room={room} sheet={sheet} /> } : undefined}
    />
  );
}

function SheetBody({ room, sheet }: { room: RoomState; sheet: Sheet }) {
  const me = useSession(s => s.userId);
  const isDesk = atDesk(sheet);
  const asGroup = !isDesk && isGroup(sheet, room.sheets);
  const shared = useMemo(() => sharedOf(room.system as System, room.sheets), [room.system, room.sheets]);
  const system = room.system as System;
  const scope = isDesk ? 'desk' : asGroup ? 'group' : 'sheet';
  const fields = useMemo(() => fieldsFor(system, scope), [system, scope]);
  const reader = useReader(system, sheet, room.compendium, isDesk || asGroup ? null : shared, isDesk ? 'desk' : undefined);
  const kinds = sheetKinds(room.system as System);
  const kind = sheetKindOf(room.system as System, sheet);
  const hasGroups = fieldsOf(system).some(field => livesOn(field) === 'group');
  const only = kind?.blocks?.length ? fields.filter(shownOn(system, sheet)).map(f => f.tag) : undefined;
  const editable = maySheet(room, me, sheet.id);
  const [claims, setClaims] = useState<string[]>([]);
  const claimable = useMemo(() => claimWords(system), [system]);

  return (
    <>
      {isDesk ? <span className="faint">общий стол комнаты — видят все, правит ведущий</span> : <ClaimRow room={room} sheet={sheet} />}
      {!isDesk && editable && claimable.length ? (
        <div className="inline inline--tight">
          <span className="faint">заявить к броску с листа:</span>
          {claimable.map(([key, label]) => (
            <Chip key={key} active={claims.includes(key)} onClick={() => setClaims(claims.includes(key) ? claims.filter(one => one !== key) : [...claims, key])}>{label}</Chip>
          ))}
        </div>
      ) : null}
      {!isDesk && !asGroup && hasGroups && editable ? (
        <Field label="Группа">
          <Select
            value={sheet.group ?? ''}
            options={[['', '— не в группе —'], ...room.sheets
              .filter(other => other.id !== sheet.id && !atDesk(other) && !other.group)
              .map(other => [other.id, other.name ?? other.id] as const)] as never}
            onChange={next => tableSocket.setSheetGroup(room.id, sheet.id, next || null)}
          />
        </Field>
      ) : null}
      {!isDesk && kinds.length && editable ? (
        <Field label="Тип листа">
          <Select
            value={sheet.of ?? ''}
            options={[['', '— без типа —'], ...kinds.map(([key, k]) => [key, k.label ?? key] as const)] as never}
            onChange={next => tableSocket.setSheetKind(room.id, sheet.id, next || null)}
          />
        </Field>
      ) : null}
      {!isDesk && (sheet.effects ?? []).length ? (
        <Card>
          <CardHead title="Висит сейчас" />
          <Hanging
            room={room} sheet={sheet}
            {...(editable ? { onRemove: entry => tableSocket.setBelonging(room.id, sheet.id, 'effects', entry.effectId, false) } : {})}
          />
        </Card>
      ) : null}
      <SheetView
        system={system}
        fields={fields}
        sheet={sheet}
        reader={reader}
        only={only}
        badge={isDesk ? 'стол' : kind?.label ?? 'лист'}
        onChange={editable ? (tag, value) => tableSocket.setValue(room.id, sheet.id, tag, value) : undefined}
        onRoll={tag => {
          tableSocket.rollField(room.id, sheet.id, tag, useRoom.getState().secret && room.members.some(m => m.userId === useSession.getState().userId && m.role === 'gm'), claims);
          setClaims([]);
        }}
      />
    </>
  );
}

function ClaimRow({ room, sheet }: { room: RoomState; sheet: Sheet }) {
  const userId = useSession(s => s.userId);
  const me = room.members.find(m => m.userId === userId);
  const holder = room.members.find(m => m.sheetId === sheet.id);
  if (me?.role === 'gm') {
    return holder
      ? <span className="faint">играет: {holder.name}</span>
      : <span className="faint">лист никем не закреплён — ведущий правит любой</span>;
  }
  if (holder && holder.userId === userId) {
    return (
      <div className="inline inline--tight">
        <Chip active>ваш лист</Chip>
        <Button size="sm" variant="ghost" onClick={() => tableSocket.claimSheet(room.id, null)}>отпустить</Button>
      </div>
    );
  }
  if (holder) return <span className="faint">играет: {holder.name} — правит только он и ведущий</span>;
  return (
    <div className="inline inline--tight">
      <span className="faint">лист свободен</span>
      <Button size="sm" onClick={() => tableSocket.claimSheet(room.id, sheet.id)}>играю этим листом</Button>
    </div>
  );
}

function actionsOf(sheet: Sheet, room: RoomState): { id: string; label: string }[] {
  try {
    return availableActions(sheet, { system: room.system, compendium: room.compendium });
  } catch {
    return [];
  }
}

function shelvesOf<T extends CompendiumRecord>(system: System, items: readonly T[], query: string): [string, T[]][] {
  const needle = query.trim().toLocaleLowerCase('ru');
  const order = blockNames(system);
  const shelves = new Map<string, T[]>();
  for (const item of items) {
    if (needle && !(item.label ?? item.id).toLocaleLowerCase('ru').includes(needle)) continue;
    const block = blockOf(system, recordKindOf(system, item.table)) ?? NO_BLOCK;
    shelves.set(block, [...(shelves.get(block) ?? []), item]);
  }
  const at = (block: string) => (block === NO_BLOCK ? Infinity : order.indexOf(block) < 0 ? order.length : order.indexOf(block));
  return [...shelves].sort(([a], [b]) => at(a) - at(b));
}

function SidePanel({ room, sheet }: { room: RoomState; sheet: Sheet }) {
  const me = useSession(s => s.userId);
  const [query, setQuery] = useState('');
  const available = actionsOf(sheet, room);

  const system = room.system as System;
  const records = recordsOf(room.compendium);
  const owned = (id: string) => (sheet.has ?? []).find(entry => entry.of === id);
  const copies = (id: string) => (sheet.has ?? []).filter(entry => entry.of === id);
  const keyOf = (entry: { of: string; id?: string }) => entry.id ?? entry.of;
  const labelOf = (key: string) => {
    const entry = (sheet.has ?? []).find(one => keyOf(one) === key);
    const record = entry ? records.find(one => one.id === entry.of) : undefined;
    const same = entry ? copies(entry.of) : [];
    return `${record?.label ?? key}${same.length > 1 ? ` №${same.indexOf(entry!) + 1}` : ''}`;
  };
  const inside = (key: string): Set<string> => {
    const out = new Set([key]);
    for (let grew = true; grew;) {
      grew = false;
      for (const one of sheet.has ?? []) if (one.in && out.has(one.in) && !out.has(keyOf(one))) { out.add(keyOf(one)); grew = true; }
    }
    return out;
  };
  const belong = (id: string, entry: { of: string; id?: string }, change: { on: boolean; off?: boolean; in?: string | null }) =>
    tableSocket.setBelonging(room.id, sheet.id, 'has', id, change.on, change.off, { inst: keyOf(entry), ...(change.in !== undefined ? { in: change.in } : {}) });
  const wornOf = (id: string) => (sheet.effects ?? []).find(e => e.effectId === id);

  const toggle = (list: 'has' | 'effects', id: string, on: boolean, off?: boolean) =>
    tableSocket.setBelonging(room.id, sheet.id, list, id, on, off);

  const items = records.filter(record => isItem(system, record));
  const actions = records.filter(record => !isItem(system, record));
  const carried = items.filter(item => owned(item.id)).length;
  const known = actions.filter(action => owned(action.id)).length;
  const shared = useMemo(() => sharedOf(system, room.sheets), [system, room.sheets]);
  const reader = useReader(system, sheet, room.compendium, isGroup(sheet, room.sheets) ? null : shared);
  const itemDetails = (item: (typeof items)[number], entry: Owned): string =>
    recordDetails(item, system, room.compendium, { entry, ...(reader.measure ? { count: reader.measure } : {}) })
      .map(line => `${line.label}: ${line.value}`).join(' · ');

  const add = (id: string) => (copies(id).length
    ? tableSocket.setBelonging(room.id, sheet.id, 'has', id, true, false, { add: true })
    : toggle('has', id, true));
  const hints = useMemo(() => new Map(records.filter(record => isItem(system, record))
    .map(item => [item.id, recordDetails(item, system, room.compendium).map(line => `${line.label}: ${line.value}`).join(' · ')])), [records, system, room.compendium]);
  const found = query.trim() !== '';
  const shelves = shelvesOf(system, items, query);

  const hangable = Object.entries(room.system.effects)
    .filter(([, effect]) => (effect.activation ?? 'manual') !== 'manual');

  const editable = maySheet(room, me, sheet.id);

  return (
    <>
      <Fold title="Что применить" count={available.length} open>
        {available.length === 0
          ? <span className="faint">Нечего: наденьте предмет или выучите действие ниже.</span>
          : available.map(action => (
            <Card key={action.id} tone="flat">
              <span className="nowrap" title="применяется за столом">{action.label}</span>
            </Card>
          ))}
      </Fold>

      <Fold title="Снаряжение" count={carried}>
        {items.length === 0
          ? <span className="faint">В компендиуме мира нет предметов.</span>
          : (
            <div className="stack stack--tight">
              {items.filter(item => copies(item.id).length).map(item => {
                const mine = copies(item.id);
                return (
                  <div key={item.id}>
                    <Chip active={mine.some(entry => !entry.off)} onClick={() => add(item.id)}>
                      {item.label ?? item.id} · + ещё один
                    </Chip>
                    {mine.map(entry => {
                      const hosts = (sheet.has ?? []).filter(one => !inside(keyOf(entry)).has(keyOf(one)));
                      const details = itemDetails(item, entry);
                      return (
                        <div key={keyOf(entry)}>
                          <div className="inline inline--tight">
                            <span className="faint">{labelOf(keyOf(entry))}</span>
                            <Chip onClick={() => belong(item.id, entry, { on: true, off: !entry.off })}>{entry.off ? 'в сумке' : 'надето'}</Chip>
                            <Chip onClick={() => belong(item.id, entry, { on: false })}>✕ убрать</Chip>
                            {hosts.length ? (
                              <Select
                                value={entry.in ?? ''}
                                options={[['', 'стоит отдельно'], ...hosts.map(one => [keyOf(one), `в: ${labelOf(keyOf(one))}`] as const)] as never}
                                onChange={next => belong(item.id, entry, { on: true, off: Boolean(entry.off), in: next || null })}
                              />
                            ) : null}
                          </div>
                          {details ? <div className="faint">{details}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              <span className="field__label">Добавить вещь</span>
              <Input value={query} onChange={setQuery} placeholder="найти по названию" />
              {shelves.length === 0
                ? <span className="faint">Ничего не нашлось.</span>
                : shelves.map(([block, list]) => (
                  <Fold key={`${block}${found ? ' ·' : ''}`} title={block} count={list.length} open={found}>
                    <div className="inline inline--tight">
                      {list.map(item => (
                        <Chip key={item.id} active={copies(item.id).length > 0} title={hints.get(item.id) || undefined} onClick={() => add(item.id)}>
                          {item.label ?? item.id}
                        </Chip>
                      ))}
                    </div>
                  </Fold>
                ))}
            </div>
          )}
      </Fold>

      <Fold title="Известные действия" count={known}>
        {actions.length === 0
          ? <span className="faint">В компендиуме мира нет действий.</span>
          : (
            <div className="inline inline--tight">
              {actions.map(action => (
                <Chip
                  key={action.id}
                  active={Boolean(owned(action.id))}
                  onClick={() => toggle('has', action.id, !owned(action.id))}
                >
                  {action.label ?? action.id}
                </Chip>
              ))}
            </div>
          )}
      </Fold>

      {editable ? (
        <Fold title="Повесить…" count={hangable.length}>
          {hangable.length === 0
            ? <span className="faint">В системе нет эффектов, которые можно повесить.</span>
            : (
              <div className="inline inline--tight">
                {hangable.filter(([id]) => !wornOf(id)).map(([id, effect]) => (
                  <Chip key={id} onClick={() => toggle('effects', id, true)}>{effect.label ?? id}</Chip>
                ))}
              </div>
            )}
        </Fold>
      ) : null}

    </>
  );
}

export function claimWords(system: System): [string, string][] {
  const words = Object.entries(system.roll_edits ?? {}).map(([key, edit]) => [key, edit.label || key] as [string, string]);
  const marks: [string, string][] = [];
  for (const table of Object.values(system.tables ?? {})) {
    for (const row of table.rows ?? []) {
      if ((row.cells as Record<string, unknown> | undefined)?.claim === true) marks.push([String(row.value), String(row.label ?? row.value)]);
    }
  }
  return [...words, ...marks];
}
