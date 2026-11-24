const escape = (id: string | number): string =>
  String(id).replace(/[%/:#]/g, c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

const segment = (kind: string, ids: readonly (string | number)[]): string => [kind, ...ids.map(escape)].join(':');

export type Window = 'target' | 'after' | 'done' | 'seen' | 'moment' | 'step';

export class Path {
  private constructor(private readonly text: string) {}

  static op(kind: string, ...ids: (string | number)[]): Path {
    return new Path(segment(kind, ids));
  }

  private add(kind: string, ...ids: (string | number)[]): Path {
    return new Path(`${this.text}/${segment(kind, ids)}`);
  }

  step(name: string | number): Path { return this.add('s', name); }

  at(sheetId: string): Path { return this.add('at', sheetId); }

  item(key: string | number): Path { return this.add('i', key); }

  call(fn: string): Path { return this.add('call', fn); }

  phase(name: string): Path { return this.add(name); }

  handler(sheetId: string, key: string, inst: string): Path { return this.add('on', sheetId, key, inst); }

  ask(window: Window, sheetId: string): Path { return this.add('ask', window, sheetId); }

  pick(id: string): Path { return this.add('pick', id); }

  to(sheetId: string): Path { return this.add('to', sheetId); }

  pay(): Path { return this.add('pay'); }

  nth(n: number): Path { return n ? this.add('n', n) : this; }

  die(n: number): string { return `${this.text}#${n}`; }

  get key(): string { return this.text; }

  toString(): string { return this.text; }
}
