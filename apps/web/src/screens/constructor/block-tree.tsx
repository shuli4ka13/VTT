import type { ReactNode } from 'react';
import { ListGroup } from '../../ui/layout.tsx';
import { Button } from '../../ui/primitives.tsx';
import { useOpened } from '../../store/opened.ts';
import { groupChain } from './groups.ts';
import { NO_BLOCK, blockNames } from '@vtt/engine';
import type { System } from '@vtt/schema';

export interface BlockNode<T> {
  name: string;
  items: T[];
  children: BlockNode<T>[];
}

export function blockTree<T>(system: System, items: T[], blockOfItem: (item: T) => string | undefined, keepEmpty: boolean | ((name: string) => boolean) = false): BlockNode<T>[] {
  const inside = new Map<string, T[]>();
  const order: string[] = [];
  const remember = (name: string) => {
    if (inside.has(name)) return;
    inside.set(name, []);
    order.push(name);
  };

  for (const item of items) {
    const name = blockOfItem(item) ?? NO_BLOCK;
    remember(name);
    inside.get(name)!.push(item);
  }
  for (const name of blockNames(system)) remember(name);

  const nodes = new Map<string, BlockNode<T>>();
  for (const name of order) nodes.set(name, { name, items: inside.get(name)!, children: [] });

  const roots: BlockNode<T>[] = [];
  for (const name of order) {
    const node = nodes.get(name)!;
    const parent = system.groups?.[name]?.parent;
    const cyclic = parent !== undefined && groupChain(system, parent).includes(name);
    if (parent !== undefined && !cyclic && nodes.has(parent)) nodes.get(parent)!.children.push(node);
    else roots.push(node);
  }

  const empty = (name: string): boolean => (typeof keepEmpty === 'function' ? keepEmpty(name) : keepEmpty);
  const alive = (node: BlockNode<T>): boolean => node.items.length > 0 || node.children.some(alive) || empty(node.name);
  const keep = (list: BlockNode<T>[]): BlockNode<T>[] => list
    .filter(alive)
    .map(node => ({ ...node, children: keep(node.children) }));
  return keep(roots);
}

export interface Lineage<T> {
  keyOf: (item: T) => string;
  baseOf: (item: T) => string | undefined;
}

function byLineage<T>(items: T[], line: Lineage<T>): { item: T; depth: number }[] {
  const mine = new Set(items.map(line.keyOf));
  const kids = new Map<string, T[]>();
  const roots: T[] = [];

  for (const item of items) {
    const base = line.baseOf(item);
    if (base && mine.has(base) && base !== line.keyOf(item)) {
      const list = kids.get(base);
      if (list) list.push(item); else kids.set(base, [item]);
    } else roots.push(item);
  }

  const out: { item: T; depth: number }[] = [];
  const walk = (item: T, depth: number) => {
    out.push({ item, depth });
    for (const kid of kids.get(line.keyOf(item)) ?? []) walk(kid, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return out;
}

const holds = <T,>(node: BlockNode<T>, active: (item: T) => boolean): boolean =>
  node.items.some(active) || node.children.some(child => holds(child, active));

const count = <T,>(node: BlockNode<T>): number =>
  node.items.length + node.children.reduce((sum, child) => sum + count(child), 0);

export function BlockBranches<T>({ list, nodes, depth = 0, onPickBlock, activeBlock, render, addTo, lineage, isActive, isFresh }: {
  list: string;
  nodes: BlockNode<T>[];
  depth?: number;
  activeBlock?: string | null;
  onPickBlock?: (name: string) => void;
  render: (item: T) => ReactNode;
  addTo?: (name: string) => void;
  lineage?: Lineage<T>;
  isActive?: (item: T) => boolean;
  isFresh?: (item: T) => boolean;
}) {
  const opened = useOpened(s => s.opened);
  const toggle = useOpened(s => s.toggle);
  return (
    <>
      {nodes.map(node => {
        const key = `list|${list}|${node.name}`;
        const open = Boolean(opened[key]) || (isActive ? holds(node, isActive) : false) || node.name === activeBlock
          || (isFresh ? holds(node, isFresh) : false);
        return (
          <div key={node.name} className={depth ? 'list__nest' : undefined}>
            <ListGroup>
              <span className="list__group-head">
                <button
                  type="button" className="list__fold" aria-expanded={open}
                  aria-label={open ? `свернуть «${node.name}»` : `развернуть «${node.name}»`}
                  onClick={() => toggle(key)}
                >{open ? '▾' : '▸'}</button>
                {onPickBlock ? (
                  <button
                    type="button"
                    className={`list__group-pick${node.name === activeBlock ? ' list__group-pick--active' : ''}`}
                    title="настройки блока"
                    onClick={() => onPickBlock(node.name)}
                  >{node.name}</button>
                ) : <button type="button" className="list__group-pick" onClick={() => toggle(key)}>{node.name}</button>}
                {open ? null : <span className="list__group-count">{count(node)}</span>}
              </span>
            </ListGroup>

            {open ? (
              <>
                {lineage
                  ? byLineage(node.items, lineage).map(({ item, depth: at }) => (
                    at
                      ? <div key={lineage.keyOf(item)} className="list__nest">{render(item)}</div>
                      : render(item)
                  ))
                  : node.items.map(render)}

                {addTo ? (
                  <Button size="sm" variant="ghost" wide onClick={() => addTo(node.name)}>
                    + в «{node.name}»
                  </Button>
                ) : null}

                <BlockBranches
                  list={list} nodes={node.children} depth={depth + 1} activeBlock={activeBlock}
                  onPickBlock={onPickBlock} render={render} addTo={addTo} lineage={lineage}
                  {...(isActive ? { isActive } : {})}
                  {...(isFresh ? { isFresh } : {})}
                />
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
