import type { SheetBlock, SheetPage, SheetList } from '@vtt/schema';
import type { System } from './types.ts';

export const SHEET_LIST_KEYS: readonly SheetList[] = ['hanging', 'things', 'actions'];

export const pagesOf = (system: System): SheetPage[] => system.pages ?? [];

export const topPage = (system: System): SheetPage | undefined => pagesOf(system).find(page => page.top);

export const tabPages = (system: System): SheetPage[] => pagesOf(system).filter(page => !page.top);

export function rootBlock(system: System, name: string): SheetBlock | undefined {
  const blocks = system.blocks ?? [];
  let at = blocks.find(block => block.name === name);
  const seen = new Set<string>();
  while (at?.parent && !seen.has(at.name)) {
    seen.add(at.name);
    const parent = blocks.find(block => block.name === at!.parent);
    if (!parent) break;
    at = parent;
  }
  return at;
}

export function pageOfBlock(system: System, name: string): string | undefined {
  const pages = pagesOf(system);
  if (!pages.length) return undefined;
  const own = rootBlock(system, name)?.page;
  if (own && pages.some(page => page.name === own)) return own;
  return tabPages(system)[0]?.name ?? pages[0]!.name;
}

export const blockOfList = (system: System, list: SheetList): string | undefined =>
  (system.blocks ?? []).find(block => block.list === list)?.name;

export type Band<T> = { wide: T } | { stacks: T[][] };

export function bandsOf<T>(items: readonly T[], stacks: number, place: (item: T) => { stack?: number; wide?: boolean }): Band<T>[] {
  const count = Math.max(1, stacks);
  const out: Band<T>[] = [];
  let open: T[][] | null = null;
  for (const item of items) {
    const { stack, wide } = place(item);
    if (wide && count > 1) { out.push({ wide: item }); open = null; continue; }
    if (!open) { open = Array.from({ length: count }, () => []); out.push({ stacks: open }); }
    open[Math.min(Math.max(stack ?? 1, 1), count) - 1]!.push(item);
  }
  return out;
}

export function renamePage(system: System, from: string, to: string): void {
  if (from === to) return;
  for (const page of system.pages ?? []) if (page.name === from) page.name = to;
  for (const block of system.blocks ?? []) if (block.page === from) block.page = to;
}

export function removePage(system: System, name: string): void {
  system.pages = (system.pages ?? []).filter(page => page.name !== name);
  if (!system.pages.length) delete system.pages;
  for (const block of system.blocks ?? []) if (block.page === name) delete block.page;
}

export function tidyPages(system: System): void {
  const names = new Set(pagesOf(system).map(page => page.name));
  const placed = new Set<SheetList>();
  for (const block of system.blocks ?? []) {
    if (block.page && !names.has(block.page)) delete block.page;
    if (block.list && placed.has(block.list)) delete block.list;
    else if (block.list) placed.add(block.list);
    if (block.kinds) {
      const kinds = block.list === 'things' ? block.kinds.filter(kind => system.tables?.[kind]) : [];
      if (kinds.length) block.kinds = kinds; else delete block.kinds;
    }
  }
}
