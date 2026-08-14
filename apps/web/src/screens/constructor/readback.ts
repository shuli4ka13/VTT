// Пересказ: шаг конвейера → фраза из сегментов. Сегмент-`text` — обычные
// слова, сегмент-`hole` — оранжевый пропуск: пусто там, где заполнить
// обязательно, или значение придёт из записи компендиума.
//
// Все имена — лейблы ТЕКУЩЕЙ системы (labelOfTag): переименовал поле —
// пересказ перестроился, ничего не сломалось (критерий №2).

import type { System, Effect, Step } from '@vtt/schema';
import { labelOfTag } from '../../ui/formula.tsx';

export type Segment = { text: string } | { hole: string };

const seg = (text: string): Segment => ({ text });
const hole = (label: string): Segment => ({ hole: label });

/** Счёт костей словом: число как есть, пул-ссылка — лейблом поля листа. */
export function countWord(system: System, count: unknown): string {
  if (typeof count !== 'object' || count === null) return String(count ?? 1);
  const tag = (count as { tag?: unknown }).tag;
  if (tag) return system.fields.find(f => f.tag === tag)?.label || `#${String(tag)}`;
  return '…';
}

export function dieWord(system: System, name: string): string {
  const constant = system.constants?.[name];
  if (!constant) return name;
  // Запись кости — латиницей, как её ест движок: d20, а не к20.
  const dice = (constant.dice ?? [])
    .map(d => `${countWord(system, d.count)}d${d.sides}`).join(' + ');
  return dice || (constant.label ?? name);
}

/** Ссылка слота одним сегментом. Чем описать пустоту — знает вызывающий. */
export function refSegment(ref: unknown, system: System, effect: Effect, emptyAs: string): Segment {
  if (ref === null || ref === undefined || ref === '') return hole(emptyAs);
  if (typeof ref !== 'object') return seg(String(ref));
  const r = ref as Record<string, unknown>;
  if ('const' in r) return r.const === '' || r.const == null ? hole(emptyAs) : seg(String(r.const));
  if ('expr' in r) {
    const text = String(r.expr ?? '').trim();
    if (!text) return hole(emptyAs);
    return seg(text.replace(/#([\p{L}\p{N}_]+)/gu, (_, tag: string) => labelOfTag(system, tag)));
  }
  if ('tag' in r) return seg(`«${labelOfTag(system, String(r.tag))}»`);
  if ('param' in r) {
    const declared = effect.params?.find(p => p.key === r.param);
    return hole(`${declared?.label ?? String(r.param)} — из записи`);
  }
  if ('prop' in r || 'item' in r) return hole(`${String(r.prop ?? r.item)} — из записи`);
  if ('ref' in r) return seg(`результат «${String(r.ref).split('.')[0]}»`);
  if ('constant' in r) return seg(dieWord(system, String(r.constant)));
  return hole(emptyAs);
}

/** Хвост порога: [провалил, прошёл] — слово зависит от направления успеха. */
const SUCCESS_WORDS: Record<string, [string, string]> = {
  atLeast: ['Не добросил', 'Добросил'],
  over: ['Не перебросил', 'Перебросил'],
  notOver: ['Перебросил', 'Уложился'],
  under: ['Не уложился', 'Уложился'],
  equals: ['Не попал точно', 'Попал точно'],
};

export function checkReadback(step: Step, system: System, effect: Effect): Segment[] {
  const s = step as any;
  if (step.type === 'compare') {
    const breakIf = s.breakIf ?? 'less';
    const tail = breakIf === 'never' ? 'обрыва нет, разница идёт дальше'
      : breakIf === 'atMost' ? 'не превысило, эффект кончается'
        : 'меньше — эффект кончается';
    return [
      refSegment(s.value, system, effect, 'что сравниваем?'), seg('против'),
      refSegment(s.versus, system, effect, 'с чем?'), seg(`у цели — ${tail}.`),
    ];
  }
  const roll = s.roll ?? {};
  const out: Segment[] = [seg(s.side === 'target' ? 'Цель бросает' : 'Отправитель бросает')];
  out.push(roll.die ? refSegment(roll.die, system, effect, 'какой костью?') : hole('какой костью?'));
  if (roll.bonus !== undefined && roll.bonus !== null) {
    const bonus = refSegment(roll.bonus, system, effect, 'прибавка?');
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  out.push(seg('против'), refSegment(s.versus, system, effect, 'какого поля цели?'));
  const words = SUCCESS_WORDS[s.successWhen ?? 'atLeast'] ?? SUCCESS_WORDS.atLeast!;
  const broken = (s.continueOn ?? 'success') === 'success' ? words[0] : words[1];
  out.push(seg(`. ${broken} — эффект кончается.`));
  return out;
}

export function amountValueSegments(step: Step, system: System, effect: Effect): Segment[] {
  const s = step as any;
  const source = typeof s.source === 'object' ? null : (s.source ?? 'roll');
  const out: Segment[] = [];
  if (source === 'item') out.push(refSegment(s.fixed, system, effect, 'фикс записи?'));
  else if (source === 'margin') {
    out.push(seg('превышение проверки'));
    if (s.margin) out.push(refSegment(s.margin, system, effect, 'какой?'));
  } else out.push(refSegment(s.dice, system, effect, 'какие кости?'));
  if (s.bonus !== undefined && s.bonus !== null) {
    const bonus = refSegment(s.bonus, system, effect, '');
    if (!('text' in bonus) || (bonus.text !== '0' && bonus.text !== '')) out.push(seg('+'), bonus);
  }
  return out;
}

export function changeReadback(step: Step, amount: Step | null, system: System, effect: Effect): Segment[] {
  const s = step as any;
  if (step.type === 'status') {
    const ref = s.effect;
    let what: Segment;
    if (ref && typeof ref === 'object' && 'const' in ref) {
      const id = String((ref as any).const ?? '');
      const known = id ? system.effects?.[id] : undefined;
      what = known ? seg(`«${known.label ?? id}».`) : hole(`«${id || '?'}» — в системе нет`);
    } else what = refSegment(ref, system, effect, 'какое состояние?');
    return (s.mode ?? 'apply') === 'remove'
      ? [seg('С цели снимается состояние'), what]
      : [seg('На цель вешается состояние'), what];
  }
  const field = refSegment(s.target, system, effect, 'какое поле?');
  const what = amount
    ? amountValueSegments(amount, system, effect)
    : [refSegment(s.value, system, effect, 'сколько?')];
  const direction = s.direction ?? 'subtract';
  if (direction === 'set') return [seg('Полю'), field, seg('цели ставится'), ...what, seg('.')];
  if (direction === 'add') return [seg('Цель получает'), ...what, seg('в'), field, seg('.')];
  return [seg('Цель теряет'), ...what, seg('из'), field, seg('.')];
}

export function numberReadback(step: Step, system: System, effect: Effect): Segment[] {
  const out: Segment[] = [seg('Считается число:'), ...amountValueSegments(step, system, effect)];
  out.push(step.id ? seg(`— дальше это «${step.id}».`) : seg('.'));
  return out;
}

/** Для тестов и свёрнутых сводок: пропуски в ⟨угловых скобках⟩. */
export const joinReadback = (segments: Segment[]): string =>
  segments.map(part => ('text' in part ? part.text : `⟨${part.hole}⟩`))
    .join(' ')
    .replace(/\s+([.,])/g, '$1')
    .replace(/\.\s*\./g, '.');
