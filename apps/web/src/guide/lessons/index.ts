import type { Lesson } from '../types.ts';
import { offered } from '../lazy.ts';
import { firstSystem } from './first-system.ts';
import { tables } from './tables.ts';
import { links } from './links.ts';
import { items } from './items.ts';
import { tags } from './tags.ts';
import { spells } from './spells.ts';
import { templates } from './templates.ts';
import { combat } from './combat.ts';
import { ready } from './ready.ts';

export const LESSONS: Lesson[] = [firstSystem, tables, links, items, tags, spells, templates, combat, ready];

export const lessonOf = (id: string | null | undefined): Lesson | undefined => LESSONS.find(lesson => lesson.id === id);

export const lessonsNow = (): Lesson[] => LESSONS.filter(lesson => offered(lesson));
