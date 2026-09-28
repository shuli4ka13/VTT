import piecesData from '../../../../samples/pieces.json' with { type: 'json' };
import { SAMPLE_SYSTEMS } from './systems.ts';
import { blockParts, bringIn } from './bring.ts';
import type { Brought, Part } from './bring.ts';
import type { System } from './types.ts';

export type Root =
  | { block: string } | { effects: string } | { effect: string }
  | { recordKind: string } | { rollEdit: string } | { table: string };

export interface Piece {
  id: string;
  donor: string;
  label: string;
  hint: string;
  take: Root[];
  grants?: string[];
}

export const PIECES: Piece[] = piecesData as Piece[];

export const donorOf = (piece: Piece): System | undefined => SAMPLE_SYSTEMS.find(system => system.id === piece.donor);

export function rootsOf(donor: System, piece: Piece): Part[] {
  return piece.take.flatMap((root): Part[] => {
    if ('block' in root) return blockParts(donor, root.block);
    if ('effects' in root) {
      return Object.entries(donor.effects).filter(([, e]) => e.group === root.effects).map(([key]) => ({ kind: 'effect', key }));
    }
    if ('effect' in root) return [{ kind: 'effect', key: root.effect }];
    if ('recordKind' in root) return [{ kind: 'recordKind', key: root.recordKind }];
    if ('rollEdit' in root) return [{ kind: 'rollEdit', key: root.rollEdit }];
    return [{ kind: 'table', key: root.table }];
  });
}

export function bringPiece(target: System, piece: Piece): Brought {
  const donor = donorOf(piece);
  if (!donor) return { system: target, added: [], kept: [] };
  return bringIn(target, donor, rootsOf(donor, piece), piece.grants ?? []);
}
