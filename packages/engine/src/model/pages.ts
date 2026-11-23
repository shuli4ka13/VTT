import type { SheetBlock, SheetPage, SheetList } from '@vtt/schema';
import type { System } from './types.ts';

export const SHEET_LIST_KEYS: readonly SheetList[] = ['hanging', 'things', 'actions'];

export const pagesOf = (system: System): SheetPage[] => system.pages ?? [];

export const topPage = (system: System): SheetPage | undefined => pagesOf(system).find(page => page.top);

export const tabPages = (system: System): SheetPage[] => pagesOf(system).filter(page => !page.top);

export function pageOfBlock(system: System, name: string): string | undefined {
  const pages = pagesOf(system);
  if (!pages.length) return undefined;
  const blocks = system.blocks ?? [];
  let at = blocks.find(block => block.key === name);
  const seen = new Set<string>();
  while (at && !seen.has(at.key)) {
    if (at.page && pages.some(page => page.key === at!.page)) return at.page;
    seen.add(at.key);
    at = at.parent ? blocks.find(block => block.key === at!.parent) : undefined;
  }
  return tabPages(system)[0]?.key ?? pages[0]!.key;
}

export const blockOfList = (system: System, list: SheetList): string | undefined =>
  (system.blocks ?? []).find(block => block.list === list)?.key;

export const GRID = 12;

export interface Cell { width: number; blocks: string[] }

const clampWidth = (width: number | undefined): number => Math.min(GRID, Math.max(1, Math.round(width ?? GRID)));

export function topBlocksOn(system: System, page: string | undefined): SheetBlock[] {
  return (system.blocks ?? []).filter(block => page === undefined || pageOfBlock(system, block.key) === page);
}

export function cellsOf(system: System, page: string | undefined): Cell[] {
  const out: Cell[] = [];
  for (const block of topBlocksOn(system, page)) {
    const last = out[out.length - 1];
    if (block.under && last) last.blocks.push(block.key);
    else out.push({ width: clampWidth(block.width), blocks: [block.key] });
  }
  return out;
}

export function cellHead(system: System, name: string): SheetBlock | undefined {
  const own = (system.blocks ?? []).find(block => block.key === name);
  if (!own) return undefined;
  const page = pagesOf(system).length ? pageOfBlock(system, own.key) : undefined;
  const cell = cellsOf(system, page).find(one => one.blocks.includes(own.key));
  return cell ? (system.blocks ?? []).find(block => block.key === cell.blocks[0]) : own;
}

export function setWidth(system: System, name: string, width: number): void {
  const head = cellHead(system, name);
  if (!head) return;
  const next = clampWidth(width);
  if (next === GRID) delete head.width; else head.width = next;
}

export const HEIGHT_STEP = 10;

export function setHeight(system: System, name: string, height: number | undefined): void {
  const block = (system.blocks ?? []).find(one => one.key === name);
  if (!block) return;
  if (height === undefined) { delete block.height; return; }
  block.height = Math.min(3000, Math.max(40, Math.round(height / HEIGHT_STEP) * HEIGHT_STEP));
}

export type Place = 'before' | 'after' | 'under';

export function placeBlock(system: System, name: string, target: string, where: Place): void {
  const blocks = system.blocks ?? [];
  const moving = blocks.find(block => block.key === name);
  const anchor = blocks.find(block => block.key === target);
  if (!moving || !anchor || moving.key === anchor.key) return;
  const hasPages = pagesOf(system).length > 0;
  const pageOf = (block: SheetBlock) => (hasPages ? pageOfBlock(system, block.key) : undefined);
  const own = cellsOf(system, pageOf(moving)).find(cell => cell.blocks.includes(moving.key));
  if (own && own.blocks[0] === moving.key && own.blocks.length > 1) {
    const heir = blocks.find(block => block.key === own.blocks[1])!;
    delete heir.under;
    if (moving.width !== undefined) heir.width = moving.width; else delete heir.width;
  }
  const targetCell = cellsOf(system, pageOf(anchor)).find(cell => cell.blocks.includes(anchor.key));
  if (hasPages) {
    const page = pageOfBlock(system, anchor.key);
    delete moving.page;
    if (pageOfBlock(system, moving.key) !== page) moving.page = page;
  }
  const without = blocks.filter(block => block !== moving);
  const indexOf = (blockName: string) => without.findIndex(block => block.key === blockName);
  let at: number;
  if (where === 'under') {
    at = indexOf(anchor.key) + 1;
    moving.under = true;
    delete moving.width;
  } else {
    const cellNames = (targetCell?.blocks ?? [anchor.key]).filter(one => one !== moving.key);
    at = where === 'before' ? indexOf(cellNames[0]!) : indexOf(cellNames[cellNames.length - 1]!) + 1;
    delete moving.under;
  }
  without.splice(Math.max(0, at), 0, moving);
  system.blocks = without;
}
export const pageLabel = (system: System, key: string): string =>
  pagesOf(system).find(page => page.key === key)?.label ?? key;

export function labelPage(system: System, key: string, label: string): void {
  const page = pagesOf(system).find(one => one.key === key);
  if (!page) return;
  if (label && label !== key) page.label = label; else delete page.label;
}

export function removePage(system: System, name: string): void {
  system.pages = (system.pages ?? []).filter(page => page.key !== name);
  if (!system.pages.length) delete system.pages;
  for (const block of system.blocks ?? []) if (block.page === name) delete block.page;
}

export function tidyPages(system: System): void {
  const names = new Set(pagesOf(system).map(page => page.key));
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

