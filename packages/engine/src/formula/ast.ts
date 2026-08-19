export interface NumberNode { kind: 'Number'; value: number }

export interface RefNode { kind: 'Ref'; tag: string }
export interface UnaryNode { kind: 'Unary'; op: string; operand: Node }
export interface BinaryNode { kind: 'Binary'; op: string; left: Node; right: Node }
export interface ConditionalNode { kind: 'Conditional'; test: Node; then: Node; otherwise: Node }
export interface CallNode { kind: 'Call'; name: string; args: Node[] }

export type Node =
  | NumberNode | RefNode | UnaryNode | BinaryNode | ConditionalNode | CallNode;
