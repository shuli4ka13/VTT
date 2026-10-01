import { useMemo, useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { useReader } from '../../engine/use-calc.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { Card, Empty, Fold, Chip, Input, Button, Field, Select } from '../../ui/primitives.tsx';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { recordDetails } from '../../sheet/record-view.tsx';
import { useSession } from '../../store/session.ts';
import { Lobby } from './lobby.tsx';
import type { Sheet, System, RoomState } from '@vtt/schema';
import { availableActions } from '@vtt/engine/events/actions';
import { recordsOf, isItem, sheetKinds, sheetKindOf, shownOn } from '@vtt/engine/model/owned';
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

  return (
    <>
      {isDesk ? <span className="faint">общий стол комнаты — видят все, правит ведущий</span> : <ClaimRow room={room} sheet={sheet} />}
      {!isDesk && !asGroup && hasGroups ? (
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
      {!isDesk && kinds.length ? (
        <Field label="Тип листа">
          <Select
            value={sheet.of ?? ''}
            options={[['', '— без типа —'], ...kinds.map(([key, k]) => [key, k.label ?? key] as const)] as never}
            onChange={next => tableSocket.setSheetKind(room.id, sheet.id, next || null)}
          />
        </Field>
      ) : null}
      <SheetView
        system={system}
        fields={fields}
        sheet={sheet}
        reader={reader}
        only={only}
        badge={isDesk ? 'стол' : kind?.label ?? 'лист'}
        onChange={(tag, value) => tableSocket.setValue(room.id, sheet.id, tag, value)}
        onRoll={tag => tableSocket.rollField(room.id, sheet.id, tag)}
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
        <Chip active>мой лист</Chip>
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

function SidePanel({ room, sheet }: { room: RoomState; sheet: Sheet }) {
  const available = actionsOf(sheet, room);

  const system = room.system as System;
  const owned = (id: string) => (sheet.has ?? []).find(entry => entry.of === id);
  const wornOf = (id: string) => (sheet.effects ?? []).find(e => e.effectId === id);

  const toggle = (list: 'has' | 'effects', id: string, on: boolean, off?: boolean) =>
    tableSocket.setBelonging(room.id, sheet.id, list, id, on, off);

  const records = recordsOf(room.compendium);
  const items = records.filter(record => isItem(system, record));
  const actions = records.filter(record => !isItem(system, record));
  const carried = items.filter(item => owned(item.id)).length;
  const known = actions.filter(action => owned(action.id)).length;
  const itemDetails = (item: (typeof items)[number]): string[] =>
    recordDetails(item, room.system as System, room.compendium).map(line => `${line.label}: ${line.value}`);

  const hangable = Object.entries(room.system.effects)
    .filter(([, effect]) => (effect.activation ?? 'manual') !== 'manual');

  const heldIds = (sheet.effects ?? [])
    .map(entry => entry.effectId)
    .filter(id => !hangable.some(([key]) => key === id));
  const held = [...new Set(heldIds)]
    .map(id => [id, room.system.effects[id]] as const)
    .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => Boolean(entry[1]));

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
              {items.map(item => {
                const details = itemDetails(item);
                const entry = owned(item.id);
                return (
                  <div key={item.id}>
                    <Chip
                      active={Boolean(entry) && !entry?.off}
                      onClick={() => toggle('has', item.id, !entry)}
                    >
                      {item.label ?? item.id}
                    </Chip>
                    {entry ? (
                      <Chip onClick={() => toggle('has', item.id, true, !entry.off)}>
                        {entry.off ? 'в сумке' : 'надето'}
                      </Chip>
                    ) : null}
                    {details.length ? <div className="faint">{details.join(' · ')}</div> : null}
                  </div>
                );
              })}
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

      <Fold title="Висящие эффекты" count={(sheet.effects ?? []).length}>
        {held.length ? (
          <div className="stack stack--tight">
            <span className="field__label">Держится этим листом</span>
            <div className="inline inline--tight">
              {held.map(([id, effect]) => (
                <Chip
                  key={id}
                  active
                  title="снять — связанное спадёт со всех"
                  onClick={() => toggle('effects', id, false)}
                >
                  {effect.label ?? id}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

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
                    {effect.label ?? id}
                    {entry?.usesLeft ? ` · ${entry.usesLeft}` : ''}
                  </Chip>
                );
              })}
            </div>
          )}
      </Fold>

    </>
  );
}
