// Реестр образцовых систем — доноры шаблонов для конструктора.
// «Подтянуть рода из любой системы и отредактировать у себя» начинается здесь:
// это просто список данных, ни одна система не знает о другой.
//
// Мир донора — система ВМЕСТЕ с её компендиумом: готовые записи (меч, кольчуга,
// заклинания) — такие же шаблоны, как блоки полей и правила.
//
// Сами данные лежат в samples/*.world.json (корень репозитория) — ОБРАЗЦЫ
// ОБЯЗАНЫ БЫТЬ ДАННЫМИ, которые мог бы выгрузить сам конструктор, а не
// TS-модулями. Этот файл — единственная точка доступа к ним из кода:
// больше никто в пакете (и вне его) samples/*.json не читает.
// Знания и решения, которые раньше жили комментариями рядом с данными, —
// в samples/README.md.

import dnd5eWorld from '../../../../samples/dnd5e.world.json' with { type: 'json' };
import cyberpunkWorld from '../../../../samples/cyberpunk.world.json' with { type: 'json' };
import type { System, Compendium, Sheet } from './types.ts';

export interface SampleWorld {
  title: string;
  system: System;
  compendium: Compendium;
  sheets: Sheet[];
}

export const SAMPLE_WORLDS: SampleWorld[] = [dnd5eWorld, cyberpunkWorld] as unknown as SampleWorld[];

export const SAMPLE_SYSTEMS: System[] = SAMPLE_WORLDS.map(w => w.system);
