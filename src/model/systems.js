// Реестр образцовых систем — доноры шаблонов для конструктора.
// «Подтянуть рода из любой системы и отредактировать у себя» начинается здесь:
// это просто список данных, ни одна система не знает о другой.

import { system as dnd5e } from './system.js';
import { cyberpunk } from './system-cyberpunk.js';

export const SAMPLE_SYSTEMS = [dnd5e, cyberpunk];
