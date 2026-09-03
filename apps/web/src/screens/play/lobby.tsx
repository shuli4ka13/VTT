import { useEffect, useState } from 'react';
import { useRoom } from '../../store/room.ts';
import { Card, CardHead, Button, Input, Verdict, Empty } from '../../ui/primitives.tsx';
import { Columns } from '../../ui/layout.tsx';
import { login, setToken, currentToken, listRooms, listWorlds, createRoom } from '../../api/client.ts';
import { BuildWorld } from './build-world.tsx';
import type { RoomSummary, WorldSummary } from '@vtt/schema';

export function Lobby() {
  const join = useRoom(s => s.join);
  const error = useRoom(s => s.error);
  const setError = useRoom(s => s.setError);

  const [name, setName] = useState('');
  const [signed, setSigned] = useState(Boolean(currentToken()));
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);

  const refresh = async () => {
    try {
      setWorlds(await listWorlds());
      if (currentToken()) setRooms(await listRooms());
    } catch (err) {
      setError((err as Error).message);
    } finally {

      setSigned(Boolean(currentToken()));
    }
  };

  useEffect(() => { void refresh(); }, [signed]);

  return (
    <Columns main={{
      body: (
        <>
          {error ? <Verdict tone="bad">{error}</Verdict> : null}

          {signed ? null : (
            <Card>
              <CardHead title="Кто вы" />
              <div className="inline">
                <div style={{ width: 220 }}>
                  <Input value={name} onChange={setName} placeholder="ваше имя" />
                </div>
                <Button variant="primary" onClick={async () => {
                  try {
                    const session = await login(name.trim() || 'Гость');
                    setToken(session.token);
                    setSigned(true);
                    setError(null);
                  } catch (err) { setError((err as Error).message); }
                }}>Войти</Button>
              </div>
            </Card>
          )}

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

          {signed ? <BuildWorld onBuilt={() => void refresh()} /> : null}

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
                      <Button size="sm" disabled={!signed} onClick={async () => {
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
