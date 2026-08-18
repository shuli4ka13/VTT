import { useEffect, useState } from 'react';
import { useWorld, emptySystem, takeRestoreProblem } from '../../store/world.ts';
import { Button, Input, Select } from '../../ui/primitives.tsx';
import {
  login, setToken, currentToken, ApiError, listSystems, getSystem,
  publishSystem, listCompendiums, getCompendium, publishCompendium, publishWorld,
} from '../../api/client.ts';
import type { CompendiumSummary, SystemSummary } from '@vtt/schema';

export function WorldBar() {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const sheets = useWorld(s => s.sheets);
  const editSystem = useWorld(s => s.editSystem);
  const replaceWorld = useWorld(s => s.replaceWorld);
  const [name, setName] = useState('');
  const [signed, setSigned] = useState(Boolean(currentToken()));
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [books, setBooks] = useState<CompendiumSummary[]>([]);
  const [systemId, setSystemId] = useState('');
  const [bookIds, setBookIds] = useState<string[]>([]);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(() => {
    const problem = takeRestoreProblem();
    return problem ? { text: `черновик не открылся (${problem})`, bad: true } : null;
  });

  const refresh = async (selected = systemId) => {
    try {
      setSystems(await listSystems());
      setBooks(selected ? await listCompendiums(selected) : []);
    } catch (err) { setNote({ text: (err as Error).message, bad: true }); }
  };
  useEffect(() => { void refresh(); }, []);
  const fail = (err: unknown) => {
    const issues = err instanceof ApiError && err.issues.length ? ` (${err.issues[0]})` : '';
    setNote({ text: (err as Error).message + issues, bad: true });
  };
  const restart = () => {
    if (!window.confirm('Начать новую систему? Текущий локальный черновик будет стёрт.')) return;
    replaceWorld({ system: emptySystem(), compendium: { items: [], actions: [] }, sheets: [] });
    setSystemId(''); setBookIds([]); setBooks([]);
    setNote({ text: 'новый локальный черновик', bad: false });
  };
  const enter = async () => {
    try {
      const session = await login(name.trim() || 'Гость');
      setToken(session.token); setSigned(true);
      setNote({ text: `вошли как ${session.name}`, bad: false });
    } catch (err) { fail(err); }
  };
  const saveSystem = async () => {
    try {
      const saved = await publishSystem(system.name ?? 'Без имени', system);
      setSystemId(saved.id); setBookIds([]); await refresh(saved.id);
      setNote({ text: 'система опубликована новой версией', bad: false });
    } catch (err) { fail(err); }
  };
  const saveBook = async () => {
    if (!systemId) return setNote({ text: 'сначала опубликуйте или выберите систему', bad: true });
    try {
      const saved = await publishCompendium(`Компендиум · ${system.name}`, systemId, compendium);
      setBookIds([saved.id]); await refresh(systemId);
      setNote({ text: 'компендиум опубликован новой версией', bad: false });
    } catch (err) { fail(err); }
  };
  const saveWorld = async () => {
    if (!systemId) return setNote({ text: 'выберите опубликованную систему', bad: true });
    try {
      await publishWorld(system.name ?? 'Без имени', systemId, bookIds, sheets);
      setNote({ text: `мир опубликован · компендиумов: ${bookIds.length}`, bad: false });
    } catch (err) { fail(err); }
  };
  const chooseSystem = async (id: string) => {
    setSystemId(id); setBookIds([]); setBooks([]);
    if (!id) return;
    try {
      const saved = await getSystem(id);
      replaceWorld({ system: saved.system, compendium: { items: [], actions: [] }, sheets: [] });
      await refresh(id); setNote({ text: `открыта система «${saved.title}»`, bad: false });
    } catch (err) { fail(err); }
  };
  const openBook = async (id: string) => {
    if (!id) return;
    try {
      const saved = await getCompendium(id);
      replaceWorld({ system, compendium: saved.compendium, sheets });
      setBookIds([id]); setNote({ text: `открыт компендиум «${saved.title}»`, bad: false });
    } catch (err) { fail(err); }
  };

  return <div className="worldbar">
    <span className="field__label">Черновик</span>
    <div className="worldbar__name"><Input value={system.name ?? ''}
      onChange={next => editSystem(draft => { draft.name = next; })} /></div>
    <Button size="sm" variant="ghost" onClick={restart}>новая система</Button>
    <Select value={systemId} options={[
      ['', '— опубликованные системы —'], ...systems.map(s => [s.id, s.title] as const),
    ]} onChange={id => void chooseSystem(id)} />
    {systemId ? <Select value="" options={[
      ['', '— открыть компендиум —'], ...books.map(b => [b.id, b.title] as const),
    ]} onChange={id => void openBook(id)} /> : null}
    {systemId && books.length ? <span className="worldbar__books">
      {books.map(book => <label key={book.id} className="nowrap">
        <input type="checkbox" checked={bookIds.includes(book.id)} onChange={e =>
          setBookIds(ids => e.target.checked ? [...ids, book.id] : ids.filter(id => id !== book.id))} />
        {book.title}
      </label>)}
    </span> : null}
    <span className="spacer" />
    {note ? <span className={`worldbar__note ${note.bad ? 'field__error' : 'muted'}`}>{note.text}</span> : null}
    {signed ? null : <><div className="worldbar__name"><Input value={name} onChange={setName}
      placeholder="ваше имя" /></div><Button size="sm" onClick={enter}>Войти</Button></>}
    <Button size="sm" onClick={saveSystem} disabled={!signed}>Опубликовать систему</Button>
    <Button size="sm" onClick={saveBook} disabled={!signed || !systemId}>Опубликовать компендиум</Button>
    <Button size="sm" variant="primary" onClick={saveWorld} disabled={!signed || !systemId}>Создать мир</Button>
  </div>;
}
