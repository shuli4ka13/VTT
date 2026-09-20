import { useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { ActionForm } from './action-form.tsx';
import { Columns } from '../../ui/layout.tsx';
import { Card, CardHead, Button, Empty, Verdict, Chip } from '../../ui/primitives.tsx';
import { Lobby } from './lobby.tsx';
import type { RoomState, Sheet, System } from '@vtt/schema';
import { availableActions } from '@vtt/engine/events/envelope';
import './table.css';

export function TableScreen() {
  const room = useRoom(s => s.room);
  const log = useRoom(s => s.log);
  const error = useRoom(s => s.error);
  const setError = useRoom(s => s.setError);
  const leave = useRoom(s => s.leave);

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string[]>([]);

  const [pinned, setPinned] = useState('');

  if (!room) return <Lobby />;

  const sender = room.sheets.find(s => s.id === from) ?? null;
  const targets = room.sheets.filter(s => to.includes(s.id));

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
                : (
                  <div className="log">
                    {log.slice(-80).map(entry => (
                      <div key={entry.id} className="log-line">
                        <span className="log-line__at">{timeOf(entry.at)}</span>
                        <span>{entry.text}</span>
                      </div>
                    ))}
                  </div>
                )}
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
                    className={`token ${sheet.id === from ? 'token--from' : ''} ${to.includes(sheet.id) ? 'token--to' : ''}`}
                    title={sheet.id === from ? 'действует' : to.includes(sheet.id) ? 'цель — клик снимает' : 'клик: цель; без отправителя — станет отправителем'}
                    onClick={() => {
                      if (sheet.id === from) { setFrom(null); return; }
                      if (!from) { setFrom(sheet.id); return; }
                      setTo(ids => (ids.includes(sheet.id) ? ids.filter(id => id !== sheet.id) : [...ids, sheet.id]));
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
            <Actions room={room} sender={sender} targets={targets} onError={setError} />
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
        <>
          <div className="inline inline--tight">
            {clock!.order.map(id => (
              <Chip key={id} active={id === clock!.active}>{nameOf(id)}</Chip>
            ))}
          </div>
          <Budget room={room} sheetId={String(clock!.active)} />
        </>
      ) : null}
    </Card>
  );
}

function Budget({ room, sheetId }: { room: RoomState; sheetId: string }) {
  const types = Object.entries(room.system.action_types ?? {});
  if (!types.length) return null;
  const spent = room.clock?.spent[sheetId] ?? {};

  return (
    <div className="stack stack--tight">
      <span className="field__label">Бюджет хода</span>
      <div className="inline inline--tight">
        {types.map(([key, type]) => {
          const perTurn = type.perTurn ?? 0;
          const used = spent[key] ?? 0;
          const left = perTurn ? Math.max(0, perTurn - used) : null;
          return (
            <Chip key={key} active={left === null ? used === 0 : left > 0}>
              {type.label}: {left === null ? (used ? `потрачено ${used}` : 'без счёта') : `${left} из ${perTurn}`}
            </Chip>
          );
        })}
      </div>
    </div>
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

function Actions({ room, sender, targets, onError }: {
  room: RoomState;
  sender: Sheet | null;
  targets: Sheet[];
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
        badge={targets.length
          ? <span className="inline inline--tight">{targets.map(sheet => <Chip key={sheet.id}>по {sheet.name}</Chip>)}</span>
          : <span className="faint">выберите цель — можно несколько</span>}
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
              <ActionForm
                key={action.id}
                system={room.system as System}
                compendium={room.compendium}
                actionId={action.id}
                label={action.label}
                disabled={!targets.length || Boolean(room.pending)}
                onAct={request => {
                  onError(null);
                  tableSocket.act({
                    roomId: room.id, actionId: request.actionId,
                    fromId: sender.id, toId: targets[0]!.id,
                    ...(targets.length > 1 ? { toIds: targets.map(sheet => sheet.id) } : {}),
                    ...(request.inputs ? { inputs: request.inputs } : {}),
                    ...(mine.length ? { edits: mine } : {}),
                    ...(theirs.length ? { targetEdits: theirs } : {}),
                  });
                  setMine([]);
                  setTheirs([]);
                }}
              />
            ))}
          </div>
        )}
    </Card>
  );
}

const timeOf = (at: string): string => {
  const stamp = new Date(at);
  return Number.isNaN(stamp.getTime())
    ? ''
    : `${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`;
};
