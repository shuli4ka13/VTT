import { amountParamOf } from '@vtt/engine/model/lists';
import type { System, Effect, Step, SystemConstant } from '@vtt/schema';
import { labelOfTag } from '../../ui/formula.tsx';
import { ownerOf } from '@vtt/engine/engine/owners';
import { dice as diceText, asDice, DIE_LETTER } from '../../words.ts';

export type Segment = { text: string } | { hole: string };

const seg = (text: string): Segment => ({ text });
const hole = (label: string): Segment => ({ hole: label });

export function countWord(system: System, count: unknown): string {
  if (typeof count !== 'object' || count === null) return String(count ?? 1);
  const tag = (count as { tag?: unknown }).tag;
  if (tag) return system.fields.find(f => f.tag === tag)?.label || String(tag);
  return '…';
}

export function dieWord(system: System, name: string): string {
  const constant = system.constants?.[name];
  if (!constant) return name;

  const dice = (constant.dice ?? [])
    .map(d => diceText(countWord(system, d.count), d.sides)).join(' + ');
  return dice || (constant.label ?? name);
}

export function readingWord(system: System, name: string): string | null {
  const read = system.constants?.[name]?.read;
  if (!read || read === 'sum') return null;
  const kind = typeof read === 'string' ? read : read.kind;
  if (kind === 'sum') return null;
  if (kind === 'count') {
    const n = typeof read === 'object' ? read.atLeast : undefined;
    return typeof n === 'number' ? `успехи от ${n}` : 'счёт успехов';
  }
  if (kind === 'best') return 'лучшая';
  if (kind === 'worst') return 'худшая';
  return String(kind);
}

export type Names = Map<string, string>;

export function refSegment(ref: unknown, system: System, effect: Effect, emptyAs: string, names?: Names): Segment {
  if (ref === null || ref === undefined || ref === '') return hole(emptyAs);
  if (typeof ref !== 'object') return seg(String(ref));
  const r = ref as Record<string, unknown>;
  if ('const' in r) return r.const === '' || r.const == null ? hole(emptyAs) : seg(asDice(String(r.const)));
  if ('expr' in r) {
    const text = String(r.expr ?? '').trim();
    if (!text) return hole(emptyAs);
    return seg(text.replace(/[@#]([\p{L}\p{N}_]+)/gu, (_, tag: string) => labelOfTag(system, tag)));
  }
  if ('tag' in r) return seg(`«${labelOfTag(system, String(r.tag))}»`);
  if ('param' in r) {
    const declared = effect.params?.find(p => p.key === r.param);
    return hole(`${declared?.label ?? String(r.param)} — из записи`);
  }
  if ('prop' in r || 'item' in r) return hole(`${String(r.prop ?? r.item)} — из записи`);
  if ('ref' in r) {
    const path = String(r.ref);
    const head = path.split('.')[0]!;
    if (head === 'event') return seg(EVENT_WORDS[path] ?? 'присланное');
    const named = names?.get(path) ?? names?.get(head);
    return seg(named ? `«${named}»` : `результат «${head}»`);
  }
  if ('constant' in r) {
    const name = String(r.constant);
    const reading = readingWord(system, name);
    return seg(reading ? `${dieWord(system, name)} (${reading})` : dieWord(system, name));
  }
  return hole(emptyAs);
}

const EVENT_WORDS: Record<string, string> = {
  'event.amount': 'присланное число',
  'event.incoming': 'присланное число до правок',
  'event.tags': 'присланные метки',
  event: 'присланное',
};

const SUCCESS_WORDS: Record<string, [string, string]> = {
  atLeast: ['Не добросил', 'Добросил'],
  over: ['Не перебросил', 'Перебросил'],
  notOver: ['Перебросил', 'Уложился'],
  under: ['Не уложился', 'Уложился'],
  equals: ['Не попал точно', 'Попал точно'],
};

export function checkReadback(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const s = step as any;
  if (step.type === 'compare') {
    const breakIf = s.breakIf ?? 'less';
    const tail = breakIf === 'never' ? 'обрыва нет, разница идёт дальше'
      : breakIf === 'atMost' ? 'не превысило, эффект кончается'
        : 'меньше — эффект кончается';
    return [
      refSegment(s.value, system, effect, 'что сравниваем?', names), seg('против'),
      refSegment(s.versus, system, effect, 'с чем?', names), seg(`у цели — ${tail}.`),
    ];
  }
  const roll = s.roll ?? {};

  const out: Segment[] = [seg(s.side === 'target' ? 'Цель бросает' : 'Ты бросаешь')];
  out.push(roll.die ? refSegment(roll.die, system, effect, 'какой костью?', names) : hole('какой костью?'));
  if (roll.bonus !== undefined && roll.bonus !== null) {
    const bonus = refSegment(roll.bonus, system, effect, 'прибавка?', names);
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  out.push(seg('против'), refSegment(s.versus, system, effect, 'какого поля цели?', names));
  const words = SUCCESS_WORDS[s.successWhen ?? 'atLeast'] ?? SUCCESS_WORDS.atLeast!;
  const broken = (s.continueOn ?? 'success') === 'success' ? words[0] : words[1];
  out.push(seg(`. ${broken} — эффект кончается.`));
  return out;
}

export function amountValueSegments(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const s = step as any;
  const source = typeof s.source === 'object' ? null : (s.source ?? 'roll');
  const out: Segment[] = [];
  if (source === 'item') out.push(refSegment(s.fixed, system, effect, 'фикс записи?', names));
  else if (source === 'margin') {
    out.push(seg('превышение проверки'));
    if (s.margin) out.push(refSegment(s.margin, system, effect, 'какой?', names));
  } else out.push(refSegment(s.dice, system, effect, 'какие кости?', names));
  if (s.bonus !== undefined && s.bonus !== null) {
    const bonus = refSegment(s.bonus, system, effect, '', names);
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  return out;
}

function exprSegments(expr: string, amount: Step | null, system: System, effect: Effect, names?: Names): Segment[] {
  const id = String((amount as any)?.id ?? '');
  const out: Segment[] = [];
  let rest = expr.trim();
  if (!rest) return [hole('чем станет?')];
  for (;;) {
    const m = rest.match(/[@#]([\p{L}\p{N}_.]+)/u);
    if (!m || m.index === undefined) break;
    const before = rest.slice(0, m.index).trim();
    if (before) out.push(seg(before));
    if (id && m[1] === id && amount) {
      const inner = amountValueSegments(amount, system, effect, names);
      out.push(seg('('), ...inner, seg(')'));
    } else {
      const name = m[1]!;
      const field = ownerOf(name)?.rest ?? name;
      const label = names?.get(name)
        ?? (system.fields.some(f => f.tag === field) ? labelOfTag(system, name) : null);
      out.push(label ? seg(`«${label}»`) : hole(`${name} — такого нет`));
    }
    rest = rest.slice(m.index + m[0].length);
  }
  const tail = rest.trim();
  if (tail) out.push(seg(tail));
  return out;
}

export function changeReadback(step: Step, amount: Step | null, system: System, effect: Effect, names?: Names): Segment[] {
  if (step.type === 'emit') return sendReadback(step, system, effect);
  const s = step as any;
  if (step.type === 'status') {
    const ref = s.effect;
    let what: Segment;
    if (ref && typeof ref === 'object' && 'const' in ref) {
      const id = String((ref as any).const ?? '');
      const known = id ? system.effects?.[id] : undefined;
      what = known ? seg(`«${known.label ?? id}».`) : hole(`«${id || '?'}» — в системе нет`);
    } else what = refSegment(ref, system, effect, 'какое состояние?', names);
    return (s.mode ?? 'apply') === 'remove'
      ? [seg('С цели снимается состояние'), what]
      : [seg('На цель вешается состояние'), what];
  }
  const field = refSegment(s.target, system, effect, 'какое поле?', names);

  const expr = s.value && typeof s.value === 'object' && 'expr' in s.value
    ? String(s.value.expr ?? '') : null;
  const what = expr !== null
    ? exprSegments(expr, amount, system, effect, names)
    : amount
      ? amountValueSegments(amount, system, effect, names)
      : [refSegment(s.value, system, effect, 'сколько?', names)];
  const direction = s.direction ?? 'subtract';
  if (direction === 'set') return [seg('У цели'), field, seg('становится'), ...what, seg('.')];
  if (direction === 'add') return [seg('Цель получает'), ...what, seg('в'), field, seg('.')];
  return [seg('Цель теряет'), ...what, seg('из'), field, seg('.')];
}

export function sendReadback(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const s = step as Record<string, unknown>;
  const id = String(s.event ?? '');
  const event = system.effects?.[id];
  const name = id ? seg(`«${event?.label || id}»:`) : hole('какой эффект зовём?');
  const args = (s.args ?? {}) as Record<string, unknown>;
  const main = amountParamOf(event);
  const sent = main ? args[main.key] : undefined;
  const amount = sent === undefined ? seg('без величины') : refSegment(sent, system, effect, 'сколько?', names);
  const word = (t: unknown): string => {
    if (typeof t === 'string') return t;
    const r = (t ?? {}) as Record<string, unknown>;
    if ('const' in r) return String(r.const);
    const param = typeof r.param === 'string' ? effect.params?.find(p => p.key === r.param) : undefined;
    return param ? String(param.label ?? param.key) : '…';
  };
  const chosen = (event?.params ?? []).filter(p => p.kind === 'choice' && args[p.key] !== undefined).map(p => word(args[p.key]));
  const tags = chosen.filter(Boolean);
  return [
    seg(s.to === 'sender' ? 'Отправитель в ответ получает' : 'Цель получает'), name, amount,
    ...(tags.length ? [seg(`[${tags.join(', ')}]`)] : []),
    seg('.'),
  ];
}

export function numberReadback(step: Step, system: System, effect: Effect, names?: Names): Segment[] {
  const out: Segment[] = [seg('Считается число:'), ...amountValueSegments(step, system, effect, names)];
  const double = (step as { double?: { ref?: string; atLeast?: number } }).double;
  if (double?.ref) {
    out.push(seg(`— и вдвое, если ${outputWords(double.ref)} не меньше ${double.atLeast ?? 20}`));
  }
  out.push(seg('.'));
  return out;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const t = Math.abs(n) % 100;
  const d = t % 10;
  if (t > 10 && t < 20) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
};

function partLabel(system: System, part: string): string {
  for (const constant of Object.values(system.constants ?? {})) {
    const term = (constant.dice ?? []).find(d => d.name === part);
    if (term) return term.label || part;
  }
  return part;
}

function opPhrase(op: Record<string, unknown>, system: System): string {
  const n = Number(op.n ?? 1);
  const by = Number(op.by ?? 0);

  const only = op.part ? ` (${partLabel(system, String(op.part))})` : '';
  switch (op.op) {
    case 'addDie':
      return (n === 1 ? 'кинуть на кость больше'
        : `кинуть на ${n} ${plural(n, 'кость', 'кости', 'костей')} больше`) + only;
    case 'keepBest':
      return (n === 1 ? 'оставить лучшую' : `оставить ${n} лучших`) + only;
    case 'keepWorst':
      return (n === 1 ? 'оставить худшую' : `оставить ${n} худших`) + only;
    case 'dieStep':
      return (by >= 0
        ? `взять кость на ${by} ${plural(by, 'ступень', 'ступени', 'ступеней')} выше`
        : `взять кость на ${-by} ${plural(by, 'ступень', 'ступени', 'ступеней')} ниже`) + only;
    case 'shiftVersus':

      return by <= 0 ? `сделать порог легче на ${-by}` : `сделать порог труднее на ${by}`;
    case 'shiftDegree':
      return by >= 0
        ? `сдвинуть степень успеха на ${by} вверх`
        : `сдвинуть степень успеха на ${-by} вниз`;
    case 'explode':
      return String(op.at ?? 'max') === 'min'
        ? `на единице кинуть ещё раз и вычесть${only}`
        : `на максимуме кинуть ещё раз и прибавить${only}`;
    case 'reroll':
      return (n === 1
        ? 'перебросить единицы, новый результат обязателен'
        : `перебросить кости не выше ${n}, новый результат обязателен`) + only;
    case 'flip':
      return String(op.prefer ?? 'low') === 'high'
        ? `перевернуть цифры, если так больше${only}`
        : `перевернуть цифры, если так меньше${only}`;
    default:
      return String(op.op);
  }
}

export function editReadback(
  edit: { ops?: Record<string, unknown>[]; canceledBy?: string },
  system: System,
): Segment[] {
  const ops = edit.ops ?? [];
  if (!ops.length) return [hole('что она делает с броском?')];

  const phrases = ops.map(op => opPhrase(op, system));
  const head = phrases[0]!;
  const text = head.charAt(0).toUpperCase() + head.slice(1)
    + (phrases.length > 1 ? ', ' + phrases.slice(1).join(', ') : '');
  const out: Segment[] = [seg(text + '.')];

  if (edit.canceledBy) {
    const other = system.roll_edits?.[edit.canceledBy];
    out.push(seg(`Гасится: ${other?.label || edit.canceledBy}.`));
  }
  return out;
}

export function dieReadback(constant: SystemConstant, system: System): Segment[] {

  const dice = (constant.dice ?? []).map(d => {
    const head = typeof d.count === 'object' && d.count !== null
      ? `${DIE_LETTER}${d.sides} по числу «${countWord(system, d.count)}»`
      : diceText(d.count, d.sides);

    return d.name ? `${head} (${d.label || d.name})` : head;
  }).join(' + ');
  if (!dice) return [hole('из чего состоит бросок?')];

  const read = constant.read;
  const kind = typeof read === 'string' ? read : read?.kind ?? 'sum';
  const atLeast = typeof read === 'object' ? read.atLeast : undefined;

  const single = (constant.dice ?? []).length === 1
    && typeof (constant.dice ?? [])[0]?.count === 'number'
    && ((constant.dice ?? [])[0]!.count as number) === 1;
  if (single && kind === 'sum') return [seg(`Кинуть ${dice}.`)];

  const tail = kind === 'best' ? 'взять лучшую'
    : kind === 'worst' ? 'взять худшую'
      : kind === 'count'
        ? `посчитать, сколько выпало не ниже ${atLeast ?? '?'}`
        : 'сложить';
  return [seg(`Кинуть ${dice} и ${tail}.`)];
}

export const joinReadback = (segments: Segment[]): string =>
  segments.map(part => ('text' in part ? part.text : `⟨${part.hole}⟩`))
    .join(' ')
    .replace(/\s+([.,])/g, '$1')
    .replace(/\.\s*\./g, '.');

const outputWords = (ref: string): string => {
  const [, path] = ref.split('.');
  return path ? OUTPUT_WORDS[path] ?? path : 'результат шага';
};

const OUTPUT_WORDS: Record<string, string> = {
  natural: 'выпавшее на костях',
  total: 'итог броска',
  margin: 'превышение',
  rolled: 'сколько костей кинуто',
  atMax: 'костей на максимуме',
  atMin: 'костей на единице',
};
