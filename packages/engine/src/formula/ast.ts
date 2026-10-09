export interface NumberNode { kind: 'Number'; value: number }

export interface TextNode { kind: 'Text'; value: string; at?: number; raw?: string }
export interface BoolNode { kind: 'Bool'; value: boolean }
export interface RefNode { kind: 'Ref'; tag: string }
export interface PickNode { kind: 'Pick'; tag: string; key: Node; rest?: string }
export interface UnaryNode { kind: 'Unary'; op: string; operand: Node }
export interface BinaryNode { kind: 'Binary'; op: string; left: Node; right: Node }
export interface ConditionalNode { kind: 'Conditional'; test: Node; then: Node; otherwise: Node }
export interface CallNode { kind: 'Call'; name: string; args: Node[] }

export type Node =
  | NumberNode | TextNode | BoolNode | RefNode | PickNode | UnaryNode | BinaryNode | ConditionalNode | CallNode;
