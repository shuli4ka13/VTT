import { compile, AND, OR, NOT, FUNCTION_SPECS, DICE_BY_STEP } from '@vtt/engine';
import type { Node } from '@vtt/engine';

export type Shape = 'number' | 'text' | 'bool' | 'any';

const NUMBERS = new Set(FUNCTION_SPECS.filter(one => one.result === 'number').map(one => one.name));
const BOOLS = new Set(FUNCTION_SPECS.filter(one => one.result === 'bool').map(one => one.name));
const MATH = new Set(['+', '-', '*', '/']);
const COMPARE = new Set(['==', '!=', '<', '<=', '>', '>=']);

const isDice = (node: Node): boolean => node.kind === 'Text' && node.dice === true;

class Clash {
  constructor(readonly text: string) {}
}

function shapeOf(node: Node, named: (tag: string) => Shape): Shape {
  switch (node.kind) {
    case 'Number': return 'number';
    case 'Text': return 'text';
    case 'Bool': return 'bool';
    case 'Ref': return named(node.tag);
    case 'Pick': return 'any';
    case 'Unary': {
      if (isDice(node.operand)) throw new Clash(DICE_BY_STEP);
      const inner = shapeOf(node.operand, named);
      if (node.op === NOT) return 'bool';
      if (node.op === '-' && inner === 'text') throw new Clash('минус перед словом');
      return node.op === '-' ? 'number' : inner;
    }
    case 'Binary': {
      const left = shapeOf(node.left, named);
      const right = shapeOf(node.right, named);
      if (COMPARE.has(node.op)) return 'bool';
      if (node.op === AND) return left === 'bool' && right === 'bool' ? 'bool' : 'any';
      if (node.op === OR) return left === right ? left : 'any';
      if (!MATH.has(node.op)) return 'any';
      if (isDice(node.left) || isDice(node.right)) throw new Clash(DICE_BY_STEP);
      if (left === 'text' || right === 'text') throw new Clash('слово нельзя складывать и умножать с числом');
      return 'number';
    }
    case 'Conditional': {
      shapeOf(node.test, named);
      const then = shapeOf(node.then, named);
      const otherwise = shapeOf(node.otherwise, named);
      return then === otherwise ? then : 'any';
    }
    case 'Call': {
      for (const arg of node.args) shapeOf(arg, named);
      return NUMBERS.has(node.name) ? 'number' : BOOLS.has(node.name) ? 'bool' : 'any';
    }
  }
}

export function shapeProblem(text: string, want: string, named: (tag: string) => Shape): string | null {
  let ast: Node;
  try { ast = compile(text).ast; } catch { return null; }
  let got: Shape;
  try {
    got = shapeOf(ast, named);
  } catch (error) {
    if (error instanceof Clash) return error.text;
    throw error;
  }
  if (want === 'number' && got === 'text') return 'нужно число, а здесь слово';
  if ((want === 'choice' || want === 'text') && got === 'number') return 'нужно слово, а здесь число';
  return null;
}

export const shapeOfKind = (kind: string | undefined): Shape =>
  kind === undefined || kind === 'number' ? 'number' : kind === 'boolean' ? 'bool' : kind === 'record' ? 'any' : 'text';
