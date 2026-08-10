// Полоса мира: имя системы, вход и публикация.
//
// Отдельной строкой, а не в общей шапке, намеренно: в PoC шапка несла восемь
// разнородных элементов подряд — логотип, два режима, поле имени, вход,
// публикацию и две кнопки мира, — и найти в ней нужное было нельзя.
// Здесь разделено по принадлежности: наверху навигация, тут — этот мир.

import { useState } from 'react';
import { useWorld } from '../../store/world.ts';
import { Button, Input } from '../../ui/primitives.tsx';
import { login, publishWorld, setToken, currentToken, ApiError } from '../../api/client.ts';

export function WorldBar() {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const sheets = useWorld(s => s.sheets);
  const editSystem = useWorld(s => s.editSystem);

  const [name, setName] = useState('');
  const [signed, setSigned] = useState(Boolean(currentToken()));
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const enter = async () => {
    try {
      const session = await login(name.trim() || 'Гость');
      setToken(session.token);
      setSigned(true);
      setNote({ text: `вошли как ${session.name}`, bad: false });
    } catch (err) {
      setNote({ text: (err as Error).message, bad: true });
    }
  };

  const publish = async () => {
    try {
      await publishWorld(system.name ?? 'Без имени', { system, compendium, sheets });
      setNote({ text: 'мир опубликован — его можно открыть за столом', bad: false });
    } catch (err) {
      const issues = err instanceof ApiError && err.issues.length ? ` (${err.issues[0]})` : '';
      setNote({ text: (err as Error).message + issues, bad: true });
    }
  };

  return (
    <div className="tabs" style={{ background: 'var(--surface)' }}>
      <span className="field__label">Система</span>
      <div style={{ width: 220 }}>
        <Input value={system.name ?? ''} onChange={next => editSystem(draft => { draft.name = next; })} />
      </div>

      <span className="spacer" />

      {note ? (
        <span className={note.bad ? 'field__error' : 'muted'} style={{ fontSize: 'var(--fs-2)' }}>
          {note.text}
        </span>
      ) : null}

      {signed ? null : (
        <>
          <div style={{ width: 130 }}>
            <Input value={name} onChange={setName} placeholder="ваше имя" />
          </div>
          <Button size="sm" onClick={enter}>Войти</Button>
        </>
      )}
      <Button size="sm" variant="primary" onClick={publish} disabled={!signed}>
        Опубликовать
      </Button>
    </div>
  );
}
