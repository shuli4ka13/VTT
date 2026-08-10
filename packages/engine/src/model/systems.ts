// Реестр образцовых систем — доноры шаблонов для конструктора.
// «Подтянуть рода из любой системы и отредактировать у себя» начинается здесь:
// это просто список данных, ни одна система не знает о другой.
//
// Мир донора — система ВМЕСТЕ с её компендиумом: готовые записи (меч, кольчуга,
// заклинания) — такие же шаблоны, как блоки полей и правила.

import { system as dnd5e } from './system.ts';
import { compendium as dndCompendium } from './compendium.ts';
import { cyberpunk, cpCompendium } from './system-cyberpunk.ts';

export const SAMPLE_WORLDS = [
  { system: dnd5e, compendium: dndCompendium },
  { system: cyberpunk, compendium: cpCompendium },
];

export const SAMPLE_SYSTEMS = SAMPLE_WORLDS.map(w => w.system);
