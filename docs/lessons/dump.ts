import { writeFileSync } from 'node:fs';
import { LESSONS } from '../../apps/web/src/guide/lessons/index.ts';

const anchorWords = (at: unknown): string[] => (Array.isArray(at) ? at : at ? [at] : []).flatMap(one => {
  const anchor = one as Record<string, unknown>;
  if ('say' in anchor || 'done' in anchor) return [];
  return [String(anchor.text ?? anchor.field ?? anchor.guide ?? anchor.input ?? '')];
});

const out = LESSONS.map(lesson => ({
  id: lesson.id, title: lesson.title, sub: lesson.sub,
  chapters: lesson.chapters.map(chapter => ({
    title: chapter.title, sum: chapter.sum,
    steps: lesson.steps.filter(step => step.chapter === chapter.title).map(step => ({
      id: step.id, lead: step.lead ?? '', say: step.say, hint: step.hint ?? '',
      moves: Array.isArray(step.at) ? step.at.map(move => move.say ?? '') : [],
      where: anchorWords(Array.isArray(step.at) ? step.at.map(move => move.at).flat() : step.at),
      check: String(step.done ?? (Array.isArray(step.at) ? step.at.map(move => String(move.done ?? '')).join(' && ') : '')).replace(/\s+/g, ' '),
    })),
  })),
}));
writeFileSync(process.argv[2]!, JSON.stringify(out, null, 2));
console.log(out.length, 'уроков,', out.reduce((sum, lesson) => sum + lesson.chapters.reduce((n, chapter) => n + chapter.steps.length, 0), 0), 'шагов');
