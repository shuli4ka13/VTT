// Полоса мира: имя системы, вход и публикация.
//
// Отдельной строкой, а не в общей шапке, намеренно: в PoC шапка несла восемь
// разнородных элементов подряд — логотип, два режима, поле имени, вход,
// публикацию и две кнопки мира, — и найти в ней нужное было нельзя.
// Здесь разделено по принадлежности: наверху навигация, тут — этот мир.

import { useState } from 'react';
import { useWorld, takeRestoreProblem } from '../../store/world.ts';
import { Button, Input } from '../../ui/primitives.tsx';
import { login, publishWorld, setToken, currentToken, ApiError } from '../../api/client.ts';
import { Select } from '../../ui/primitives.tsx';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { compendium as SAMPLE_COMPENDIUM } from '@vtt/engine/model/compendium';
import { sheets as SAMPLE_SHEETS } from '@vtt/engine/model/sheets';
import { world as W } from '@vtt/schema';
import type { System } from '@vtt/schema';

export function WorldBar() {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const sheets = useWorld(s => s.sheets);
  const editSystem = useWorld(s => s.editSystem);
  const replaceWorld = useWorld(s => s.replaceWorld);

  const [name, setName] = useState('');
  const [signed, setSigned] = useState(Boolean(currentToken()));
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(() => {
    const problem = takeRestoreProblem();
    return problem
      ? { text: `сохранённый мир не открылся (${problem}) — начали с чистого листа`, bad: true }
      : null;
  });

  // Открыть образец целиком — система, компендиум и готовые персонажи.
  // Конструктор по-прежнему стартует с чистого листа: это отдельное действие,
  // а не подмена старта. Нужно, чтобы показать работающий мир за один клик.
  const openSample = (id: string) => {
    const sample = (SAMPLE_SYSTEMS as System[]).find(s => s.id === id);
    if (!sample) return;
    // Образец проходит СХЕМУ, а не приводится к типу: если он ей не
    // соответствует, узнать об этом надо здесь, а не на публикации.
    const parsed = W.world.safeParse({
      system: sample,
      compendium: SAMPLE_COMPENDIUM,
      sheets: (SAMPLE_SHEETS as { systemId: string }[]).filter(s => s.systemId === id),
    });
    if (!parsed.success) {
      setNote({ text: `образец не проходит схему: ${parsed.error.issues[0]?.message}`, bad: true });
      return;
    }
    replaceWorld(structuredClone(parsed.data));
    setNote({ text: `открыт образец «${sample.name}»`, bad: false });
  };

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

      <Select
        value=""
        options={[['', 'взять образец целиком…'],
          ...(SAMPLE_SYSTEMS as System[]).map(s => [s.id ?? '', s.name ?? ''] as const)] as never}
        onChange={openSample}
      />

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
