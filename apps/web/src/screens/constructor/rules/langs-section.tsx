import { useMemo, useState } from 'react';
import type { System } from '@vtt/schema';
import { LANG_WORDS, langsOf, setLangs, dropLang, translatable, translate, untranslated } from '@vtt/engine';
import type { TextEntry } from '@vtt/engine';
import { Card, CardHead, Field, Fold, Select, Button, DangerButton, LabelInput, Segmented } from '../../../ui/primitives.tsx';
import { RowsTable } from '../../../ui/layout.tsx';
import type { WorldState } from '../../../store/world.ts';
import { langName, useT } from '../../../i18n/author.ts';

type EditSystem = WorldState['editSystem'];

interface Group { key: string; title: string; entries: TextEntry[] }

const groupsOf = (system: System, entries: readonly TextEntry[], sectionWord: (top: string) => string): Group[] => {
  const out = new Map<string, Group>();
  for (const entry of entries) {
    const [top, second] = entry.path;
    const nested = top === 'tables' || top === 'effects';
    const key = nested ? `${String(top)}/${String(second)}` : String(top ?? '');
    let group = out.get(key);
    if (!group) {
      const title = top === 'tables' ? system.tables?.[String(second)]?.label || String(second)
        : top === 'effects' ? system.effects?.[String(second)]?.label || String(second)
          : sectionWord(String(top));
      group = { key, title, entries: [] };
      out.set(key, group);
    }
    group.entries.push(entry);
  }
  return [...out.values()];
};

const at = (entry: TextEntry): string => `${entry.path.join('/')}#${entry.field}`;

function TranslateRows({ entries, lang, editSystem }: { entries: TextEntry[]; lang: string; editSystem: EditSystem }) {
  const t = useT('rules');
  return (
    <RowsTable
      columns={[{ head: t('langs.headWhat'), width: '9rem', minor: true }, { head: t('langs.headMain'), width: '1fr' }, { head: langName(lang), width: '1fr' }]}
      rows={entries.map(entry => ({
        key: at(entry),
        cells: [
          t(`langs.field.${entry.field}`, { defaultValue: entry.field }),
          entry.text,
          <LabelInput
            key="t"
            value={entry.translations[lang] ?? ''}
            placeholder={t('langs.placeholder')}
            onCommit={text => editSystem(draft => translate(draft, entry.path, lang, entry.field, text))}
          />,
        ],
      }))}
    />
  );
}

export function LangsSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const t = useT('rules');
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
    ? groupsOf(system, entries, top => t(`langs.section.${top}`, { defaultValue: t('langs.section.other') })).map(group => ({
      ...group,
      all: group.entries,
      entries: onlyBare ? group.entries.filter(entry => !entry.translations[current]) : group.entries,
    })).filter(group => group.entries.length)
    : [];

  return (
    <>
      <Card>
        <CardHead
          title={t('langs.title')}
          sub={t('langs.sub')}
          actions={addOptions.length ? (
            <Select
              value="" label={t('langs.addLabel')}
              options={[['', t('langs.addOption')], ...addOptions.map(code => [code, langName(code)] as const)]}
              onChange={code => { if (code) editSystem(draft => setLangs(draft, [...langsOf(draft), code])); }}
            />
          ) : null}
        />
        <Field label={t('langs.mainField')}>
          <Select
            value={main ?? ''} label={t('langs.mainLabel')}
            options={mainOptions.map(code => [code, langName(code)] as const)}
            onChange={code => editSystem(draft => setLangs(draft, [code, ...langsOf(draft).slice(1)]))}
          />
        </Field>
        {added.length ? (
          <RowsTable
            columns={[{ head: t('langs.headLang'), width: '1fr' }, { head: t('langs.headTranslation'), width: '1fr', minor: true }, { head: '', width: 'auto' }]}
            rows={added.map(lang => ({
              key: lang,
              cells: [
                langName(lang),
                t('langs.lacking', { left: lacking.get(lang)?.length ?? 0, total: counted }),
                <span key="a" className="inline inline--tight">
                  <Button size="sm" variant={current === lang ? 'primary' : undefined} onClick={() => setEditing(current === lang ? null : lang)}>{t('langs.translate')}</Button>
                  <DangerButton size="sm" onConfirm={() => { if (editing === lang) setEditing(null); editSystem(draft => dropLang(draft, lang)); }}>{t('langs.drop')}</DangerButton>
                </span>,
              ],
            }))}
          />
        ) : <span className="faint">{t('langs.single')}</span>}
      </Card>

      {current ? (
        <Card>
          <CardHead
            title={t('langs.translateTitle', { name: langName(current) })}
            actions={(
              <Segmented
                value={onlyBare ? 'bare' : 'all'}
                options={[{ key: 'bare', label: t('langs.onlyBare') }, { key: 'all', label: t('langs.all') }]}
                onChange={key => setOnlyBare(key === 'bare')}
              />
            )}
          />
          {groups.length ? groups.map(group => {
            const left = group.all.filter(entry => !entry.translations[current]).length;
            return (
              <Fold key={group.key} lazy title={group.title} count={group.entries.length} summary={left ? t('langs.left', { n: left }) : t('langs.allDone')}>
                <TranslateRows entries={group.entries} lang={current} editSystem={editSystem} />
              </Fold>
            );
          }) : <span className="faint">{onlyBare ? t('langs.nothingBare') : t('langs.nothingAtAll')}</span>}
        </Card>
      ) : null}
    </>
  );
}
