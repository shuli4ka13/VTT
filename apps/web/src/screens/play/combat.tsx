import { useState } from 'react';
import type { RoomState, TurnIntent } from '@vtt/schema';
import { heardMoments, isDesk, isGroup } from '@vtt/engine';
import { tableSocket } from '../../api/socket.ts';
import { mayTurn } from '../../engine/rights.ts';
import { useSession } from '../../store/session.ts';
import { Card, CardHead, Button, Drawer, Segmented, Select, Input } from '../../ui/primitives.tsx';
import { dayTime, UNITS } from './clock-words.ts';
import { useT } from '../../i18n/play.ts';

type Op = TurnIntent['op'];

export const fightersOf = (room: RoomState) =>
  room.sheets.filter(sheet => !isDesk(sheet) && !isGroup(sheet, room.sheets));

export function CombatBar({ room, onError }: { room: RoomState; onError: (message: string | null) => void }) {
  const t = useT('play');
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
  const why = waiting ? t('combat.waiting') : undefined;
  const may = (op: Op) => mayTurn(room, userId, op);
  const outside = fightersOf(room).filter(sheet => !clock?.order.includes(sheet.id));
  const seconds = Number(amount) * (UNITS.find(([key]) => key === unit)?.[2] ?? 60);
  const scores = clock?.scores ?? {};

  return (
    <Card className="fight">
      <CardHead
        title={fighting ? t('combat.turnOf', { round: clock!.round, name: nameOf(String(clock!.active)) }) : t('combat.idle')}
        actions={<span className="fight__time num" title={t('combat.gameTime')}>{dayTime(Number(clock?.sec ?? 0))}</span>}
      />
      {fighting ? (
        <ol className="fight__order" aria-label={t('combat.order')}>
          {clock!.order.map(id => (
            <li key={id} className={`fight__turn${id === clock!.active ? ' fight__turn--now' : ''}`}>
              <span className="fight__name">{nameOf(id)}</span>
              {id in scores ? <span className="fight__score num" title={t('combat.initiative')}>{scores[id]}</span> : null}
              {may('leave') ? (
                <button
                  type="button" className="fight__out" disabled={waiting}
                  title={t('combat.leaveTitle', { name: nameOf(id) })} aria-label={t('combat.leaveLabel', { name: nameOf(id) })}
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
            {may('next') ? <Button size="sm" variant="primary" disabled={waiting} title={why} onClick={() => send('next')}>{t('combat.next')}</Button> : null}
            {may('join') && outside.length ? <Button size="sm" disabled={waiting} title={why} onClick={() => setDialog('join')}>{t('combat.join')}</Button> : null}
            {may('stop') ? <Button size="sm" disabled={waiting} title={why} onClick={() => send('stop')}>{t('combat.stop')}</Button> : null}
          </>
        ) : may('start') ? (
          <Button size="sm" variant="primary" disabled={waiting} title={why} onClick={() => setDialog('start')}>{t('combat.start')}</Button>
        ) : null}
        {may('time') ? (
          <span className="fight__span">
            <Input type="number" value={amount} onChange={setAmount} />
            <Select value={unit} options={UNITS.map(([key, label]) => [key, label] as const)} onChange={setUnit} label={t('combat.unit')} />
            <Button size="sm" disabled={waiting || !(seconds > 0)} title={why} onClick={() => send('time', { seconds })}>{t('combat.pass')}</Button>
          </span>
        ) : null}
        {may('scene') ? <Button size="sm" disabled={waiting} title={why} onClick={() => send('scene')}>{t('combat.scene')}</Button> : null}
        {!fighting && heard.has('short-rest') && may('short-rest') ? <Button size="sm" variant="ghost" disabled={waiting} title={why} onClick={() => send('short-rest')}>{t('combat.shortRest')}</Button> : null}
        {!fighting && heard.has('long-rest') && may('long-rest') ? <Button size="sm" variant="ghost" disabled={waiting} title={why} onClick={() => send('long-rest')}>{t('combat.longRest')}</Button> : null}
      </div>
      {dialog === 'start' ? (
        <StartDialog room={room} onClose={() => setDialog(null)} onStart={extra => { send('start', extra); setDialog(null); }} />
      ) : null}
      {dialog === 'join' ? (
        <PickDialog
          title={t('combat.joinTitle')} sub={t('combat.joinSub')}
          sheets={outside.map(sheet => [sheet.id, sheet.name ?? sheet.id] as const)}
          go={t('combat.joinGo')} onClose={() => setDialog(null)}
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
  const t = useT('play');
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
      open title={t('combat.startTitle')} onClose={onClose}
      sub={mode === 'roll' ? t('combat.startRollSub') : t('combat.startOrderSub')}
      footer={
        <Button variant="primary" disabled={!chosen.length} onClick={() => onStart(mode === 'roll' ? { who: chosen } : { order: chosen })}>
          {mode === 'roll' ? t('combat.rollInitiative') : t('combat.startInOrder')}
        </Button>
      }
    >
      {rolls ? (
        <Segmented
          value={mode}
          options={[{ key: 'roll', label: t('combat.rollInitiative') }, { key: 'order', label: t('combat.setOrder') }]}
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
                <Button size="sm" variant="ghost" disabled={at === 0} ariaLabel={t('combat.up', { name: row.name })} onClick={() => move(at, -1)}>↑</Button>
                <Button size="sm" variant="ghost" disabled={at === rows.length - 1} ariaLabel={t('combat.down', { name: row.name })} onClick={() => move(at, 1)}>↓</Button>
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
