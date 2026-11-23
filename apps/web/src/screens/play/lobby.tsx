import { useCallback, useEffect, useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { Card, CardHead, Button, DangerButton, Verdict, Empty, Segmented } from '../../ui/primitives.tsx';
import { Columns, RowsTable } from '../../ui/layout.tsx';
import { listRooms, listWorlds, createRoom, closeRoom, deleteWorld } from '../../api/client.ts';
import { BuildWorld } from './build-world.tsx';
import { stampOf } from '../../ui/stamp.ts';
import type { RoomSummary, WorldSummary } from '@vtt/schema';
import { t as tx, useT } from '../../i18n/play.ts';

export { stampOf };

type Tab = 'rooms' | 'worlds' | 'build';
type Order = 'time' | 'world' | 'system';

const tabs = () => [
  { key: 'rooms', label: tx('play:lobby.tab.rooms') },
  { key: 'worlds', label: tx('play:lobby.tab.worlds') },
  { key: 'build', label: tx('play:lobby.tab.build') },
] as const;

const orders = () => [
  { key: 'time', label: tx('play:lobby.order.time') },
  { key: 'world', label: tx('play:lobby.order.world') },
  { key: 'system', label: tx('play:lobby.order.system') },
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
  const t = useT('play');
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

          <Segmented value={tab} options={tabs()} onChange={setTab} />

          {tab === 'rooms' ? <Card>
            <CardHead
              title={t('lobby.rooms.title')}
              actions={<>
                <Segmented value={roomOrder} options={orders()} onChange={setRoomOrder} />
                <Button size="sm" onClick={refresh}>{t('lobby.rooms.refresh')}</Button>
              </>}
            />
            {rooms.length === 0
              ? <Empty
                  title={t('lobby.rooms.none')}
                  hint={t('lobby.rooms.noneHint')}
                />
              : (
                <>
                  <span className="faint">{t('lobby.rooms.gmDeletes')}</span>
                  <RowsTable
                    columns={[
                      { head: t('col.table'), width: 'minmax(0, 2fr)' },
                      { head: t('col.world'), width: 'minmax(0, 1fr)', minor: true },
                      { head: t('col.system'), width: 'minmax(0, 1fr)', minor: true },
                      { head: t('col.gm'), width: 'minmax(0, 1fr)', minor: true },
                      { head: t('col.atTable'), width: '88px', minor: true },
                      { head: t('col.created'), width: '132px', minor: true },
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
                          <Button size="sm" onClick={() => join(room.id)}>{t('lobby.rooms.enter')}</Button>
                          {room.gm ? (
                            <DangerButton size="sm" onConfirm={() => {
                              closeRoom(room.id)
                                .then(() => refresh())
                                .catch(err => setError((err as Error).message));
                            }}>
                              {t('common:delete')}
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
              title={t('lobby.worlds.title')}
              actions={<Segmented value={worldOrder} options={orders()} onChange={setWorldOrder} />}
            />
            {worlds.length === 0
              ? <span className="faint">
                  {t('lobby.worlds.none')}
                </span>
              : (
                <RowsTable
                  columns={[
                    { head: t('col.world'), width: 'minmax(0, 2fr)' },
                    { head: t('col.system'), width: 'minmax(0, 1fr)', minor: true },
                    { head: t('col.author'), width: 'minmax(0, 1fr)', minor: true },
                    { head: t('col.changed'), width: '132px', minor: true },
                    { head: '', width: 'auto' },
                  ]}
                  rows={sortWorlds(worlds, worldOrder).map(world => ({
                    key: world.id,
                    cells: [
                      world.title,
                      world.systemName,
                      world.authorName,
                      stampOf(world.updatedAt),
                      <>
                        <Button size="sm" onClick={async () => {
                          try {
                            const room = await createRoom(world.id, t('lobby.worlds.roomTitle', { title: world.title }));
                            void refresh();
                            join(room.id);
                          } catch (err) { setError((err as Error).message); }
                        }}>
                          {t('lobby.worlds.createRoom')}
                        </Button>
                        {world.mine ? (
                          <DangerButton size="sm" onConfirm={() => {
                            deleteWorld(world.id)
                              .then(() => refresh())
                              .catch(err => setError((err as Error).message));
                          }}>
                            {t('common:delete')}
                          </DangerButton>
                        ) : null}
                      </>,
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
