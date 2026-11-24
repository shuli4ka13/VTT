import { useMemo, useState } from 'react';
import { useWorld, useBook } from '../../../store/world.ts';
import { Card, CardHead, Select, Verdict, Empty, Segmented } from '../../../ui/primitives.tsx';
import { SheetView } from '../../../sheet/sheet-view.tsx';
import { useReader } from '../../../engine/use-calc.ts';
import { useDryRun, mannequinsOf, DICE_MODES } from '../../../engine/dry-run.ts';
import type { DiceMode } from '../../../engine/dry-run.ts';
import type { Sheet, StoredValue } from '@vtt/schema';
import { DonorPalette } from '../donors.tsx';
import { fieldOf } from '@vtt/engine';
import { useT } from '../../../i18n/author.ts';

const diceOptions = () => (Object.keys(DICE_MODES) as DiceMode[]).map(key => [key, DICE_MODES[key].label] as const);

export function PreviewPanel({ effectId, only }: { effectId: string | null; only?: 'trial' }) {
  const t = useT('effects');
  const system = useWorld(s => s.system);
  const compendium = useBook();
  const [tab, setTab] = useState<'donors' | 'trial'>(only ?? 'donors');
  const [dice, setDice] = useState<DiceMode>('avg');

  const [own, setOwn] = useState<Record<string, Record<string, StoredValue>>>({});
  const pair = useMemo<Sheet[]>(
    () => mannequinsOf(system).map(sheet => ({ ...sheet, values: { ...sheet.values, ...own[sheet.id] } })),
    [system, own],
  );
  const [before, after] = pair as [Sheet, Sheet];
  const run = useDryRun(system, compendium, tab === 'trial' ? effectId : null, dice, pair);
  const target = run?.sheets.find(sheet => sheet.id === after.id) ?? after;
  const actorReader = useReader(system, before, compendium);
  const targetReader = useReader(system, after, compendium);
  const reader = useReader(system, target, compendium);
  const write = (sheetId: string) => (tag: string, value: StoredValue) =>
    setOwn(current => ({ ...current, [sheetId]: { ...current[sheetId], [tag]: value } }));

  return (
    <>
      {only ? null : (
        <Segmented
          value={tab}
          options={[{ key: 'donors' as const, label: t('preview.donors') }, { key: 'trial' as const, label: t('preview.trial') }]}
          onChange={setTab}
        />
      )}

      {tab === 'donors' ? <DonorPalette kind="effects" /> : null}

      {tab === 'trial' ? (
        !effectId
          ? <Empty title={t('preview.pickTitle')} hint={t('preview.pickHint')} />
          : (
            <>
              <Card>
                <CardHead title={t('preview.die')} sub={DICE_MODES[dice].hint} />
                <Select value={dice} options={diceOptions() as never} onChange={setDice} />
              </Card>

              {run?.trouble ? <Verdict tone="bad">{run.trouble}</Verdict> : null}

              {run && !run.trouble ? (
                <Card>
                  <CardHead title={t('preview.result')} sub={t('preview.applies', { actor: before!.name, target: after!.name })} />
                  {run.lines.length === 0
                    ? <span className="faint">{t('preview.nothing')}</span>
                    : run.lines.map((line, at) => <p key={at} className="trial__line">{line}</p>)}
                  {run.changes.length ? (
                    <div className="stack stack--tight">
                      {run.changes.map((change, at) => (
                        <span key={at} className="faint">
                          {change.sheet} · {labelOf(change.tag)}: {String(change.from)} → {String(change.to)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Card>
              ) : null}

              <SheetView system={system} sheet={target} reader={reader} badge={t('preview.after')} />

              <Card>
                <CardHead title={t('preview.who')} sub={t('preview.whoSub')} />
                {Object.keys(own).length ? <button type="button" className="linkish" onClick={() => setOwn({})}>{t('preview.reset')}</button> : null}
              </Card>
              <SheetView system={system} sheet={before} reader={actorReader} badge={t('preview.actor')} onChange={write(before.id)} />
              <SheetView system={system} sheet={after} reader={targetReader} badge={t('preview.target')} onChange={write(after.id)} />
            </>
          )
      ) : null}
    </>
  );

  function labelOf(tag: string): string {
    return fieldOf(system, tag)?.label ?? tag;
  }
}
