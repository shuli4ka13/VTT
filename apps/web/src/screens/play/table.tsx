// Стол. Фишка выбирает, ЧЕЙ лист с чьим, — дальше летит конверт.
//
// Стол сам ничего не считает и не правит. Он отправляет намерение; исход
// считает сервер своим движком и своей костью, а сюда приходит дельта.
//
// Карта пока сетка, а не канвас: PixiJS въедет вместе с сетками, туманом
// и слоями. Место подготовлено — карта отделена от панелей и не
// перерисовывается от чужой печати в журнале.

import { useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { Columns } from '../../ui/layout.tsx';
import { Card, CardHead, Button, Empty, Verdict, Chip } from '../../ui/primitives.tsx';
import { Lobby } from './lobby.tsx';
import type { RoomState, Sheet } from '@vtt/schema';
import { availableActions } from '@vtt/engine/events/envelope';
import './table.css';

export function TableScreen() {
  const room = useRoom(s => s.room);
  const log = useRoom(s => s.log);
  const error = useRoom(s => s.error);
  const setError = useRoom(s => s.setError);
  const leave = useRoom(s => s.leave);

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  // Что показывать на фишке — ВЫБОР ведущего, а не догадка стола: угадывать
  // поле по имени тега значило бы, что интерфейс знает имена статов.
  const [pinned, setPinned] = useState('');

  if (!room) return <Lobby />;

  const sender = room.sheets.find(s => s.id === from) ?? null;
  const target = room.sheets.find(s => s.id === to) ?? null;

  return (
    <Columns
      left={{
        head: room.title,
        tools: <Button size="sm" variant="ghost" onClick={leave}>выйти</Button>,
        body: (
          <>
            <div className="stack stack--tight">
              <span className="field__label">За столом</span>
              <div className="inline inline--tight">
                {room.members.map(member => <Chip key={member.userId}>{member.name}</Chip>)}
              </div>
            </div>

            <div className="stack stack--tight">
              <span className="field__label">Журнал</span>
              {log.length === 0
                ? <span className="faint">Броски и события появятся здесь.</span>
                : log.slice(-40).map(entry => (
                  <div key={entry.id} className="log-line">{entry.text}</div>
                ))}
            </div>
          </>
        ),
      }}
      main={{
        body: (
          <>
            {error ? <Verdict tone="bad">{error}</Verdict> : null}

            <Card>
              <CardHead
                title="Фишки"
                actions={
                  <>
                    <span className="faint">показывать:</span>
                    <select
                      className="select"
                      style={{ width: 190 }}
                      value={pinned}
                      onChange={e => setPinned(e.target.value)}
                    >
                      <option value="">— ничего —</option>
                      {room.system.fields
                        .filter(f => f.value.kind === 'stored' && f.value.type === 'number')
                        .map(f => <option key={f.tag} value={f.tag}>{f.label}</option>)}
                    </select>
                  </>
                }
              />
              <div className="tokens">
                {room.sheets.map(sheet => (
                  <button
                    key={sheet.id}
                    type="button"
                    className={`token ${sheet.id === from ? 'token--from' : ''} ${sheet.id === to ? 'token--to' : ''}`}
                    onClick={() => {
                      if (!from || (from && to)) { setFrom(sheet.id); setTo(null); }
                      else setTo(sheet.id);
                    }}
                  >
                    <span className="token__name">{sheet.name ?? sheet.id}</span>
                    {pinned ? <span className="token__hp num">{String(sheet.values[pinned] ?? '—')}</span> : null}
                  </button>
                ))}
              </div>
            </Card>

            <Actions room={room} sender={sender} target={target} onError={setError} />
          </>
        ),
      }}
    />
  );
}

function Actions({ room, sender, target, onError }: {
  room: RoomState;
  sender: Sheet | null;
  target: Sheet | null;
  onError: (message: string | null) => void;
}) {
  if (!sender) {
    return <Empty title="Кто действует?" hint="Кликните фишку — она станет отправителем." />;
  }

  // Список действий выводит ДВИЖОК из надетого и выученного: стол не знает,
  // что такое «атака», и знать не должен.
  let available: { id: string; label: string }[] = [];
  try {
    available = availableActions(sender, { system: room.system, compendium: room.compendium });
  } catch (err) {
    onError((err as Error).message);
  }

  return (
    <Card>
      <CardHead
        title={`${sender.name} действует`}
        badge={target
          ? <Chip>по {target.name}</Chip>
          : <span className="faint">выберите цель</span>}
      />
      {available.length === 0
        ? <span className="faint">
            У этого листа нет применимых действий — наденьте предмет или выучите приём на листе персонажа.
          </span>
        : (
          <div className="inline inline--tight">
            {available.map(action => (
              <Button
                key={action.id}
                variant="primary"
                disabled={!target}
                onClick={() => {
                  onError(null);
                  tableSocket.act({
                    roomId: room.id, actionId: action.id,
                    fromId: sender.id, toId: target!.id,
                  });
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
    </Card>
  );
}
