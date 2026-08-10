// Стол. Здесь листы общаются: фишка выбирает, ЧЕЙ лист с ЧЬИМ, а дальше
// летит обычный конверт.
//
// Стол сам ничего не считает и не правит — ни полей, ни правил. Он выбирает
// пару листов и отправляет намерение; считает сервер своим движком и своей
// костью, а сюда приходит дельта.
//
// Карта пока сетка, а не канвас: PixiJS въезжает вместе с сетками, туманом
// и слоями — отдельным заходом. Место для него подготовлено: карта уже
// отделена от панелей и не перерисовывается от чужой печати.

import { useEffect, useState } from 'react';
import { Columns } from '../../ui/layout.tsx';
import { Card, CardHead, Button, Empty, Verdict, Chip, Field, Input } from '../../ui/primitives.tsx';
import { tableSocket } from '../../api/socket.ts';
import { currentToken, listRooms, listWorlds, createRoom, login, setToken } from '../../api/client.ts';
import type { RoomState, Sheet } from '@vtt/schema';
import { availableActions } from '@vtt/engine/events/envelope';
import './table.css';

export function TableScreen() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [log, setLog] = useState<{ id: string; text: string }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  // Один сокет на приложение; экран подписывается и отписывается.
  useEffect(() => {
    tableSocket.connect();
    return tableSocket.on(message => {
      if (message.type === 'room:state') {
        setRoom(message.state);
        setLog(message.state.log);
      }
      if (message.type === 'room:delta') {
        // Дельта: подменяются ТОЛЬКО пришедшие листы, остальные не трогаются.
        setRoom(current => current && {
          ...current,
          sheets: current.sheets.map(sheet =>
            message.delta.sheets.find(next => next.id === sheet.id) ?? sheet),
        });
        setLog(current => [...current, ...message.delta.log]);
      }
      if (message.type === 'room:members') {
        setRoom(current => current && { ...current, members: message.members });
      }
      if (message.type === 'error') setNote(message.message);
    });
  }, []);

  if (!room) {
    return <Lobby onNote={setNote} note={note} />;
  }

  const sender = room.sheets.find(s => s.id === from) ?? null;
  const target = room.sheets.find(s => s.id === to) ?? null;

  return (
    <Columns
      left={{
        head: room.title,
        body: (
          <>
            <div className="stack stack--tight">
              <span className="field__label">В комнате</span>
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
            {note ? <Verdict tone="bad">{note}</Verdict> : null}
            <Card>
              <CardHead
                title="Фишки"
                actions={<span className="faint">кликните: сначала кто, потом по кому</span>}
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
                    <span className="token__hp num">{hpOf(sheet)}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Actions room={room} sender={sender} target={target} onNote={setNote} />
          </>
        ),
      }}
    />
  );
}

function Actions({ room, sender, target, onNote }: {
  room: RoomState;
  sender: Sheet | null;
  target: Sheet | null;
  onNote: (text: string | null) => void;
}) {
  if (!sender) {
    return <Empty title="Выберите, кто действует" hint="Кликните фишку — она станет отправителем." />;
  }

  // Список действий выводится ДВИЖКОМ из надетого и выученного: стол
  // не знает, что такое «атака», и знать не должен.
  let available: { id: string; label: string }[] = [];
  try {
    available = availableActions(sender, { system: room.system, compendium: room.compendium });
  } catch (err) {
    onNote((err as Error).message);
  }

  return (
    <Card>
      <CardHead
        title={`${sender.name} действует`}
        badge={target ? <Chip>по {target.name}</Chip> : <span className="faint">выберите цель</span>}
      />
      {available.length === 0
        ? <span className="faint">У этого листа нет применимых действий — наденьте предмет или выучите приём.</span>
        : (
          <div className="inline inline--tight">
            {available.map(action => (
              <Button
                key={action.id}
                variant="primary"
                disabled={!target}
                onClick={() => {
                  onNote(null);
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

function Lobby({ note, onNote }: { note: string | null; onNote: (text: string | null) => void }) {
  const [name, setName] = useState('');
  const [rooms, setRooms] = useState<{ id: string; title: string }[]>([]);
  const [worlds, setWorlds] = useState<{ id: string; title: string }[]>([]);
  const [signed, setSigned] = useState(Boolean(currentToken()));

  const refresh = async () => {
    try {
      setWorlds(await listWorlds());
      if (currentToken()) setRooms(await listRooms());
    } catch (err) { onNote((err as Error).message); }
  };

  useEffect(() => { void refresh(); }, [signed]);

  return (
    <Columns main={{
      body: (
        <>
          {note ? <Verdict tone="bad">{note}</Verdict> : null}

          {signed ? null : (
            <Card>
              <CardHead title="Войти" />
              <div className="inline">
                <div style={{ width: 200 }}>
                  <Input value={name} onChange={setName} placeholder="ваше имя" />
                </div>
                <Button variant="primary" onClick={async () => {
                  try {
                    const session = await login(name.trim() || 'Гость');
                    setToken(session.token);
                    setSigned(true);
                  } catch (err) { onNote((err as Error).message); }
                }}>Войти</Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHead title="Комнаты" actions={<Button size="sm" onClick={refresh}>Обновить</Button>} />
            {rooms.length === 0
              ? <span className="faint">Комнат нет. Создайте её из опубликованного мира ниже.</span>
              : rooms.map(room => (
                <Button key={room.id} wide onClick={() => {
                  tableSocket.connect();
                  tableSocket.join(room.id, currentToken() ?? '');
                }}>
                  Войти в «{room.title}»
                </Button>
              ))}
          </Card>

          <Card>
            <CardHead title="Опубликованные миры" />
            {worlds.length === 0
              ? <span className="faint">Миров нет: опубликуйте свой из конструктора.</span>
              : worlds.map(world => (
                <div key={world.id} className="inline">
                  <span className="spacer">{world.title}</span>
                  <Button size="sm" disabled={!signed} onClick={async () => {
                    try {
                      const room = await createRoom(world.id, `Стол «${world.title}»`);
                      setRooms(current => [...current, room]);
                    } catch (err) { onNote((err as Error).message); }
                  }}>
                    Создать стол
                  </Button>
                </div>
              ))}
          </Card>
        </>
      ),
    }} />
  );
}

// ── вспомогательное ─────────────────────────────────────────────────────

/** Первое хранимое числовое поле «здоровья» — только для подписи фишки. */
function hpOf(sheet: Sheet): string {
  for (const [tag, value] of Object.entries(sheet.values)) {
    if (typeof value === 'number' && /hp|health|хит/i.test(tag)) return String(value);
  }
  return '';
}
