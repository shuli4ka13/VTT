import { expectAction } from '@vtt/engine/events/trial';
import { mayAnswer, mayTurn } from '../../engine/rights.ts';
import { useState } from 'react';
import { Link } from 'react-router';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { ActionForm } from './action-form.tsx';
import { Columns } from '../../ui/layout.tsx';
import { Card, CardHead, Button, Empty, Verdict, Chip, Fold, DangerButton } from '../../ui/primitives.tsx';
import { Lobby } from './lobby.tsx';
import { useSession } from '../../store/session.ts';
import type { RoomState, Sheet, System } from '@vtt/schema';
import { availableActions } from '@vtt/engine/events/actions';
import { heardMoments } from '@vtt/engine/events/moments';
import { isDesk } from '@vtt/engine/engine/owners';
import { fieldsFor } from '@vtt/engine/engine/calc';
import { useReader } from '../../engine/use-calc.ts';
import { FieldCell } from '../../sheet/field-cell.tsx';
import './table.css';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

export function TableScreen() {
  const room = useRoom(s => s.room);
  return room ? <RoomTable key={room.id} room={room} /> : <Lobby />;
}

function RoomTable({ room }: { room: RoomState }) {
  const log = useRoom(s => s.log);
  const error = useRoom(s => s.error);
  const setError = useRoom(s => s.setError);
  const leave = useRoom(s => s.leave);

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string[]>([]);

  const [pinned, setPinned] = useState('');

  const sender = room.sheets.find(s => s.id === from) ?? null;
  const targets = room.sheets.filter(s => to.includes(s.id));
  const people = room.sheets.filter(s => !isDesk(s));
  const party = new Set(room.members.map(member => member.sheetId).filter((id): id is string => Boolean(id)));
  const desk = room.sheets.find(isDesk) ?? null;
  const deskFields = fieldsOf(room.system).filter(f => f.lives === 'desk');

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
                ? <span className="faint">Здесь появится всё, что происходит за столом.</span>
                : (
                  <div className="log">
                    {log.slice(-80).map(entry => (
                      <div key={entry.id} className="log-line">
                        <span className="log-line__at">{timeOf(entry.at)}</span>
                        <span>{entry.hidden ? <span title="видно только ведущему" aria-label="втайне">🔒 </span> : null}{entry.text}</span>
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
                      {fieldsOf(room.system)
                        .filter(f => f.lives !== 'desk' && f.value.kind === 'stored' && f.value.type === 'number')
                        .map(f => <option key={f.tag} value={f.tag}>{f.label}</option>)}
                    </select>
                  </>
                }
              />
              {people.length ? null : (
                <Empty title="За столом пока никого" action={<Link className="btn btn--sm" to="/play/sheet">Завести лист</Link>} />
              )}
              <div className="tokens">
                {people.map(sheet => (
                  <button
                    key={sheet.id}
                    type="button"
                    className={`token ${party.size ? (party.has(sheet.id) ? 'token--ally' : 'token--foe') : ''} ${sheet.id === from ? 'token--from' : ''} ${to.includes(sheet.id) ? 'token--to' : ''}`}
                    title={sheet.id === from ? 'действует' : to.includes(sheet.id) ? 'цель — клик снимает' : 'клик: цель; если никто не действует — станет действующим'}
                    onClick={() => {
                      if (sheet.id === from) { setFrom(null); return; }
                      if (!from) { setFrom(sheet.id); setTo(ids => ids.filter(id => id !== sheet.id)); return; }
                      setTo(ids => (ids.includes(sheet.id) ? ids.filter(id => id !== sheet.id) : [...ids, sheet.id]));
                    }}
                  >
                    <span className="token__face" aria-hidden="true">
                      {initialsOf(sheet.name ?? sheet.id)}
                      {to.includes(sheet.id) ? <span className="token__aim">◎</span> : null}
                    </span>
                    <span className="token__name">{sheet.name ?? sheet.id}</span>
                    {pinned ? <span className="token__hp num">{String(sheet.values[pinned] ?? '—')}</span> : null}
                  </button>
                ))}
              </div>
            </Card>

            {desk && deskFields.length ? <DeskPanel room={room} desk={desk} /> : null}

            {people.length ? <Combat room={room} onError={setError} /> : null}
            {room.pending ? <Prompt room={room} onError={setError} /> : null}
            {people.length ? <Actions
              key={`${sender?.id ?? ''}|${targets.map(sheet => sheet.id).join(',')}`}
              room={room}
              sender={sender}
              targets={targets}
              onError={setError}
              onClear={() => { setFrom(null); setTo([]); }}
              onSelf={() => { if (sender) setTo(ids => (ids.includes(sender.id) ? ids : [...ids, sender.id])); }}
            /> : null}
          </>
        ),
      }}
    />
  );
}

function DeskPanel({ room, desk }: { room: RoomState; desk: Sheet }) {
  const userId = useSession(s => s.userId);
  const gm = room.members.some(m => m.userId === userId && m.role === 'gm');
  const system = room.system as System;
  const reader = useReader(system, desk, room.compendium, null, 'desk');
  return (
    <Card>
      <CardHead title="Стол" actions={<span className="faint">{gm ? 'общий для всех — правите вы' : 'общий для всех — правит ведущий'}</span>} />
      <div className="row">
        {fieldsFor(system, 'desk').map(field => (
          <FieldCell
            key={field.tag} field={field} system={system} sheet={desk} reader={reader}
            onChange={gm ? (tag, value) => tableSocket.setValue(room.id, desk.id, tag, value) : undefined}
          />
        ))}
      </div>
    </Card>
  );
}

function Combat({ room, onError }: { room: RoomState; onError: (message: string | null) => void }) {
  const userId = useSession(s => s.userId);
  const clock = room.clock;
  const nameOf = (id: string) => room.sheets.find(s => s.id === id)?.name ?? id;
  const send = (op: 'start' | 'next' | 'stop' | 'scene' | 'short-rest' | 'long-rest') => {
    onError(null);
    tableSocket.turn({ roomId: room.id, op });
  };
  const fighting = Boolean(clock && clock.round > 0 && clock.active);
  const waiting = Boolean(room.pending);
  const why = waiting ? 'стол ждёт ответа на вопрос ниже' : undefined;
  const heard = heardMoments(room.system);
  const rest = heard.has('long-rest') || heard.has('short-rest');
  const may = (turn: 'start' | 'stop' | 'scene' | 'short-rest' | 'long-rest') => mayTurn(room, userId, turn);

  return (
    <Card>
      <CardHead
        title={fighting ? `Раунд ${clock!.round} · ход: ${nameOf(String(clock!.active))}` : 'Бой не идёт'}
        actions={
          <>
            {fighting
              ? <>
                  {mayTurn(room, userId, 'next')
                    ? <Button size="sm" variant="primary" disabled={waiting} title={why} onClick={() => send('next')}>Следующий ход</Button>
                    : null}
                  {may('stop') ? <Button size="sm" disabled={waiting} title={why} onClick={() => send('stop')}>Конец боя</Button> : null}
                </>
              : may('start') ? <Button size="sm" variant="primary" disabled={waiting} title={why} onClick={() => send('start')}>{room.system.initiative ? 'Инициатива' : 'Начать бой'}</Button> : null}
            {fighting || !rest ? null : (
              <>
                {heard.has('short-rest') && may('short-rest')
                  ? <Button size="sm" variant="ghost" disabled={waiting} title={why} onClick={() => send('short-rest')}>Короткий отдых</Button>
                  : null}
                {may('long-rest') ? <Button size="sm" variant="ghost" disabled={waiting} title={why} onClick={() => send('long-rest')}>Долгий отдых</Button> : null}
              </>
            )}
            {may('scene') ? <Button size="sm" variant="ghost" disabled={waiting} title={why} onClick={() => send('scene')}>Закрыть сцену</Button> : null}
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
        </>
      ) : null}
    </Card>
  );
}

export { mayAnswer };

function Prompt({ room, onError }: { room: RoomState; onError: (message: string | null) => void }) {
  const pending = room.pending!;
  const userId = useSession(s => s.userId);
  const may = mayAnswer(room, userId, pending.sheetId);
  const gm = room.members.some(m => m.userId === userId && m.role === 'gm');
  const why = may ? undefined : 'отвечает владелец листа или ведущий';
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
        <Button size="sm" variant="primary" disabled={!chosen.length || !may} title={why} onClick={() => reply(chosen)}>Применить</Button>
        <Button size="sm" disabled={!may} title={why} onClick={() => reply([])}>Пропустить</Button>
        {gm ? (
          <DangerButton size="sm" onConfirm={() => { onError(null); tableSocket.cancel({ roomId: room.id, pendingId: pending.id }); }}>
            Отменить действие
          </DangerButton>
        ) : null}
        {may ? null : <span className="faint">{why}</span>}
      </div>
    </Card>
  );
}

function claimsOf(actorId: string, targets: Sheet[], mine: string[], theirs: string[]): { claims?: Record<string, string[]> } {
  const claims: Record<string, string[]> = {};
  if (mine.length) claims[actorId] = [...mine];
  if (theirs.length) for (const sheet of targets) claims[sheet.id] = [...new Set([...(claims[sheet.id] ?? []), ...theirs])];
  return Object.keys(claims).length ? { claims } : {};
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

function Actions({ room, sender, targets, onError, onClear, onSelf }: {
  room: RoomState;
  sender: Sheet | null;
  targets: Sheet[];
  onClear: () => void;
  onSelf: () => void;
  onError: (message: string | null) => void;
}) {
  const [mine, setMine] = useState<string[]>([]);
  const [theirs, setTheirs] = useState<string[]>([]);
  const myId = useSession(s => s.userId);
  const leading = room.members.some(m => m.userId === myId && m.role === 'gm');
  const secret = useRoom(s => s.secret) && leading;
  const setSecret = useRoom(s => s.setSecret);
  const edits = Object.entries(room.system.roll_edits ?? {});
  const flip = (list: string[], key: string) =>
    (list.includes(key) ? list.filter(k => k !== key) : [...list, key]);

  if (!sender) {
    return <Empty title="Кто действует?" hint="Кликните фишку — этот лист и будет действовать." />;
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
          : <span className="faint">без целей — выберите цель, можно несколько</span>}
        actions={<>
          {targets.some(sheet => sheet.id === sender.id) ? null : <Button size="sm" variant="ghost" onClick={onSelf}>на себя</Button>}
          <Button size="sm" variant="ghost" onClick={onClear}>сбросить выбор</Button>
        </>}
      />
      {edits.length && available.length ? (
        <Fold
          title="Правки броска"
          summary={[...mine, ...theirs].length
            ? [...mine.map(k => `${sender.name}: ${edits.find(([key]) => key === k)?.[1].label ?? k}`),
              ...theirs.map(k => `цели: ${edits.find(([key]) => key === k)?.[1].label ?? k}`)].join(', ')
            : 'ничего не заявлено'}
        >
          <div className="stack stack--tight">
            <ClaimRow label={`броски ${sender.name}`} edits={edits} picked={mine} onToggle={key => setMine(flip(mine, key))} />
            {targets.length ? <ClaimRow label="броски целей" edits={edits} picked={theirs} onToggle={key => setTheirs(flip(theirs, key))} /> : null}
          </div>
        </Fold>
      ) : null}
      {leading ? (
        <div className="inline inline--tight">
          <Chip active={secret} onClick={() => setSecret(!secret)}>🔒 втайне</Chip>
          <span className="faint">{secret ? 'броски и действия видите только вы, игрокам — «Ведущий бросает втайне»' : 'броски видят все'}</span>
        </div>
      ) : null}
      {available.length === 0
        ? <span className="faint">
            У этого листа нет применимых действий — наденьте предмет или выучите приём на листе персонажа.
          </span>
        : (
          <div className="inline inline--tight actions">
            {available.map(action => (
              <ActionForm
                key={action.id}
                system={room.system as System}
                compendium={room.compendium}
                actor={sender}
                actionId={action.id}
                label={action.label}
                disabled={Boolean(room.pending)}
                expect={request => {
                  if (!sender) return null;
                  const chosen = targets.map(sheet => sheet.id);
                  const found = expectAction(
                    { system: room.system as never, compendium: room.compendium as never, clock: room.clock ?? null },
                    room.sheets as never,
                    {
                      actionId: request.actionId, fromId: sender.id, toIds: chosen,
                      ...(request.inputs ? { inputs: request.inputs } : {}),
                      ...claimsOf(sender.id, targets, mine, theirs),
                    });
                  return found.trouble ? `не выйдет: ${found.trouble}` : found.lines.join('\n');
                }}
                onAct={request => {
                  onError(null);
                  tableSocket.act({
                    roomId: room.id, actionId: request.actionId,
                    fromId: sender.id, toIds: targets.map(sheet => sheet.id),
                    ...(request.inputs ? { inputs: request.inputs } : {}),
                    ...claimsOf(sender.id, targets, mine, theirs),
                    ...(secret ? { hidden: true } : {}),
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

const initialsOf = (name: string): string =>
  name.split(/[\s-]+/u).filter(Boolean).slice(0, 2).map(word => word[0]!.toUpperCase()).join('');
