import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld } from '../store/world.ts';
import type { ConstructorTab } from '../store/world.ts';
import { useGuide } from '../store/guide.ts';
import { useFormulaBar } from '../store/formula-bar.ts';
import { Button, Card, CardHead, Drawer, Fold, Verdict } from '../ui/primitives.tsx';
import { TABS } from '../words.ts';
import { lessonsNow, lessonOf } from './lessons/index.ts';
import { findAnchor, firstOf, foldOf, openedDialog } from './anchor.ts';
import { Spot } from './spot.tsx';
import type { Box } from './spot.tsx';
import type { Lesson, Move, Step, View } from './types.ts';
import { t as say, useT } from '../i18n/author.ts';
import './guide.css';

export const TAB_WORDS: Record<ConstructorTab, string> = {
  get sheet() { return TABS.sheet; },
  get dictionaries() { return TABS.rules; },
  get effects() { return TABS.effects; },
  get records() { return TABS.records; },
};

export const PAUSE_MS = 900;

export interface Point { prompt: string | null; target: HTMLElement | null }

export const movesOf = (step: Step): Move[] =>
  step.at === undefined ? [] : Array.isArray(step.at) ? step.at : [{ at: step.at }];

export const moveAt = (step: Step, view: View): number => {
  const moves = movesOf(step);
  const at = moves.findIndex(move => !move.done?.(view));
  return at < 0 ? moves.length - 1 : at;
};

export const moveOf = (step: Step, view: View): Move | undefined => movesOf(step)[moveAt(step, view)];

export const viewNow = (): View => {
  const state = useWorld.getState();
  return {
    system: state.system, tab: state.activeTab, effect: state.activeEffectId, record: state.activeRecordKind, sheetKind: state.activeSheetKind,
    block: state.activeBlock, field: state.activeFieldTag, opened: (name: string) => openedDialog(name),
    bar: useFormulaBar.getState().target?.value ?? null,
  };
};

export function pointOf(step: Step, tab: ConstructorTab, view: View = viewNow(), root: ParentNode = document): Point {
  if (step.tab && step.tab !== tab) {
    const word = TAB_WORDS[step.tab];
    const list = root.querySelector('[role="tablist"]') ?? root;
    return { prompt: say('guide:prompt.openTab', { name: word }), target: findAnchor({ text: word }, list) };
  }
  const fold = step.panel ? foldOf(step.panel, root) : null;
  if (fold) return { prompt: say('guide:prompt.unfold', { name: step.panel }), target: fold };
  return { prompt: null, target: firstOf(moveOf(step, view)?.at, root) ?? firstOf(step.via, root) };
}

function useDomTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    let timer: number | null = null;
    const observer = new MutationObserver(() => {
      if (timer !== null) return;
      timer = window.setTimeout(() => { timer = null; setTick(n => n + 1); }, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-selected', 'aria-label'] });
    return () => { observer.disconnect(); if (timer !== null) window.clearTimeout(timer); };
  }, []);
  return tick;
}

export function useView(): View {
  const system = useWorld(s => s.system);
  const tab = useWorld(s => s.activeTab);
  const effect = useWorld(s => s.activeEffectId);
  const record = useWorld(s => s.activeRecordKind);
  const sheetKind = useWorld(s => s.activeSheetKind);
  const block = useWorld(s => s.activeBlock);
  const field = useWorld(s => s.activeFieldTag);
  const bar = useFormulaBar(s => s.target?.value ?? null);
  return useMemo(() => ({ system, tab, effect, record, sheetKind, block, field, opened: (name: string) => openedDialog(name), bar }),
    [system, tab, effect, record, sheetKind, block, field, bar]);
}

const safeDone = (step: Step | undefined, view: View): boolean => {
  if (!step?.done) return false;
  try { return step.done(view); } catch { return false; }
};

export function GuideLayer() {
  const t = useT('guide');
  const id = useGuide(s => s.lesson);
  const note = useGuide(s => s.note);
  const dismiss = useGuide(s => s.dismiss);
  const run = useGuide(s => s.run);
  const finished = useGuide(s => s.finished);
  const lesson = lessonOf(id);
  if (lesson) return <LessonCard key={`${lesson.id}:${run}`} />;
  if (finished && lessonOf(finished)) return <FinishCard id={finished} />;
  if (!note) return null;
  return (
    <div className="guide">
      <Verdict tone="warn" action={<Button size="sm" variant="ghost" onClick={dismiss}>{t('ok')}</Button>}>{note}</Verdict>
    </div>
  );
}

export interface Place { chapter: number; chapters: number; step: number; steps: number; title: string; closes: boolean }

export function placeOf(lesson: Lesson, index: number): Place {
  const step = lesson.steps[index]!;
  const chapter = Math.max(0, lesson.chapters.findIndex(one => one.title === step.chapter));
  const same = lesson.steps.filter(one => one.chapter === step.chapter);
  const at = same.indexOf(step);
  return { chapter: chapter + 1, chapters: lesson.chapters.length, step: at + 1, steps: same.length, title: step.chapter, closes: at === same.length - 1 };
}

const trapOf = (step: Step, view: View): string | null => {
  for (const trap of step.traps ?? []) {
    try { if (trap.when(view)) return trap.say; } catch { continue; }
  }
  return null;
};

const resultOf = (step: Step, view: View): string => {
  try { return step.result?.(view) ?? say('guide:result.done'); } catch { return say('guide:result.done'); }
};

export const nextLesson = (id: string): Lesson | undefined => {
  const list = lessonsNow();
  const at = list.findIndex(one => one.id === id);
  return at < 0 ? undefined : list[at + 1];
};

function FinishCard({ id }: { id: string }) {
  const t = useT('guide');
  const lesson = lessonOf(id)!;
  const note = useGuide(s => s.note);
  const next = nextLesson(id);
  const sum = lesson.chapters.at(-1)?.sum;
  return (
    <div className="guide" role="region" aria-label={t('finish.title')}>
      <Card className="guide__card">
        <CardHead title={t('finish.title')} sub={lesson.title} />
        {sum ? <p className="guide__say">{sum}</p> : null}
        {next ? null : <p className="guide__sum">{t('finish.all')}</p>}
        {note ? <Verdict tone="bad">{note}</Verdict> : null}
        <div className="guide__actions">
          {next ? <Button size="sm" variant="primary" onClick={() => void useGuide.getState().start(next.id)}>{t('finish.next', { title: next.title })}</Button> : null}
          <span className="spacer" />
          <Button size="sm" variant={next ? 'ghost' : 'primary'} onClick={() => useGuide.getState().closeFinish()}>{t('finish.close')}</Button>
        </div>
      </Card>
    </div>
  );
}

function LessonCard() {
  const t = useT('guide');
  const id = useGuide(s => s.lesson);
  const at = useGuide(s => s.step);
  const folded = useGuide(s => s.folded);
  const note = useGuide(s => s.note);
  const { go, fold, exit, finish, keep } = useGuide.getState();
  const lesson = lessonOf(id)!;
  const index = Math.min(at, lesson.steps.length - 1);
  const step = lesson.steps[index]!;
  const last = index === lesson.steps.length - 1;
  const key = `${lesson.id}:${index}`;
  const place = placeOf(lesson, index);

  const view = useView();
  const tick = useDomTick();
  const done = useMemo(() => safeDone(step, view), [step, view, tick]);

  const reached = useRef(index);
  const [entry, setEntry] = useState<{ key: string; already: boolean }>(() => ({ key, already: done }));
  const [got, setGot] = useState<string | null>(null);
  const current = entry.key === key ? entry : { key, already: done };
  if (entry.key !== key) {
    setEntry(current);
    if (got !== null) setGot(null);
  }
  const revisit = index < reached.current;

  useEffect(() => { reached.current = Math.max(reached.current, index); }, [index]);

  useEffect(() => {
    if (!step.done || current.already || !done || got === key) return;
    setGot(key);
  }, [done, key]);

  useEffect(() => {
    if (got !== key || last || place.closes || revisit || !done) return undefined;
    const timer = window.setTimeout(() => { if (useGuide.getState().step === index) go(index + 1); }, PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [got, key, revisit, done]);

  const tab = useWorld(s => s.activeTab);
  const point = step.alone ? { prompt: null, target: null } : pointOf(step, tab, view);
  const move = moveAt(step, view);
  const said = movesOf(step).map(one => one.say).filter((text): text is string => Boolean(text));
  const success = got === key && done && !revisit;
  const already = Boolean(step.done && (current.already || revisit) && done);
  const free = !step.done || done || got === key;
  const trap = done || success ? null : trapOf(step, view);
  const hint = moveOf(step, view)?.hint ?? step.hint;
  const where = t('card.where', { chapter: place.chapter, chapters: place.chapters, step: place.step, steps: place.steps });
  const sum = place.closes && (done || success || !step.done) ? lesson.chapters[place.chapter - 1]?.sum : undefined;

  const next = () => { if (last) void finish(); else go(index + 1); };

  const host = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(false);
  const aside = (box: Box | null) => {
    const card = host.current?.getBoundingClientRect();
    if (!box || !card) return;
    const margin = left ? card.left : window.innerWidth - card.right;
    const hits = (from: number) => box.left < from + card.width && box.left + box.width > from
      && box.top < card.bottom && box.top + box.height > card.top;
    setLeft(hits(window.innerWidth - margin - card.width) && !hits(margin));
  };

  return (
    <>
      {folded || step.alone || (step.done && (done || success)) ? null : <Spot place={`${key}|${move}|${point.prompt ?? ''}`} target={() => pointOf(step, useWorld.getState().activeTab).target} onBox={aside} />}
      <div ref={host} className={left ? 'guide guide--left' : 'guide'} role="region" aria-label={t('card.region')}>
        {folded ? (
          <button type="button" className="guide__strip" onClick={() => fold(false)}>
            {t('card.strip', { title: place.title, step: place.step, steps: place.steps })}
          </button>
        ) : (
          <Card className="guide__card">
            <CardHead title={lesson.title} sub={`${where} · ${place.title}`}
              actions={<Button size="sm" variant="ghost" title={t('card.foldTitle')} onClick={() => fold(true)}>{t('common:collapse')}</Button>} />
            {step.lead ? <p className="guide__lead">{step.lead}</p> : null}
            {index === 0 && lesson.start ? <p className="guide__lead">{t('card.start', { text: lesson.start })}</p> : null}
            {point.prompt ? <p className="guide__prompt">{point.prompt}</p> : null}
            <p className="guide__say">{step.alone ? <b>{t('card.alone')}</b> : null}{step.say}</p>
            {step.alone && step.goal ? <p className="guide__goal"><b>{t('card.goal')}</b>{step.goal}</p> : null}
            {said.length > 1 ? (
              <ol className="guide__moves">
                {said.map((text, at) => (
                  <li key={at} className={at < move || done || success ? 'guide__move guide__move--done' : at === move ? 'guide__move guide__move--now' : 'guide__move'}>{text}</li>
                ))}
              </ol>
            ) : null}
            {success || already ? <Verdict tone="ok">{already ? t('result.already', { result: resultOf(step, view) }) : resultOf(step, view)}</Verdict> : null}
            {trap ? <Verdict tone="warn">{trap}</Verdict> : null}
            {sum ? <p className="guide__sum">{t('card.sum', { title: place.title, sum })}</p> : null}
            {hint ? <Fold key={hint} title={step.alone ? t('card.hintAlone') : t('card.hintStuck')}><p className="guide__hint">{hint}</p></Fold> : null}
            {note ? <Verdict tone="bad">{note}</Verdict> : null}
            <div className="guide__actions">
              <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => go(index - 1)}>{t('card.back')}</Button>
              {free ? <Button size="sm" variant="primary" onClick={next}>{last ? t('card.end') : t('card.next')}</Button> : null}
              <span className="spacer" />
              <Button size="sm" variant="ghost" title={t('card.keepTitle')} onClick={() => void keep()}>{t('card.keep')}</Button>
              <Button size="sm" variant="ghost" title={t('card.exitTitle')} onClick={() => void exit()}>{t('card.exit')}</Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

export function GuideButton() {
  const t = useT('guide');
  const id = useGuide(s => s.lesson);
  const folded = useGuide(s => s.folded);
  const passed = useGuide(s => s.passed);
  const started = useGuide(s => s.started);
  const note = useGuide(s => s.note);
  const [open, setOpen] = useState(false);
  const running = lessonOf(id);

  const begin = async (lesson: string, again: boolean) => {
    if (await useGuide.getState().start(lesson, again)) setOpen(false);
  };

  return (
    <>
      <Button size="sm" title={running ? t('button.runningTitle') : t('button.title')}
        onClick={() => (running ? useGuide.getState().fold(!folded) : setOpen(true))}>
        {running ? t('button.running', { title: running.title }) : t('button.label')}
      </Button>
      <Drawer open={open} title={t('drawer.title')} sub={t('drawer.sub')}
        onClose={() => setOpen(false)}>
        <div className="stack">
          {note && !running ? <Verdict tone="bad">{note}</Verdict> : null}
          {lessonsNow().map(lesson => {
            const was = passed.includes(lesson.id);
            const from = started[lesson.id];
            const actions = from === undefined
              ? <Button size="sm" variant={was ? 'ghost' : 'primary'} onClick={() => void begin(lesson.id, false)}>{was ? t('drawer.again') : t('drawer.begin')}</Button>
              : <>
                <Button size="sm" variant="primary" onClick={() => void begin(lesson.id, false)}>{t('drawer.resume')}</Button>
                <Button size="sm" variant="ghost" onClick={() => void begin(lesson.id, true)}>{t('drawer.restart')}</Button>
              </>;
            const tags = <>
              {was ? <span className="tag tag--done guide-lesson__tag">{t('drawer.passed')}</span> : null}
              {from !== undefined ? <span className="tag guide-lesson__tag">{t('drawer.stopped', { n: from + 1, total: lesson.steps.length })}</span> : null}
            </>;
            return (
              <Card key={lesson.id} className="guide-lesson">
                <CardHead title={lesson.title} sub={lesson.sub} badge={tags} actions={actions} />
              </Card>
            );
          })}
        </div>
      </Drawer>
    </>
  );
}
