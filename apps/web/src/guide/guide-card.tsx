import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld } from '../store/world.ts';
import type { ConstructorTab } from '../store/world.ts';
import { useGuide } from '../store/guide.ts';
import { Button, Card, CardHead, Drawer, Fold, Verdict } from '../ui/primitives.tsx';
import { TABS } from '../words.ts';
import { LESSONS, lessonOf } from './lessons/index.ts';
import { findAnchor, firstOf, foldOf, openedDialog } from './anchor.ts';
import { Spot } from './spot.tsx';
import type { Lesson, Step, View } from './types.ts';
import './guide.css';

export const TAB_WORDS: Record<ConstructorTab, string> = {
  sheet: TABS.sheet,
  dictionaries: TABS.rules,
  effects: TABS.effects,
  records: TABS.records,
};

export const PAUSE_MS = 900;

export interface Point { prompt: string | null; target: HTMLElement | null }

export function pointOf(step: Step, tab: ConstructorTab, root: ParentNode = document): Point {
  if (step.tab && step.tab !== tab) {
    const word = TAB_WORDS[step.tab];
    const list = root.querySelector('[role="tablist"]') ?? root;
    return { prompt: `Откройте вкладку «${word}».`, target: findAnchor({ text: word }, list) };
  }
  const fold = step.panel ? foldOf(step.panel, root) : null;
  if (fold) return { prompt: `Разверните панель «${step.panel}».`, target: fold };
  return { prompt: null, target: findAnchor(step.at, root) ?? firstOf(step.via, root) };
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
  const block = useWorld(s => s.activeBlock);
  const field = useWorld(s => s.activeFieldTag);
  return useMemo(() => ({ system, tab, effect, record, block, field, opened: (name: string) => openedDialog(name) }),
    [system, tab, effect, record, block, field]);
}

const safeDone = (step: Step | undefined, view: View): boolean => {
  if (!step?.done) return false;
  try { return step.done(view); } catch { return false; }
};

export function GuideLayer() {
  const id = useGuide(s => s.lesson);
  const note = useGuide(s => s.note);
  const dismiss = useGuide(s => s.dismiss);
  const run = useGuide(s => s.run);
  const lesson = lessonOf(id);
  if (lesson) return <LessonCard key={`${lesson.id}:${run}`} />;
  if (!note) return null;
  return (
    <div className="guide">
      <Verdict tone="warn" action={<Button size="sm" variant="ghost" onClick={dismiss}>Понятно</Button>}>{note}</Verdict>
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
  try { return step.result?.(view) ?? 'получилось'; } catch { return 'получилось'; }
};

function LessonCard() {
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
  if (entry.key !== key) setEntry(current);
  const revisit = index < reached.current;

  useEffect(() => { reached.current = Math.max(reached.current, index); }, [index]);

  useEffect(() => {
    if (!step.done || current.already || revisit || !done || got === key) return undefined;
    setGot(key);
    if (last || place.closes) return undefined;
    const timer = window.setTimeout(() => { if (useGuide.getState().step === index) go(index + 1); }, PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [done, key]);

  const tab = useWorld(s => s.activeTab);
  const point = step.alone ? { prompt: null, target: null } : pointOf(step, tab);
  const success = got === key && done;
  const already = Boolean(step.done && (current.already || revisit) && done);
  const free = !step.done || current.already || revisit || done;
  const trap = done ? null : trapOf(step, view);
  const where = `глава ${place.chapter} из ${place.chapters} · шаг ${place.step} из ${place.steps}`;
  const sum = place.closes && (done || !step.done) ? lesson.chapters[place.chapter - 1]?.sum : undefined;

  const next = () => { if (last) void finish(); else go(index + 1); };

  return (
    <>
      {folded || step.alone ? null : <Spot place={`${key}|${point.prompt ?? ''}`} target={() => pointOf(step, useWorld.getState().activeTab).target} />}
      <div className="guide" role="region" aria-label="Урок">
        {folded ? (
          <button type="button" className="guide__strip" onClick={() => fold(false)}>
            Урок · {place.title} · шаг {place.step} из {place.steps}
          </button>
        ) : (
          <Card className="guide__card">
            <CardHead title={lesson.title} sub={`${where} · ${place.title}`}
              actions={<Button size="sm" variant="ghost" title="свернуть в полоску" onClick={() => fold(true)}>свернуть</Button>} />
            {step.lead ? <p className="guide__lead">{step.lead}</p> : null}
            {point.prompt ? <p className="guide__prompt">{point.prompt}</p> : null}
            <p className="guide__say">{step.alone ? <b>Сами: </b> : null}{step.say}</p>
            {success || already ? <Verdict tone="ok">{already ? `уже сделано: ${resultOf(step, view)}` : resultOf(step, view)}</Verdict> : null}
            {trap ? <Verdict tone="warn">похоже, {trap}</Verdict> : null}
            {sum ? <p className="guide__sum">Глава «{place.title}»: {sum}</p> : null}
            {step.hint ? <Fold title={step.alone ? 'подсказка' : 'не получается?'}><p className="guide__hint">{step.hint}</p></Fold> : null}
            {note ? <Verdict tone="bad">{note}</Verdict> : null}
            <div className="guide__actions">
              <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => go(index - 1)}>Назад</Button>
              {free ? <Button size="sm" variant="primary" onClick={next}>{last ? 'Завершить урок' : 'Дальше'}</Button> : null}
              <span className="spacer" />
              <Button size="sm" variant="ghost" title="учебная копия станет вашей новой системой" onClick={() => void keep()}>Оставить как новую систему</Button>
              <Button size="sm" variant="ghost" title="ваша система вернётся, урок продолжится с этого шага" onClick={() => void exit()}>Выйти из урока</Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

export function GuideButton() {
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
      <Button size="sm" title={running ? 'урок идёт на учебной копии' : 'уроки по конструктору'}
        onClick={() => (running ? useGuide.getState().fold(!folded) : setOpen(true))}>
        {running ? `Урок: ${running.title}` : 'Обучение'}
      </Button>
      <Drawer open={open} title="Обучение" sub="Урок идёт на учебной копии: ваша система не меняется и вернётся после урока."
        onClose={() => setOpen(false)}>
        <div className="stack">
          {note && !running ? <Verdict tone="bad">{note}</Verdict> : null}
          {LESSONS.map(lesson => {
            const was = passed.includes(lesson.id);
            const from = started[lesson.id];
            const actions = from === undefined
              ? <Button size="sm" variant={was ? 'ghost' : 'primary'} onClick={() => void begin(lesson.id, false)}>{was ? 'Пройти снова' : 'Начать'}</Button>
              : <>
                <Button size="sm" variant="primary" onClick={() => void begin(lesson.id, false)}>Продолжить</Button>
                <Button size="sm" variant="ghost" onClick={() => void begin(lesson.id, true)}>Начать заново</Button>
              </>;
            const tags = <>
              {was ? <span className="tag tag--done guide-lesson__tag">пройдено</span> : null}
              {from !== undefined ? <span className="tag guide-lesson__tag">остановились: шаг {from + 1} из {lesson.steps.length}</span> : null}
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
