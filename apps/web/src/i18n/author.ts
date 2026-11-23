import type { TFunction } from 'i18next';
import { langsOf } from '@vtt/engine';
import { i18n, registerFiles, UI_LANGS } from './index.ts';
import type { Dictionary } from './index.ts';

registerFiles(import.meta.glob<Dictionary>([
  './ru/*.json', './en/*.json',
  '!./*/common.json', '!./*/app.json', '!./*/gate.json', '!./*/ui.json', '!./*/sheet.json', '!./*/play.json',
], { eager: true, import: 'default' }));

export const dataLang = (system: { langs?: readonly string[] } | null | undefined): string => {
  const main = system ? langsOf(system as never)[0] ?? 'ru' : 'ru';
  return (UI_LANGS as readonly string[]).includes(main) ? main : 'en';
};

export const dataT = (system: { langs?: readonly string[] } | null | undefined): TFunction =>
  i18n.getFixedT(dataLang(system)) as unknown as TFunction;

export { useT, t, Trans, langName, i18n, UI_LANGS } from './index.ts';
