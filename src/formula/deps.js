// Извлечение зависимостей: AST → список тегов, на которые ссылается формула.
// Нужен движку для обхода графа и интерфейсу для подсветки чипсов.

export function dependencies(ast) {
  const found = [];
  walk(ast);
  return found;

  function walk(node) {
    switch (node.kind) {
      case 'Number':
        return;
      case 'Ref':
        if (!found.includes(node.tag)) found.push(node.tag);
        return;
      case 'Unary':
        return walk(node.operand);
      case 'Binary':
        walk(node.left);
        return walk(node.right);
      case 'Call':
        return node.args.forEach(walk);
      case 'Conditional':
        walk(node.test);
        walk(node.then);
        return walk(node.otherwise);
      default:
        throw new Error(`неизвестный узел дерева: ${node.kind}`);
    }
  }
}
