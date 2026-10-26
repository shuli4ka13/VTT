import type { System, Modifier } from '@vtt/schema';
import { ROLL_CALL, CALL_WORDS } from '@vtt/engine/words/calls';
import { targetStages, paramStages } from '@vtt/engine/engine/stages';
import { flattenSystem } from '@vtt/engine/model/inherit';
import { tiedToHolder } from '@vtt/engine/model/references';
import { labelOfTag } from '../../ui/formula.tsx';
import { formulaWords } from '../../ui/formula-words.ts';
import { rowNames } from './row-names.ts';

type Loose = Record<string, unknown>;

type Names = Map<string, string> | undefined;

const OP_WORDS: Record<string, (value: string) => string> = {
  set: value => `= ${value}`,
  add: value => (/^[-−]/u.test(value) ? `− ${value.slice(1)}` : `+ ${value}`),
  mul: value => `× ${value}`,
  floor: value => `не меньше ${value}`,
  cap: value => `не больше ${value}`,
};

const exprOf = (ref: unknown): string => String((ref as { expr?: unknown } | undefined)?.expr ?? '').trim();

const valueWords = (system: System, ref: unknown, names: Names): string => {
  const text = exprOf(ref);
  return text ? formulaWords(system, text, names) : '…';
};

const tagList = (tags: unknown): string => ((tags as string[] | undefined) ?? []).map(t => `«${t}»`).join(', ');

const stageWords = (stages: readonly { key: string; label?: string }[], stage: unknown): string => {
  if (typeof stage !== 'string' || stages.length < 2) return '';
  const found = stages.find(s => s.key === stage);
  return `, этап «${found?.label ?? stage}»`;
};

function whoseWords(system: System, mod: Loose, sheetLabels: Record<string, string>, anyone: string, names: Names): string {
  const text = exprOf(mod.if);
  if (!text) return anyone;
  const found = /^@([\p{L}\p{N}_]+)\s*==\s*@носитель$/u.exec(text);
  if (found && sheetLabels[found[1]!]) return sheetLabels[found[1]!]!;
  const words = `если ${formulaWords(system, text, names)}`;
  return tiedToHolder({ expr: text }) ? words : `${anyone}, ${words}`;
}

export const rowNamesOf = (system: System, table: string | undefined): Names =>
  (table ? rowNames(flattenSystem(system, true), table) : undefined);

export function modifierSentence(system: System, modifier: Modifier, table?: string): string {
  const mod = modifier as unknown as Loose;
  const names = rowNamesOf(system, table);
  if (mod.kind === 'value') {
    const target = String(mod.target ?? '');
    const field = target ? labelOfTag(system, target) : 'какое поле?';
    const op = OP_WORDS[String(mod.op ?? 'add')] ?? (value => `${String(mod.op)} ${value}`);
    const condition = exprOf(mod.if) ? ` — если ${formulaWords(system, exprOf(mod.if), names)}` : '';
    return `«${field}» ${op(valueWords(system, mod.value, names))}${stageWords(targetStages(system, target), mod.stage)}${condition}`;
  }
  const call = String(mod.call ?? '');
  if (call === ROLL_CALL) {
    const tags = tagList(mod.tags) || tagList(mod.anyTags);
    const who = whoseWords(system, mod, { бросающий: 'бросает носитель', против: 'бросают против носителя' }, 'бросает кто угодно', names);
    const what = mod.param === 'bonus'
      ? OP_WORDS.add!(valueWords(system, mod.value, names))
      : mod.param === 'tags' ? `метка ${valueWords(system, mod.value, names)}`
      : system.roll_edits?.[String(mod.edit ?? '')]?.label ?? String(mod.edit ?? 'какая правка?');
    const lead = `${CALL_WORDS.roll.label}${tags ? ` с метками ${tags}` : ''}${who ? `, ${who}` : ''}`;
    return `${lead}: ${what}`;
  }
  const effect = system.effects?.[call];
  const param = (effect?.params ?? []).find(p => p.key === mod.param);
  const sheets = Object.fromEntries((effect?.params ?? []).filter(p => p.kind === 'sheet').map(p => [p.key, `«${p.label ?? p.key}» — носитель`]));
  const filters = [
    tagList(mod.tags) ? `по меткам ${tagList(mod.tags)}` : '',
    tagList(mod.anyTags) ? `по меткам ${tagList(mod.anyTags)}` : '',
    tagList(mod.notTags) ? `кроме ${tagList(mod.notTags)}` : '',
    mod.where ? `где «${(mod.where as Loose).column}» — «${(mod.where as Loose).is}»` : '',
  ].filter(Boolean).join(', ');
  const who = whoseWords(system, mod, sheets, 'на всех листах', names);
  const op = OP_WORDS[String(mod.op ?? 'mul')] ?? (value => value);
  const name = `«${effect?.label ?? (call || 'какой вызов?')}»${param ? ` · ${param.label ?? param.key}` : ''}`;
  return `${name}${filters ? ` ${filters}` : ''}${who ? `, ${who}` : ''}: ${op(valueWords(system, mod.value, names))}${stageWords(paramStages(effect?.params, String(mod.param ?? '')), mod.stage)}`;
}
