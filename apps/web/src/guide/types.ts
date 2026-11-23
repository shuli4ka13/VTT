import type { System } from '@vtt/schema';
import type { ConstructorTab } from '../store/world.ts';

export type Anchor =
  | { text: string; in?: string }
  | { field: string }
  | { guide: string }
  | { input: string };

export interface View {
  system: System;
  tab: ConstructorTab;
  effect: string | null;
  record: string | null;
  sheetKind: string | null;
  block: string | null;
  field: string | null;
  opened: (name: string) => boolean;
  bar?: string | null;
}

export interface Trap {
  when: (view: View) => boolean;
  say: string;
}

export interface Move {
  at: Anchor | Anchor[];
  say?: string;
  hint?: string;
  done?: (view: View) => boolean;
  maybe?: boolean;
}

export interface Chapter {
  title: string;
  sum: string;
}

export interface Step {
  id: string;
  chapter: string;
  lead?: string;
  say: string;
  alone?: boolean;
  goal?: string;
  traps?: Trap[];
  result?: (view: View) => string;
  hint?: string;
  tab?: ConstructorTab;
  panel?: string;
  at?: Anchor | Move[];
  via?: Anchor | Anchor[];
  done?: (view: View) => boolean;
}

export interface Lesson {
  id: string;
  langs?: readonly string[];
  title: string;
  sub: string;
  start?: string;
  seed: System;
  tab: ConstructorTab;
  chapters: Chapter[];
  steps: Step[];
}
