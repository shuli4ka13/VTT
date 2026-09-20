import { useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { useReader } from '../../engine/use-calc.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { Card, Empty, Fold, Chip, Input, Button } from '../../ui/primitives.tsx';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { Lobby } from './lobby.tsx';
import type { Sheet, System, RoomState } from '@vtt/schema';
import { availableActions } from '@vtt/engine/events/envelope';

export function SheetScreen() {
  const room = useRoom(s => s.room);
  const mySheetId = useRoom(s => s.mySheetId);
  const pickSheet = useRoom(s => s.pickSheet);
  const [newName, setNewName] = useState('');

  if (!room) return <Lobby />;

  const sheet = room.sheets.find(s => s.id === mySheetId) ?? null;

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

  return (
    <SheetView
      system={room.system as System}
      sheet={sheet}
      reader={reader}
      badge={sheet.kind === 'npc' ? 'НПС' : 'игрок'}
      onChange={(tag, value) => tableSocket.setValue(room.id, sheet.id, tag, value)}
      onRoll={tag => tableSocket.rollField(room.id, sheet.id, tag)}
    />
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

  const equipped = new Set(sheet.equipped ?? []);
  const known = new Set(sheet.actions ?? []);
  const wornOf = (id: string) => (sheet.effects ?? []).find(e => e.effectId === id);

  const toggle = (list: 'equipped' | 'actions' | 'effects', id: string, on: boolean) =>
    tableSocket.setBelonging(room.id, sheet.id, list, id, on);

  const items = room.compendium.items ?? [];
  const actions = room.compendium.actions ?? [];
  const itemDetails = (item: (typeof items)[number]): string[] => {
    const kind = room.system.records?.[String(item.rk)];
    return (kind?.props ?? [])
      .filter(prop => item.props?.[prop.key] !== undefined && item.props[prop.key] !== '')
      .map(prop => {
        const value = String(item.props?.[prop.key]);
        const shown = String(prop.kind) === 'dice' ? value.replace(/d/gi, 'к') : value;
        return `${prop.label ?? prop.key}: ${shown}`;
      });
  };

  const hangable = Object.entries(room.system.effects)
    .filter(([, effect]) => (effect.activation ?? 'manual') !== 'manual');

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

      <Fold title="Снаряжение" count={equipped.size}>
        {items.length === 0
          ? <span className="faint">В компендиуме мира нет предметов.</span>
          : (
            <div className="stack stack--tight">
              {items.map(item => {
                const details = itemDetails(item);
                return (
                  <div key={item.id}>
                    <Chip
                      active={equipped.has(item.id)}
                      onClick={() => toggle('equipped', item.id, !equipped.has(item.id))}
                    >
                      {item.label ?? item.id}
                    </Chip>
                    {details.length ? <div className="faint">{details.join(' · ')}</div> : null}
                  </div>
                );
              })}
            </div>
          )}
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
                    {effect.label ?? id}
                    {entry?.usesLeft ? ` · ${entry.usesLeft}` : ''}
                  </Chip>
                );
              })}
            </div>
          )}
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
