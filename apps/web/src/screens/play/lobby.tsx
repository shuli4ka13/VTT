import { useCallback, useEffect, useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { Card, CardHead, Button, Verdict, Empty } from '../../ui/primitives.tsx';
import { Columns } from '../../ui/layout.tsx';
import { listRooms, listWorlds, createRoom } from '../../api/client.ts';
import { BuildWorld } from './build-world.tsx';
import type { RoomSummary, WorldSummary } from '@vtt/schema';

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
                <div className="stack stack--tight">
                  {rooms.map(room => (
                    <Button key={room.id} wide onClick={() => join(room.id)}>
                      {room.title} · за столом: {room.memberCount}
                    </Button>
                  ))}
                </div>
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
                <div className="stack stack--tight">
                  {worlds.map(world => (
                    <div key={world.id} className="inline">
                      <span className="spacer">
                        {world.title}
                        <span className="faint"> · {world.systemName} · {world.authorName}</span>
                      </span>
                      <Button size="sm" onClick={async () => {
                        try {
                          const room = await createRoom(world.id, `Стол «${world.title}»`);
                          setRooms(current => [...current, room]);
                          join(room.id);
                        } catch (err) { setError((err as Error).message); }
                      }}>
                        Создать стол
                      </Button>
                    </div>
                  ))}
                </div>
              )}
          </Card>
        </>
      ),
    }} />
  );
}
