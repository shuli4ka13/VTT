import { useMemo, useState } from 'react';
import type { System } from '@vtt/schema';
import { LANG_WORDS, langWord, langsOf, setLangs, dropLang, translatable, translate, untranslated } from '@vtt/engine';
import type { TextEntry } from '@vtt/engine';
import { Card, CardHead, Field, Fold, Select, Button, DangerButton, LabelInput, Segmented } from '../../../ui/primitives.tsx';
import { RowsTable } from '../../../ui/layout.tsx';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

const FIELD_WORDS: Record<string, string> = {
  label: 'название', asLabel: 'имя строки цикла', question: 'вопрос', yes: 'ответ «да»', no: 'ответ «нет»',
  hint: 'подсказка', title: 'шапка', description: 'описание', note: 'примечание «Стопа»',
};

const SECTION_WORDS: Record<string, string> = {
  blocks: 'Блоки листа', pages: 'Страницы листа', groups: 'Папки', sheets: 'Типы листов', tags: 'Метки',
  rolls: 'Броски', roll_edits: 'Правки броска', constants: 'Кости',
};

interface Group { key: string; title: string; entries: TextEntry[] }

const groupsOf = (system: System, entries: readonly TextEntry[]): Group[] => {
  const out = new Map<string, Group>();
  for (const entry of entries) {
    const [top, second] = entry.path;
    const nested = top === 'tables' || top === 'effects';
    const key = nested ? `${String(top)}/${String(second)}` : String(top ?? '');
    let group = out.get(key);
    if (!group) {
      const title = top === 'tables' ? system.tables?.[String(second)]?.label || String(second)
        : top === 'effects' ? system.effects?.[String(second)]?.label || String(second)
          : SECTION_WORDS[String(top)] ?? 'Прочее';
      group = { key, title, entries: [] };
      out.set(key, group);
    }
    group.entries.push(entry);
  }
  return [...out.values()];
};

const at = (entry: TextEntry): string => `${entry.path.join('/')}#${entry.field}`;

function TranslateRows({ entries, lang, editSystem }: { entries: TextEntry[]; lang: string; editSystem: EditSystem }) {
  return (
    <RowsTable
      columns={[{ head: 'Что это', width: '9rem', minor: true }, { head: 'Основной язык', width: '1fr' }, { head: langWord(lang), width: '1fr' }]}
      rows={entries.map(entry => ({
        key: at(entry),
        cells: [
          FIELD_WORDS[entry.field] ?? entry.field,
          entry.text,
          <LabelInput
            key="t"
            value={entry.translations[lang] ?? ''}
            placeholder="перевод"
            onCommit={text => editSystem(draft => translate(draft, entry.path, lang, entry.field, text))}
          />,
        ],
      }))}
    />
  );
}

export function LangsSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const langs = langsOf(system);
  const [main, ...added] = langs;
  const [editing, setEditing] = useState<string | null>(null);
  const [onlyBare, setOnlyBare] = useState(true);
  const lacking = untranslated(system);
  const entries = useMemo(() => translatable(system), [system]);
  const counted = entries.filter(entry => entry.counted).length;
  const current = editing && added.includes(editing) ? editing : null;

  const mainOptions = Object.keys(LANG_WORDS).filter(code => code === main || !added.includes(code));
  const addOptions = Object.keys(LANG_WORDS).filter(code => !langs.includes(code));
  const groups = current
    ? groupsOf(system, entries).map(group => ({
      ...group,
      all: group.entries,
      entries: onlyBare ? group.entries.filter(entry => !entry.translations[current]) : group.entries,
    })).filter(group => group.entries.length)
    : [];

  return (
    <>
      <Card>
        <CardHead
          title="Языки"
          sub="Названия пишутся на основном языке; добавьте язык и переведите названия для игроков, которые читают на нём."
          actions={addOptions.length ? (
            <Select
              value="" label="добавить язык"
              options={[['', '+ язык'], ...addOptions.map(code => [code, langWord(code)] as const)]}
              onChange={code => { if (code) editSystem(draft => setLangs(draft, [...langsOf(draft), code])); }}
            />
          ) : null}
        />
        <Field label="Основной язык">
          <Select
            value={main ?? ''} label="основной язык"
            options={mainOptions.map(code => [code, langWord(code)] as const)}
            onChange={code => editSystem(draft => setLangs(draft, [code, ...langsOf(draft).slice(1)]))}
          />
        </Field>
        {added.length ? (
          <RowsTable
            columns={[{ head: 'Язык', width: '1fr' }, { head: 'Перевод', width: '1fr', minor: true }, { head: '', width: 'auto' }]}
            rows={added.map(lang => ({
              key: lang,
              cells: [
                langWord(lang),
                `без перевода: ${lacking.get(lang)?.length ?? 0} из ${counted}`,
                <span key="a" className="inline inline--tight">
                  <Button size="sm" variant={current === lang ? 'primary' : undefined} onClick={() => setEditing(current === lang ? null : lang)}>Перевести</Button>
                  <DangerButton size="sm" onConfirm={() => { if (editing === lang) setEditing(null); editSystem(draft => dropLang(draft, lang)); }}>Убрать</DangerButton>
                </span>,
              ],
            }))}
          />
        ) : <span className="faint">Язык один — переводов нет.</span>}
      </Card>

      {current ? (
        <Card>
          <CardHead
            title={`Перевод · ${langWord(current)}`}
            actions={(
              <Segmented
                value={onlyBare ? 'bare' : 'all'}
                options={[{ key: 'bare', label: 'только без перевода' }, { key: 'all', label: 'все' }]}
                onChange={key => setOnlyBare(key === 'bare')}
              />
            )}
          />
          {groups.length ? groups.map(group => {
            const left = group.all.filter(entry => !entry.translations[current]).length;
            return (
              <Fold key={group.key} lazy title={group.title} count={group.entries.length} summary={left ? `осталось: ${left}` : 'всё переведено'}>
                <TranslateRows entries={group.entries} lang={current} editSystem={editSystem} />
              </Fold>
            );
          }) : <span className="faint">{onlyBare ? 'Всё переведено.' : 'Переводимых подписей нет.'}</span>}
        </Card>
      ) : null}
    </>
  );
}
