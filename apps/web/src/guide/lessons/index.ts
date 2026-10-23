import type { Lesson } from '../types.ts';
import { firstSystem } from './first-system.ts';
import { tables } from './tables.ts';
import { links } from './links.ts';
import { items } from './items.ts';
import { ready } from './ready.ts';

export const LESSONS: Lesson[] = [firstSystem, tables, links, items, ready];

export const lessonOf = (id: string | null | undefined): Lesson | undefined => LESSONS.find(lesson => lesson.id === id);
