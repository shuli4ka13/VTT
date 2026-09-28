import { useState } from 'react';
import { useWorld, useBook } from '../../../store/world.ts';
import { Card, CardHead, Select, Verdict, Empty, Segmented } from '../../../ui/primitives.tsx';
import { SheetView } from '../../../sheet/sheet-view.tsx';
import { useReader } from '../../../engine/use-calc.ts';
import { useDryRun, mannequinsOf, DICE_MODES } from '../../../engine/dry-run.ts';
import type { DiceMode } from '../../../engine/dry-run.ts';
import { DonorPalette } from '../donors.tsx';

const DICE_OPTIONS = (Object.keys(DICE_MODES) as DiceMode[]).map(key => [key, DICE_MODES[key].label] as const);

export function PreviewPanel({ effectId }: { effectId: string | null }) {
  const system = useWorld(s => s.system);
  const compendium = useBook();
  const [tab, setTab] = useState<'donors' | 'trial'>('donors');
  const [dice, setDice] = useState<DiceMode>('avg');

  const run = useDryRun(system, compendium, tab === 'trial' ? effectId : null, dice);
  const [before, after] = mannequinsOf(system);
  const target = run?.sheets.find(sheet => sheet.id === after!.id) ?? after!;
  const reader = useReader(system, target, compendium);

  return (
    <>
      <Segmented
        value={tab}
        options={[{ key: 'donors' as const, label: 'Готовое' }, { key: 'trial' as const, label: 'Проба' }]}
        onChange={setTab}
      />

      {tab === 'donors' ? <DonorPalette kind="effects" /> : null}

      {tab === 'trial' ? (
        !effectId
          ? <Empty title="Выберите эффект" hint="Проба показывает, что он сделает с манекеном Б." />
          : (
            <>
              <Card>
                <CardHead title="Кость" sub={DICE_MODES[dice].hint} />
                <Select value={dice} options={DICE_OPTIONS as never} onChange={setDice} />
              </Card>

              {run?.trouble ? <Verdict tone="bad">{run.trouble}</Verdict> : null}

              {run && !run.trouble ? (
                <Card>
                  <CardHead title="Что вышло" sub={`${before!.name} применяет эффект к ${after!.name}`} />
                  {run.lines.length === 0
                    ? <span className="faint">Эффект ничего не сделал.</span>
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

              <SheetView system={system} sheet={target} reader={reader} badge="манекен" />
            </>
          )
      ) : null}
    </>
  );

  function labelOf(tag: string): string {
    return system.fields.find(field => field.tag === tag)?.label ?? tag;
  }
}
