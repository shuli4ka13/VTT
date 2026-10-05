import { useWorld, useBook } from '../../store/world.ts';
import { useLookup } from '../../store/lookup.ts';
import type { Looked } from '../../store/lookup.ts';
import { Button, Card, CardHead } from '../../ui/primitives.tsx';
import type { Pane } from '../../ui/layout.tsx';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { useReader } from '../../engine/use-calc.ts';
import { mannequinsOf } from '../../engine/dry-run.ts';
import { useUsage } from './usage.ts';
import { explainName } from './lookup.ts';

export function useLookupPane(pane: Pane): Pane;
export function useLookupPane(): Pane | undefined;
export function useLookupPane(pane?: Pane): Pane | undefined {
  const at = useLookup(s => s.at);
  const close = useLookup(s => s.close);
  if (!at) return pane;
  return {
    head: 'Откуда это',
    pinned: true,
    tools: <Button size="sm" variant="ghost" title="закрыть справку" onClick={close}>×</Button>,
    body: <LookupPanel at={at} />,
  };
}

function LookupPanel({ at }: { at: Looked }) {
  const system = useWorld(s => s.system);
  const compendium = useBook();
  const effectId = useWorld(s => (s.activeTab === 'effects' ? s.activeEffectId : null));
  const pick = useWorld(s => s.pick);
  const usage = useUsage();
  const [sheet] = mannequinsOf(system);
  const reader = useReader(system, sheet ?? null, compendium);
  const told = explainName(system, compendium, effectId, at.name, usage, at.table);

  return (
    <>
      <Card>
        <CardHead title={told.title} sub={`${told.kind} · в «${at.where}»`} />
        {told.facts.length ? (
          <dl className="lookup__facts">
            {told.facts.map(([term, text]) => (
              <div key={term} style={{ display: 'contents' }}><dt>{term}</dt><dd>{text}</dd></div>
            ))}
          </dl>
        ) : null}
        {told.go ? <Button size="sm" onClick={() => pick(told.go!.pick)}>{told.go.label}</Button> : null}
      </Card>

      {told.field && sheet ? (
        <Card>
          <CardHead title="На листе" sub="новый лист" />
          <SheetView system={system} sheet={sheet} reader={reader} only={[told.field]} />
        </Card>
      ) : null}

      <Section title="Откуда приходит" lines={told.from} empty="никто не передаёт" />
      {told.shown.length ? <Section title="Где видно" lines={told.shown} /> : null}
      {told.users.length ? <Section title="Кто ещё пользуется" lines={told.users} /> : null}
    </>
  );
}

function Section({ title, lines, empty }: { title: string; lines: string[]; empty?: string }) {
  return (
    <Card>
      <CardHead title={title} />
      {lines.length
        ? <ul className="lookup__list">{lines.map(line => <li key={line}>{line}</li>)}</ul>
        : <span className="faint">{empty}</span>}
    </Card>
  );
}
