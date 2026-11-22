import { expectAction, costRefusal, availableActions, isDesk, isGroup, fieldsFor, sheetKinds, distanceOf, distanceWords, fieldsOf, claimWords, baseValue } from '@vtt/engine';
import { mayAnswer, mayAllowItems } from '../../engine/rights.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { ActionForm } from './action-form.tsx';
import type { ActionRequest } from './action-form.tsx';
import { Columns, Tabs } from '../../ui/layout.tsx';
import { Card, CardHead, Button, Empty, Verdict, Chip, Fold, DangerButton, Input, Select } from '../../ui/primitives.tsx';
import { Lobby } from './lobby.tsx';
import { useSession } from '../../store/session.ts';
import type { RoomState, Sheet, System } from '@vtt/schema';
import { useReader } from '../../engine/use-calc.ts';
import { FieldCell } from '../../sheet/field-cell.tsx';
import { CombatBar } from './combat.tsx';
import { Journal } from './journal.tsx';
import { Hanging } from './hanging.tsx';
import { QUESTION_ID } from './pending-bar.tsx';
import './table.css';

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
  const [tab, setTab] = useState<'table' | 'log'>('table');
  const [acted, setActed] = useState(false);
  const elsewhere = (message: string | null) => { setActed(false); setError(message); };

  const sender = room.sheets.find(s => s.id === from) ?? null;
  const targets = room.sheets.filter(s => to.includes(s.id));
  const people = room.sheets.filter(s => !isDesk(s));
  const party = new Set(room.members.map(member => member.sheetId).filter((id): id is string => Boolean(id)));
  const desk = room.sheets.find(isDesk) ?? null;
  const deskFields = fieldsOf(room.system).filter(f => f.lives === 'desk');
  const clock = room.clock;
  const turn = clock && clock.round > 0 ? clock.active : null;
  const grid = room.system.grid ?? null;
  const [moving, setMoving] = useState(false);
  const pieces = people.filter(sheet => !isGroup(sheet, room.sheets));
  const off = grid ? people.filter(sheet => !room.places?.[sheet.id]) : people;
  const pick: Pick = {
    from, to, turn, party,
    onPick: id => {
      if (id === from) { setFrom(null); setMoving(false); return; }
      if (!from) { setFrom(id); setTo(ids => ids.filter(one => one !== id)); return; }
      setTo(ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id]));
    },
  };

  return (
    <div className={`at-table at-table--${tab}`}>
      <div className="at-table__tabs">
        <Tabs value={tab} options={[{ key: 'table', label: 'Стол' }, { key: 'log', label: `Журнал${log.length ? ` · ${log.length}` : ''}` }]} onChange={setTab} />
      </div>
      <Columns
        left={{
          head: room.title,
          tools: <Button size="sm" variant="ghost" onClick={leave}>выйти</Button>,
          body: (
            <div className="stack stack--tight">
              <span className="faint">За столом</span>
              <div className="inline inline--tight">
                {room.members.map(member => <Chip key={member.userId}>{member.name}</Chip>)}
              </div>
              <ItemRights room={room} />
            </div>
          ),
        }}
        main={{
          body: (
            <>
              {error && !(acted && sender) ? <Verdict tone="bad">{error}</Verdict> : null}

              <CombatBar room={room} onError={elsewhere} />
              {room.pending ? <div id={QUESTION_ID}><Prompt room={room} onError={elsewhere} /></div> : null}

              <Card>
                <CardHead
                  title="Фишки"
                  actions={
                    <>
                      <span className="faint">показывать:</span>
                      <select
                        className="select tokens__pin"
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
                {people.length ? null : <Empty title="За столом пока никого" hint="Заведите первый лист ниже." />}
                {grid ? (
                  <Field
                    room={room}
                    people={pieces}
                    pick={pick}
                    pinned={pinned}
                    sender={sender && !isGroup(sender, room.sheets) ? sender : null}
                    targets={targets}
                    moving={moving}
                    setMoving={setMoving}
                  />
                ) : null}
                <div
                  className={`tokens ${grid ? 'tokens--off' : ''}`}
                  onDragOver={grid ? (e => e.preventDefault()) : undefined}
                  onDrop={grid ? (e => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain');
                    if (id && room.places?.[id]) tableSocket.placePiece(room.id, id, null);
                  }) : undefined}
                >
                  {grid ? <span className="faint tokens__label">не на поле — перетащите на клетку; сюда — убрать с поля</span> : null}
                  {(grid ? off : people).map(sheet => <Piece key={sheet.id} sheet={sheet} room={room} pick={pick} pinned={pinned} fixed={!grid || isGroup(sheet, room.sheets)} />)}
                </div>
                <NewSheet room={room} />
              </Card>

              {desk && deskFields.length ? <DeskPanel room={room} desk={desk} /> : null}

              {people.length ? <Actions
                key={`${sender?.id ?? ''}|${targets.map(sheet => sheet.id).join(',')}`}
                room={room}
                sender={sender}
                targets={targets}
                places={room.places}
                refused={acted ? error : null}
                onError={message => { setActed(true); setError(message); }}
                onClear={() => { setFrom(null); setTo([]); setMoving(false); }}
                onSelf={() => { if (sender) setTo(ids => (ids.includes(sender.id) ? ids : [...ids, sender.id])); }}
              /> : null}
            </>
          ),
        }}
        right={{ head: 'Журнал', pinned: true, body: <Journal key={tab} log={log} /> }}
      />
    </div>
  );
}

interface Pick {
  from: string | null;
  to: string[];
  turn: string | null;
  party: Set<string>;
  onPick: (id: string) => void;
}

function Piece({ sheet, room, pick, pinned, field, fixed }: {
  sheet: Sheet; room: RoomState; pick: Pick; pinned: string; field?: boolean; fixed?: boolean;
}) {
  const { from, to, turn, party } = pick;
  const name = sheet.name ?? sheet.id;
  const shown = useMemo(() => {
    if (field || !pinned) return undefined;
    try { return baseValue(room.system, room.compendium, room.sheets, sheet.id, pinned); } catch { return undefined; }
  }, [field, pinned, room.system, room.compendium, room.sheets, sheet.id]);
  return (
    <button
      type="button"
      draggable={!fixed}
      onDragStart={fixed ? undefined : e => { e.dataTransfer.setData('text/plain', sheet.id); e.dataTransfer.effectAllowed = 'move'; }}
      className={`token ${field ? 'token--field' : ''} ${party.size ? (party.has(sheet.id) ? 'token--ally' : 'token--foe') : ''} ${sheet.id === from ? 'token--from' : ''} ${to.includes(sheet.id) ? 'token--to' : ''} ${sheet.id === turn ? 'token--turn' : ''}`}
      title={field
        ? `${name}${sheet.id === turn ? ' — ходит' : ''}`
        : sheet.id === from ? 'действует' : to.includes(sheet.id) ? 'цель — клик снимает' : 'клик: цель; если никто не действует — станет действующим'}
      onClick={() => pick.onPick(sheet.id)}
    >
      <span className="token__face" aria-hidden="true">
        {initialsOf(name)}
        {to.includes(sheet.id) ? <span className="token__aim">◎</span> : null}
      </span>
      {field ? null : <span className="token__name">{name}</span>}
      {field ? null : sheet.id === turn ? <span className="token__turn">ходит</span> : null}
      {field || !pinned ? null : <span className="token__hp num">{String(shown ?? '—')}</span>}
      {field ? null : <Hanging room={room} sheet={sheet} compact />}
    </button>
  );
}

const FIELD_COLS = 20;
const FIELD_ROWS = 12;

function Field({ room, people, pick, pinned, sender, targets, moving, setMoving }: {
  room: RoomState;
  people: Sheet[];
  pick: Pick;
  pinned: string;
  sender: Sheet | null;
  targets: Sheet[];
  moving: boolean;
  setMoving: (on: boolean) => void;
}) {
  const system = room.system as System;
  const places = room.places ?? {};
  const standing = people.filter(sheet => places[sheet.id]);
  const cols = Math.max(FIELD_COLS, ...standing.map(sheet => places[sheet.id]!.x + 1));
  const rows = Math.max(FIELD_ROWS, ...standing.map(sheet => places[sheet.id]!.y + 1));
  const at = new Map(standing.map(sheet => [`${places[sheet.id]!.x},${places[sheet.id]!.y}`, sheet]));
  const put = (id: string, x: number, y: number) => {
    tableSocket.placePiece(room.id, id, { x, y });
    setMoving(false);
  };
  const aims = sender && places[sender.id]
    ? targets.filter(sheet => sheet.id !== sender.id).flatMap(sheet => {
      const distance = distanceOf(system, places, sender.id, sheet.id);
      return distance === null ? [] : [`${sheet.name}: до ${sender.name} — ${distanceWords(system, distance)}`];
    })
    : [];
  return (
    <div className="stack stack--tight">
      {sender ? (
        <div className="inline inline--tight">
          <Button size="sm" variant={moving ? 'primary' : 'ghost'} onClick={() => setMoving(!moving)}>
            {moving ? `Куда ставим ${sender.name}? Щёлкните клетку` : `Переставить ${sender.name}`}
          </Button>
          {places[sender.id] ? <Button size="sm" variant="ghost" onClick={() => { tableSocket.placePiece(room.id, sender.id, null); setMoving(false); }}>Убрать с поля</Button> : null}
        </div>
      ) : null}
      <div className="field-board" aria-label="Поле">
        <div className="field-board__grid" style={{ gridTemplateColumns: `repeat(${cols}, 40px)`, gridTemplateRows: `repeat(${rows}, 40px)` }}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const x = i % cols;
            const y = Math.floor(i / cols);
            const here = at.get(`${x},${y}`);
            return (
              <div
                key={i}
                className={`field-cell ${moving && !here ? 'field-cell--free' : ''}`}
                data-x={x}
                data-y={y}
                onClick={() => { if (moving && !here && pick.from) put(pick.from, x, y); }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) put(id, x, y);
                }}
              >
                {here ? <Piece sheet={here} room={room} pick={pick} pinned={pinned} field /> : null}
              </div>
            );
          })}
        </div>
      </div>
      {aims.map(line => <span key={line} className="faint">{line}</span>)}
    </div>
  );
}

function NewSheet({ room }: { room: RoomState }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const kinds = sheetKinds(room.system as System);
  const [of, setOf] = useState(kinds[0]?.[0] ?? '');
  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    tableSocket.createSheet(room.id, trimmed, of || undefined);
    setName('');
  };
  if (!open) return <div><Button size="sm" variant="ghost" onClick={() => setOpen(true)}>+ лист</Button></div>;
  return (
    <div className="new-sheet">
      <Input value={name} onChange={setName} placeholder="имя" autoFocus
        onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setOpen(false); }} />
      {kinds.length ? (
        <Select
          value={of}
          label="тип листа"
          options={[['', '— без типа —'], ...kinds.map(([key, kind]) => [key, kind.label ?? key] as const)] as never}
          onChange={setOf}
        />
      ) : null}
      <Button size="sm" variant="primary" disabled={!name.trim()} onClick={create}>Завести</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>готово</Button>
    </div>
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
            onShift={gm ? (tag, by) => tableSocket.shiftValue(room.id, desk.id, tag, by) : undefined}
          />
        ))}
      </div>
    </Card>
  );
}

export { mayAnswer };

function Prompt({ room, onError }: { room: RoomState; onError: (message: string | null) => void }) {
  const pending = room.pending!;
  const userId = useSession(s => s.userId);
  const gm = room.members.some(m => m.userId === userId && m.role === 'gm');
  const may = mayAnswer(room, userId, pending.sheetId);
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
      {pending.one ? (
        <div className="inline inline--tight">
          {pending.options.map(option => (
            <Button key={option.id} size="sm" variant="primary" disabled={!may} title={why} onClick={() => reply([option.id])}>{option.label}</Button>
          ))}
          {gm ? (
            <DangerButton size="sm" onConfirm={() => { onError(null); tableSocket.cancel({ roomId: room.id, pendingId: pending.id }); }}>
              Отменить действие
            </DangerButton>
          ) : null}
          {may ? null : <span className="faint">{why}</span>}
        </div>
      ) : (
      <>
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
      </>
      )}
    </Card>
  );
}

function claimsOf(actorId: string, targets: Sheet[], mine: string[], theirs: string[]): { claims?: Record<string, string[]> } {
  const claims: Record<string, string[]> = {};
  if (mine.length) claims[actorId] = [...mine];
  if (theirs.length) for (const sheet of targets) claims[sheet.id] = [...new Set([...(claims[sheet.id] ?? []), ...theirs])];
  return Object.keys(claims).length ? { claims } : {};
}

const actionsOf = (room: RoomState, sender: Sheet): { id: string; label: string }[] => {
  try { return availableActions(sender, { system: room.system, compendium: room.compendium }); } catch { return []; }
};

const unpaidWhy = (room: RoomState, fromId: string, toIds: string[], actionId: string, inputs?: ActionRequest['inputs']): string | null => costRefusal(
  { system: room.system as System, compendium: room.compendium, clock: room.clock ?? null }, room.sheets,
  { actionId, fromId, toIds, ...(inputs ? { inputs } : {}) });

function ClaimRow({ label, words, picked, onToggle }: {
  label: string;
  words: [string, string][];
  picked: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="inline inline--tight">
      <span className="faint">{label}:</span>
      {words.map(([key, word]) => (
        <Chip key={key} active={picked.includes(key)} onClick={() => onToggle(key)}>
          {word}
        </Chip>
      ))}
    </div>
  );
}

function Actions({ room, sender, targets, places, refused, onError, onClear, onSelf }: {
  room: RoomState;
  places?: RoomState['places'];
  sender: Sheet | null;
  targets: Sheet[];
  refused: string | null;
  onClear: () => void;
  onSelf: () => void;
  onError: (message: string | null) => void;
}) {
  const [mine, setMine] = useState<string[]>([]);
  const [theirs, setTheirs] = useState<string[]>([]);
  const said = useRef<HTMLDivElement>(null);
  useEffect(() => { if (refused) said.current?.scrollIntoView?.({ block: 'nearest' }); }, [refused]);
  const aimed = JSON.stringify(targets.map(sheet => sheet.id));
  const unpaid = useMemo(() => {
    const out = new Map<string, string>();
    if (!sender) return out;
    for (const action of actionsOf(room, sender)) {
      const why = unpaidWhy(room, sender.id, JSON.parse(aimed) as string[], action.id);
      if (why) out.set(action.id, why);
    }
    return out;
  }, [room, sender, aimed]);
  const myId = useSession(s => s.userId);
  const leading = room.members.some(m => m.userId === myId && m.role === 'gm');
  const secret = useRoom(s => s.secret) && leading;
  const setSecret = useRoom(s => s.setSecret);
  const claimable = claimWords(room.system as System);
  const wordOf = (key: string) => claimable.find(([one]) => one === key)?.[1] ?? key;
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

  const ready = available.filter(action => !unpaid.has(action.id));
  const reasons = [...new Set(available.flatMap(action => unpaid.get(action.id) ?? []))];
  const form = (action: { id: string; label: string }) => (
    <ActionForm
      key={action.id}
      system={room.system as System}
      compendium={room.compendium}
      actor={sender}
      targets={targets}
      places={places}
      actionId={action.id}
      label={action.label}
      disabled={Boolean(room.pending)}
      blocked={unpaid.get(action.id) ?? null}
      refuse={request => unpaidWhy(room, sender.id, targets.map(sheet => sheet.id), request.actionId, request.inputs)}
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
  );

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
      {claimable.length && available.length ? (
        <Fold
          title="Правки броска"
          summary={[...mine, ...theirs].length
            ? [...mine.map(k => `${sender.name}: ${wordOf(k)}`), ...theirs.map(k => `цели: ${wordOf(k)}`)].join(', ')
            : 'ничего не заявлено'}
        >
          <div className="stack stack--tight">
            <ClaimRow label={`броски ${sender.name}`} words={claimable} picked={mine} onToggle={key => setMine(flip(mine, key))} />
            {targets.length ? <ClaimRow label="броски целей" words={claimable} picked={theirs} onToggle={key => setTheirs(flip(theirs, key))} /> : null}
          </div>
        </Fold>
      ) : null}
      {leading ? (
        <div className="inline inline--tight">
          <Chip active={secret} onClick={() => setSecret(!secret)}>🔒 втайне</Chip>
          <span className="faint">{secret ? 'броски и действия видите только вы, игрокам — «Ведущий бросает втайне»' : 'броски видят все'}</span>
        </div>
      ) : null}
      {refused ? <div ref={said}><Verdict tone="bad">{refused}</Verdict></div> : null}
      {available.length === 0
        ? <span className="faint">
            У этого листа нет применимых действий — наденьте предмет или выучите приём на листе персонажа.
          </span>
        : (
          <>
            {ready.length ? <div className="inline inline--tight actions">{ready.map(form)}</div> : null}
            {reasons.map(reason => (
              <div key={reason} className="actions-off">
                <span className="faint">{reason}</span>
                <div className="inline inline--tight actions">{available.filter(action => unpaid.get(action.id) === reason).map(form)}</div>
              </div>
            ))}
          </>
        )}
    </Card>
  );
}

const initialsOf = (name: string): string =>
  name.split(/[\s-]+/u).filter(Boolean).slice(0, 2).map(word => word[0]!.toUpperCase()).join('');

function ItemRights({ room }: { room: RoomState }) {
  const myId = useSession(s => s.userId);
  const players = room.members.filter(member => member.role !== 'gm');
  const allowers = players.filter(member => mayAllowItems(room, myId, member.userId));
  if (allowers.length) {
    return (
      <div className="inline inline--tight">
        <span className="faint">вещи меняют: ведущий</span>
        {players.map(member => (
          <Chip
            key={member.userId}
            active={Boolean(member.editsItems)}
            title="разрешить или запретить менять значения вещей"
            onClick={() => tableSocket.allowItems(room.id, member.userId, !member.editsItems)}
          >
            {member.name}
          </Chip>
        ))}
      </div>
    );
  }
  const names = ['ведущий', ...players.filter(member => member.editsItems).map(member => member.name)];
  return <span className="faint">вещи меняют: {names.join(', ')}</span>;
}
