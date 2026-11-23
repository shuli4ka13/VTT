import { useMemo } from 'react';
import { langsOf, localized, localizedBook } from '@vtt/engine';
import type { System } from '@vtt/schema';
import type { RoomState } from '@vtt/schema';
import { useRoom } from '../../store/room.ts';
import { useLocale, viewerLang } from '../../store/locale.ts';
import { Select } from '../../ui/primitives.tsx';
import { langName, useT } from '../../i18n/index.ts';

export function shownRoom(room: RoomState | null, lang: string): RoomState | null {
  if (!room) return null;
  const system = localized(room.system as System, lang);
  const compendium = localizedBook(room.compendium, room.system as System, lang);
  return system === room.system && compendium === room.compendium ? room : { ...room, system, compendium } as RoomState;
}

export function useShownRoom(): RoomState | null {
  const room = useRoom(s => s.room);
  const lang = useLocale(viewerLang);
  return useMemo(() => shownRoom(room, lang), [room, lang]);
}

export function LangSwitch() {
  const room = useRoom(s => s.room);
  const lang = useLocale(viewerLang);
  const setShown = useLocale(s => s.setShown);
  const t = useT('play');
  if (!room) return null;
  const langs = langsOf(room.system as System);
  if (langs.length < 2) return null;
  const current = langs.includes(lang) ? lang : langs[0]!;
  return (
    <Select
      value={current} label={t('shownLang')}
      options={langs.map(code => [code, langName(code)] as const)}
      onChange={code => setShown(code)}
    />
  );
}
