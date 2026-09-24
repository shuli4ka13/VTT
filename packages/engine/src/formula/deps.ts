import type { Node } from './ast.ts';

export function dependencies(ast: Node): string[] {
  const found: string[] = [];
  walk(ast);
  return found;

  function walk(node: Node): void {
    switch (node.kind) {
      case 'Number':
      case 'Text':
      case 'Bool':
        return;
      case 'Ref':
        if (!found.includes(node.tag)) found.push(node.tag);
        return;
      case 'Unary':
        walk(node.operand);
        return;
      case 'Binary':
        walk(node.left);
        walk(node.right);
        return;
      case 'Call':
        node.args.forEach(walk);
        return;
      case 'Conditional':
        walk(node.test);
        walk(node.then);
        walk(node.otherwise);
        return;
      default:
        throw new Error(`неизвестный узел дерева: ${(node as Node).kind}`);
    }
  }
}
