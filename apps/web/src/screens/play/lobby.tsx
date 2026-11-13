import { useCallback, useEffect, useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { Card, CardHead, Button, DangerButton, Verdict, Empty, Segmented } from '../../ui/primitives.tsx';
import { Columns, RowsTable } from '../../ui/layout.tsx';
import { listRooms, listWorlds, createRoom, closeRoom } from '../../api/client.ts';
import { BuildWorld } from './build-world.tsx';
import type { RoomSummary, WorldSummary } from '@vtt/schema';

const STAMP = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const stampOf = (iso: string): string => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : STAMP.format(at).replace(',', '');
};

type Tab = 'rooms' | 'worlds' | 'build';
type Order = 'time' | 'world' | 'system';

const TABS = [
  { key: 'rooms', label: 'Столы' },
  { key: 'worlds', label: 'Миры' },
  { key: 'build', label: 'Собрать мир' },
] as const;

const ORDERS = [
  { key: 'time', label: 'по времени' },
  { key: 'world', label: 'по миру' },
  { key: 'system', label: 'по системе' },
] as const;

const byText = (x: string, y: string): number => x.localeCompare(y, 'ru');
const newest = (x: string, y: string): number => y.localeCompare(x);

export function sortRooms(rooms: readonly RoomSummary[], worlds: readonly WorldSummary[], order: Order): RoomSummary[] {
  const world = new Map(worlds.map(one => [one.id, one]));
  const name = (room: RoomSummary) => world.get(room.worldId)?.title ?? '';
  const system = (room: RoomSummary) => world.get(room.worldId)?.systemName ?? '';
  return [...rooms].sort((x, y) =>
    (order === 'world' ? byText(name(x), name(y)) : 0)
    || (order === 'system' ? byText(system(x), system(y)) || byText(name(x), name(y)) : 0)
    || newest(x.createdAt, y.createdAt));
}

export function sortWorlds(worlds: readonly WorldSummary[], order: Order): WorldSummary[] {
  return [...worlds].sort((x, y) =>
    (order === 'time' ? newest(x.updatedAt, y.updatedAt) : 0)
    || (order === 'system' ? byText(x.systemName, y.systemName) : 0)
    || byText(x.title, y.title));
}

export function Lobby() {
  const join = useRoom(s => s.join);
  const error = useRoom(s => s.error);
  const setError = useRoom(s => s.setError);

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);

  const refresh = useCallback(() => Promise
    .all([listWorlds(), listRooms()])
    .then(([nextWorlds, nextRooms]) => {
      setWorlds(nextWorlds);
      setRooms(nextRooms);
    })
    .catch(err => setError((err as Error).message)), [setError]);

  useEffect(() => { void refresh(); }, [refresh]);

  const [tab, setTab] = useState<Tab>('rooms');
  const [roomOrder, setRoomOrder] = useState<Order>('time');
  const [worldOrder, setWorldOrder] = useState<Order>('time');
  const worldOf = new Map(worlds.map(world => [world.id, world]));

  return (
    <Columns main={{
      body: (
        <>
          {error ? <Verdict tone="bad">{error}</Verdict> : null}

          <Segmented value={tab} options={TABS} onChange={setTab} />

          {tab === 'rooms' ? <Card>
            <CardHead
              title="Столы"
              actions={<>
                <Segmented value={roomOrder} options={ORDERS} onChange={setRoomOrder} />
                <Button size="sm" onClick={refresh}>Обновить</Button>
              </>}
            />
            {rooms.length === 0
              ? <Empty
                  title="Столов пока нет"
                  hint="Создайте стол из собранного мира — во вкладке «Миры»."
                />
              : (
                <>
                  <span className="faint">Удалить стол может его ведущий</span>
                  <RowsTable
                    columns={[
                      { head: 'Стол', width: 'minmax(0, 2fr)' },
                      { head: 'Мир', width: 'minmax(0, 1fr)', minor: true },
                      { head: 'Система', width: 'minmax(0, 1fr)', minor: true },
                      { head: 'Ведущий', width: 'minmax(0, 1fr)', minor: true },
                      { head: 'За столом', width: '88px', minor: true },
                      { head: 'Создан', width: '132px', minor: true },
                      { head: '', width: 'auto' },
                    ]}
                    rows={sortRooms(rooms, worlds, roomOrder).map(room => ({
                      key: room.id,
                      onOpen: () => join(room.id),
                      cells: [
                        room.title,
                        worldOf.get(room.worldId)?.title ?? '',
                        worldOf.get(room.worldId)?.systemName ?? '',
                        room.gmName,
                        room.memberCount,
                        stampOf(room.createdAt),
                        <>
                          <Button size="sm" onClick={() => join(room.id)}>Войти</Button>
                          {room.gm ? (
                            <DangerButton size="sm" onConfirm={() => {
                              closeRoom(room.id)
                                .then(() => refresh())
                                .catch(err => setError((err as Error).message));
                            }}>
                              Удалить
                            </DangerButton>
                          ) : null}
                        </>,
                      ],
                    }))}
                  />
                </>
              )}
          </Card> : null}

          {tab === 'build' ? <BuildWorld onBuilt={() => { void refresh(); setTab('worlds'); }} /> : null}

          {tab === 'worlds' ? <Card>
            <CardHead
              title="Собранные миры"
              actions={<Segmented value={worldOrder} options={ORDERS} onChange={setWorldOrder} />}
            />
            {worlds.length === 0
              ? <span className="faint">
                  Миров нет. Соберите первый во вкладке «Собрать мир» — из опубликованной системы и компендиумов к ней.
                </span>
              : (
                <RowsTable
                  columns={[
                    { head: 'Мир', width: 'minmax(0, 2fr)' },
                    { head: 'Система', width: 'minmax(0, 1fr)', minor: true },
                    { head: 'Автор', width: 'minmax(0, 1fr)', minor: true },
                    { head: 'Изменён', width: '132px', minor: true },
                    { head: '', width: 'auto' },
                  ]}
                  rows={sortWorlds(worlds, worldOrder).map(world => ({
                    key: world.id,
                    cells: [
                      world.title,
                      world.systemName,
                      world.authorName,
                      stampOf(world.updatedAt),
                      <Button size="sm" onClick={async () => {
                        try {
                          const room = await createRoom(world.id, `Стол «${world.title}»`);
                          void refresh();
                          join(room.id);
                        } catch (err) { setError((err as Error).message); }
                      }}>
                        Создать стол
                      </Button>,
                    ],
                  }))}
                />
              )}
          </Card> : null}
        </>
      ),
    }} />
  );
}
