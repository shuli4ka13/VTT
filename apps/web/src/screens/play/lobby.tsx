import { useCallback, useEffect, useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { Card, CardHead, Button, DangerButton, Verdict, Empty } from '../../ui/primitives.tsx';
import { Columns, RowsTable } from '../../ui/layout.tsx';
import { listRooms, listWorlds, createRoom, closeRoom } from '../../api/client.ts';
import { BuildWorld } from './build-world.tsx';
import type { RoomSummary, WorldSummary } from '@vtt/schema';

const STAMP = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const stampOf = (iso: string): string => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : STAMP.format(at).replace(',', '');
};

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

  return (
    <Columns main={{
      body: (
        <>
          {error ? <Verdict tone="bad">{error}</Verdict> : null}

          <Card>
            <CardHead
              title="Столы"
              actions={<Button size="sm" onClick={refresh}>Обновить</Button>}
            />
            {rooms.length === 0
              ? <Empty
                  title="Столов пока нет"
                  hint="Создайте стол из опубликованного мира — список ниже."
                />
              : (
                <>
                  <span className="faint">Удалить стол может его ведущий</span>
                  <RowsTable
                    columns={[
                      { head: 'Стол', width: 'minmax(0, 2fr)' },
                      { head: 'Ведущий', width: 'minmax(0, 1fr)', minor: true },
                      { head: 'За столом', width: '88px', minor: true },
                      { head: 'Создан', width: '132px', minor: true },
                      { head: '', width: 'auto' },
                    ]}
                    rows={rooms.map(room => ({
                      key: room.id,
                      onOpen: () => join(room.id),
                      cells: [
                        room.title,
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
          </Card>

          <BuildWorld onBuilt={() => void refresh()} />

          <Card>
            <CardHead title="Собранные миры" />
            {worlds.length === 0
              ? <span className="faint">
                  Миров нет. Соберите первый выше — из опубликованной системы и компендиумов к ней.
                </span>
              : (
                <RowsTable
                  columns={[
                    { head: 'Мир', width: 'minmax(0, 2fr)' },
                    { head: 'Система', width: 'minmax(0, 1fr)', minor: true },
                    { head: 'Автор', width: 'minmax(0, 1fr)', minor: true },
                    { head: '', width: 'auto' },
                  ]}
                  rows={[...worlds].sort((x, y) => x.title.localeCompare(y.title, 'ru')).map(world => ({
                    key: world.id,
                    cells: [
                      world.title,
                      world.systemName,
                      world.authorName,
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
          </Card>
        </>
      ),
    }} />
  );
}
