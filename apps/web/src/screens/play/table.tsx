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

            <Combat room={room} onError={setError} />
            {room.pending ? <Prompt room={room} onError={setError} /> : null}
            <Actions room={room} sender={sender} target={target} onError={setError} />
          </>
        ),
      }}
    />
  );
}

function Combat({ room, onError }: { room: RoomState; onError: (message: string | null) => void }) {
  const clock = room.clock;
  const nameOf = (id: string) => room.sheets.find(s => s.id === id)?.name ?? id;
  const send = (op: 'start' | 'next' | 'stop' | 'scene') => {
    onError(null);
    tableSocket.turn({ roomId: room.id, op });
  };
  const fighting = Boolean(clock && clock.round > 0 && clock.active);
  const waiting = Boolean(room.pending);
  const why = waiting ? 'стол ждёт ответа на вопрос ниже' : undefined;

  return (
    <Card>
      <CardHead
        title={fighting ? `Раунд ${clock!.round} · ход: ${nameOf(String(clock!.active))}` : 'Бой не идёт'}
        actions={
          <>
            {fighting
              ? <>
                  <Button size="sm" variant="primary" disabled={waiting} title={why} onClick={() => send('next')}>Следующий ход</Button>
                  <Button size="sm" disabled={waiting} title={why} onClick={() => send('stop')}>Конец боя</Button>
                </>
              : <Button size="sm" variant="primary" disabled={waiting} title={why} onClick={() => send('start')}>Инициатива</Button>}
            <Button size="sm" variant="ghost" disabled={waiting} title={why} onClick={() => send('scene')}>Закрыть сцену</Button>
          </>
        }
      />
      {fighting ? (
        <div className="inline inline--tight">
          {clock!.order.map(id => (
            <Chip key={id} active={id === clock!.active}>{nameOf(id)}</Chip>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function Prompt({ room, onError }: { room: RoomState; onError: (message: string | null) => void }) {
  const pending = room.pending!;
  const [chosen, setChosen] = useState<string[]>([]);
  const reply = (ids: string[]) => {
    onError(null);
    tableSocket.answer({ roomId: room.id, pendingId: pending.id, chosen: ids });
    setChosen([]);
  };
  return (
    <Card>
      <CardHead title={pending.question} />
      {pending.preview.map((line, i) => <div key={i} className="faint">{line}</div>)}
      <div className="inline inline--tight">
        {pending.options.map(option => (
          <Chip
            key={option.id}
            active={chosen.includes(option.id)}
            onClick={() => setChosen(chosen.includes(option.id)
              ? chosen.filter(id => id !== option.id) : [...chosen, option.id])}
          >
            {option.label}
          </Chip>
        ))}
      </div>
      <div className="inline inline--tight">
        <Button size="sm" variant="primary" disabled={!chosen.length} onClick={() => reply(chosen)}>Применить</Button>
        <Button size="sm" onClick={() => reply([])}>Пропустить</Button>
      </div>
    </Card>
  );
}

function ClaimRow({ label, edits, picked, onToggle }: {
  label: string;
  edits: [string, { label?: string }][];
  picked: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="inline inline--tight">
      <span className="faint">{label}:</span>
      {edits.map(([key, edit]) => (
        <Chip key={key} active={picked.includes(key)} onClick={() => onToggle(key)}>
          {edit.label || key}
        </Chip>
      ))}
    </div>
  );
}

function Actions({ room, sender, target, onError }: {
  room: RoomState;
  sender: Sheet | null;
  target: Sheet | null;
  onError: (message: string | null) => void;
}) {
  const [mine, setMine] = useState<string[]>([]);
  const [theirs, setTheirs] = useState<string[]>([]);
  const edits = Object.entries(room.system.roll_edits ?? {});
  const flip = (list: string[], key: string) =>
    (list.includes(key) ? list.filter(k => k !== key) : [...list, key]);

  if (!sender) {
    return <Empty title="Кто действует?" hint="Кликните фишку — она станет отправителем." />;
  }

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
      {edits.length && available.length ? (
        <div className="stack stack--tight">
          <ClaimRow label="мой бросок" edits={edits} picked={mine} onToggle={key => setMine(flip(mine, key))} />
          <ClaimRow label="бросок цели" edits={edits} picked={theirs} onToggle={key => setTheirs(flip(theirs, key))} />
        </div>
      ) : null}
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
                disabled={!target || Boolean(room.pending)}
                onClick={() => {
                  onError(null);
                  tableSocket.act({
                    roomId: room.id, actionId: action.id,
                    fromId: sender.id, toId: target!.id,
                    ...(mine.length ? { edits: mine } : {}),
                    ...(theirs.length ? { targetEdits: theirs } : {}),
                  });
                  setMine([]);
                  setTheirs([]);
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
