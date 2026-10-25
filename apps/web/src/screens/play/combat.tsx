import { useState } from 'react';
import type { RoomState, TurnIntent } from '@vtt/schema';
import { heardMoments } from '@vtt/engine/events/moments';
import { isDesk } from '@vtt/engine/engine/owners';
import { isGroup } from '@vtt/engine/events/desk';
import { tableSocket } from '../../api/socket.ts';
import { mayTurn } from '../../engine/rights.ts';
import { useSession } from '../../store/session.ts';
import { Card, CardHead, Button, Drawer, Segmented, Select, Input } from '../../ui/primitives.tsx';
import { dayTime, UNITS } from './clock-words.ts';

type Op = TurnIntent['op'];

export const fightersOf = (room: RoomState) =>
  room.sheets.filter(sheet => !isDesk(sheet) && !isGroup(sheet, room.sheets));

export function CombatBar({ room, onError }: { room: RoomState; onError: (message: string | null) => void }) {
  const userId = useSession(s => s.userId);
  const clock = room.clock;
  const nameOf = (id: string) => room.sheets.find(s => s.id === id)?.name ?? id;
  const heard = heardMoments(room.system);
  const [dialog, setDialog] = useState<'start' | 'join' | null>(null);
  const [amount, setAmount] = useState('30');
  const [unit, setUnit] = useState<(typeof UNITS)[number][0]>('minutes');

  const send = (op: Op, extra: Partial<TurnIntent> = {}) => {
    onError(null);
    tableSocket.turn({ roomId: room.id, op, ...extra } as TurnIntent);
  };
  const fighting = Boolean(clock && clock.round > 0 && clock.active);
  const waiting = Boolean(room.pending);
  const why = waiting ? 'стол ждёт ответа на вопрос' : undefined;
  const may = (op: Op) => mayTurn(room, userId, op);
  const outside = fightersOf(room).filter(sheet => !clock?.order.includes(sheet.id));
  const seconds = Number(amount) * (UNITS.find(([key]) => key === unit)?.[2] ?? 60);
  const scores = clock?.scores ?? {};

  return (
    <Card className="fight">
      <CardHead
        title={fighting ? <>Раунд {clock!.round} · ходит {nameOf(String(clock!.active))}</> : 'Бой не идёт'}
        actions={<span className="fight__time num" title="игровое время">{dayTime(Number(clock?.sec ?? 0))}</span>}
      />
      {fighting ? (
        <ol className="fight__order" aria-label="порядок ходов">
          {clock!.order.map(id => (
            <li key={id} className={`fight__turn${id === clock!.active ? ' fight__turn--now' : ''}`}>
              <span className="fight__name">{nameOf(id)}</span>
              {id in scores ? <span className="fight__score num" title="инициатива">{scores[id]}</span> : null}
              {may('leave') ? (
                <button
                  type="button" className="fight__out" disabled={waiting}
                  title={`${nameOf(id)} выходит из боя`} aria-label={`${nameOf(id)}: выйти из боя`}
                  onClick={() => send('leave', { who: [id] })}
                >×</button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="fight__tools">
        {fighting ? (
          <>
            {may('next') ? <Button size="sm" variant="primary" disabled={waiting} title={why} onClick={() => send('next')}>Следующий ход</Button> : null}
            {may('join') && outside.length ? <Button size="sm" disabled={waiting} title={why} onClick={() => setDialog('join')}>Вступить…</Button> : null}
            {may('stop') ? <Button size="sm" disabled={waiting} title={why} onClick={() => send('stop')}>Конец боя</Button> : null}
          </>
        ) : may('start') ? (
          <Button size="sm" variant="primary" disabled={waiting} title={why} onClick={() => setDialog('start')}>Начать бой…</Button>
        ) : null}
        {may('time') ? (
          <span className="fight__span">
            <Input type="number" value={amount} onChange={setAmount} />
            <Select value={unit} options={UNITS.map(([key, label]) => [key, label] as const)} onChange={setUnit} label="единица времени" />
            <Button size="sm" disabled={waiting || !(seconds > 0)} title={why} onClick={() => send('time', { seconds })}>Прошло время</Button>
          </span>
        ) : null}
        {may('scene') ? <Button size="sm" disabled={waiting} title={why} onClick={() => send('scene')}>Закрыть сцену</Button> : null}
        {!fighting && heard.has('short-rest') && may('short-rest') ? <Button size="sm" variant="ghost" disabled={waiting} title={why} onClick={() => send('short-rest')}>Короткий отдых</Button> : null}
        {!fighting && heard.has('long-rest') && may('long-rest') ? <Button size="sm" variant="ghost" disabled={waiting} title={why} onClick={() => send('long-rest')}>Долгий отдых</Button> : null}
      </div>
      {dialog === 'start' ? (
        <StartDialog room={room} onClose={() => setDialog(null)} onStart={extra => { send('start', extra); setDialog(null); }} />
      ) : null}
      {dialog === 'join' ? (
        <PickDialog
          title="Вступить в бой" sub="Кто вступает — бросят инициативу и встанут в порядок ходов"
          sheets={outside.map(sheet => [sheet.id, sheet.name ?? sheet.id] as const)}
          go="Вступить" onClose={() => setDialog(null)}
          onPick={who => { send('join', { who }); setDialog(null); }}
        />
      ) : null}
    </Card>
  );
}

function StartDialog({ room, onClose, onStart }: {
  room: RoomState;
  onClose: () => void;
  onStart: (extra: Partial<TurnIntent>) => void;
}) {
  const rolls = Boolean(room.system.initiative);
  const [mode, setMode] = useState<'roll' | 'order'>(rolls ? 'roll' : 'order');
  const [rows, setRows] = useState(() => fightersOf(room).map(sheet => ({ id: sheet.id, name: sheet.name ?? sheet.id, on: true })));
  const chosen = rows.filter(row => row.on).map(row => row.id);
  const flip = (id: string) => setRows(list => list.map(row => (row.id === id ? { ...row, on: !row.on } : row)));
  const move = (at: number, by: number) => setRows(list => {
    const next = [...list];
    const [row] = next.splice(at, 1);
    next.splice(at + by, 0, row!);
    return next;
  });

  return (
    <Drawer
      open title="Начать бой" onClose={onClose}
      sub={mode === 'roll' ? 'Отмеченные бросят инициативу — порядок по броску' : 'Порядок ходов сверху вниз, без броска'}
      footer={
        <Button variant="primary" disabled={!chosen.length} onClick={() => onStart(mode === 'roll' ? { who: chosen } : { order: chosen })}>
          {mode === 'roll' ? 'Бросить инициативу' : 'Начать по порядку'}
        </Button>
      }
    >
      {rolls ? (
        <Segmented
          value={mode}
          options={[{ key: 'roll', label: 'Бросить инициативу' }, { key: 'order', label: 'Задать порядок' }]}
          onChange={setMode}
        />
      ) : null}
      <div className="pick-list">
        {rows.map((row, at) => (
          <div key={row.id} className="pick-list__row">
            <label className="inline">
              <input type="checkbox" checked={row.on} onChange={() => flip(row.id)} />
              <span>{row.name}</span>
            </label>
            {mode === 'order' ? (
              <span className="inline inline--tight">
                <Button size="sm" variant="ghost" disabled={at === 0} ariaLabel={`${row.name} выше`} onClick={() => move(at, -1)}>↑</Button>
                <Button size="sm" variant="ghost" disabled={at === rows.length - 1} ariaLabel={`${row.name} ниже`} onClick={() => move(at, 1)}>↓</Button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

function PickDialog({ title, sub, sheets, go, onClose, onPick }: {
  title: string;
  sub: string;
  sheets: readonly (readonly [string, string])[];
  go: string;
  onClose: () => void;
  onPick: (who: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <Drawer
      open title={title} sub={sub} onClose={onClose}
      footer={<Button variant="primary" disabled={!picked.length} onClick={() => onPick(sheets.map(([id]) => id).filter(id => picked.includes(id)))}>{go}</Button>}
    >
      <div className="pick-list">
        {sheets.map(([id, name]) => (
          <div key={id} className="pick-list__row">
            <label className="inline">
              <input type="checkbox" checked={picked.includes(id)} onChange={() => setPicked(list => (list.includes(id) ? list.filter(one => one !== id) : [...list, id]))} />
              <span>{name}</span>
            </label>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
