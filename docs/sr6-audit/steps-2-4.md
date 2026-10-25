# Шаги 2–4: списки правок образца

Собрано сценарием по `results/` и `checks/` (9 читателей, сводщик).

## Шаг 2

**Обозначения проверок.** Тесты лежат в `packages/engine/tests/`:
- [бой] — `samples.shadowrun-combat.test.ts`
- [калк] — `-book-calc`
- [осн] — `samples.shadowrun.test.ts`
- [снар] — `-gear`
- [матр] — `-matrix`
- [маг] — `-magic`
- [закл] — `-spells`
- [техно] — `-techno`
- [риг] — `-rigging`
- [пров] — `-checks`
- [линт] — `samples.lint.test.ts`
- [снимок] — `golden.samples.test.ts` вместе с `__snapshots__/golden.samples.test.ts.snap`

Веб-тесты (в `apps/web/src/`):
- [веб-обл] — `screens/constructor/effects/build-cover-other.test.tsx`
- [веб-сб] — `…/build.test.tsx`
- [веб-разв] — `…/degree-switch.test.tsx`
- [веб-зап] — `sheet/record-view.test.ts`

[линт] и [снимок] гоняются на каждом шаге. Всё ниже — правки в `samples/shadowrun.world.json`.

**Решения по спорам, общие для шагов 2–4:**
- Где у входа есть `optional` и `ask`, оба остаются, к ним дописывается `default`. Так можно: `asks.ts` по-прежнему спрашивает такой вход, пустой ответ даёт умолчание, а линт пропускает `optional`+`default`.
- Все новые общие функции кладутся в папку «Шаги для других».
- Входы `rounds` у `chilled`/`shocked` в шаге 2 не трогаются: переименование делается одной правкой в шаге 4.
- Таблицу «Лист» в шаге 2 трогаем только в пределах «или» и флагов.

### 2.1. Умолчания входов эффектов и снятие равных им аргументов

1. **`effects.spend_action.params[сложное]`** — добавить `"default": false`.
   - `act_dodge.cost[0].args` и `act_block.cost[0].args`: снять `сложное: нет`.
   - `act_full_defense.cost[0].args`: снять `простых: 0`.
   - Проверка: [бой] (act_dodge, act_block), [снимок].
2. **`shoot.params[режим]`** — добавить `default "одиночный выстрел"`. **`shoot.params[приём]`** и **`melee_strike.params[приём]`** — добавить `default "нет"`. Всё это — по правилу `optional`+`ask` выше. Проверка: [бой], [калк], [осн].
3. **`defend.params[близко]`**, **`strike_damage.params[вырубить]`**, **`strike_damage.params[без_урона]`** — добавить `"default": false`. Проверка: [бой].
4. **Вход `порог`** у 11 эффектов — добавить `default 0`, `optional` и `ask {by: gm}` оставить. Эффекты: `matrix_check`, `matrix_spike`, `matrix_tarpit`, `matrix_hack`, `ic_attack`, `cast_form`, `cast_form_attr`, `sprite_power_use`, `cast_spell`, `heal_spell`, `boost_spell`.

   Затем заменить `@порог или 0` → `@порог` (18 мест):
   - `steps[8].versus` у пяти эффектов Матрицы;
   - `matrix_spike.steps[15]`: `amount`, `bio`;
   - `matrix_tarpit.steps[15]`: `amount`, `bio`; `matrix_tarpit.steps[19]`: `amount`;
   - `ic_attack.steps[19]`: `bio`; `steps[23]`, `[25]`, `[27]`, `[29]`, `[31]`: `amount`; `steps[33]`: `amount` и `bio`.

   И заменить `@threshold или @порог или 0` → `@threshold или @порог` в пяти местах: `cast_form.steps[11]`, `cast_form_attr.steps[11]`, `cast_spell.steps[12]`, `heal_spell.steps[12]`, `boost_spell.steps[12]`. У `sprite_power_use` — см. п. 5.

   Проверка: [матр], [техно], [закл].
5. **`sprite_power_use`.**
   - Удалить входы `threshold` и `kind`.
   - `steps[10].versus`: `…если(@защита == "порог", @threshold или @порог или 0, 0))` → `…если(@защита == "порог", @порог, 0))`.
   - Вход `use_res`: `{number, default 0}` → `{boolean, default false}`. `steps[0].count`: `если(@use_res >= 1, …)` → `если(@use_res, …)`.
   - Привязки `spw_trap` и `spw_hash`: снять аргументы `kind` и `use_res`.
   - `tables.sprite_power.columns[use_resonance]`: добавить `default false`; клетки `use_resonance: false` у `spw_trap` и `spw_hash` снять.
   - Сам вход и колонку не удалять: это вопрос владельцу.
   - Проверка: [техно].
6. **`form_channel.params[attr]`** — удалить. **`form_infusion.params[attr]`** и **`form_diffusion.params[attr]`**: `{text, default ""}` → `{choice, from matrix_attrs}`, без умолчания. Проверка: [техно].
7. **`per_hit` → да/нет** в `cast_form` и `cast_form_attr`.
   - Вход `per_hit {text, default "чистые"}` → `net_hits` «Чистые успехи» `{boolean, default true}`.
   - Колонка `complex_form.per_hit` → `net_hits` (boolean, default true).
   - Клетки и аргументы `per_hit: "чистые"` у `cf_infusion` и `cf_res_spike` снять.
   - Первым шагом внутри `steps[15]` («Если @итог.success») вставить `{id: "величина", type: "roll", fixed: "если(@net_hits, большее из(0, @итог.margin), @итог.total)"}`.
   - Во всех 9 исходах (`steps[17…33]`) `если(@per_hit == "чистые", большее из(0, @итог.margin), @итог.total)` → `@величина`.
   - Проверка: [техно].
8. **`complex_form.columns[illegal]`** — добавить `default false`. У `cf_infusion` снять клетку `illegal: false` и аргумент `illegal: нет`. Проверка: [техно].
9. **`matrix_attrs.columns[target_device, target_persona]`** — добавить `default 0`.
   - `cast_form.steps[31]` и `cast_form_attr.steps[31]`: `(@attr.target_device или 0)` → `@attr.target_device`.
   - `steps[33]` там же: `(@attr.target_persona или 0) - 1` → `@attr.target_persona - 1`.
   - Проверка: [техно].
10. **Вход `astral`** у `cast_spell`, `heal_spell`, `boost_spell` — удалить. Аргумент `astral` снять у привязок `spell_fireball`, `spell_mana_bolt`, `spell_heal`, `spell_stabilize`, `spell_increase_attribute`, `spell_armor`. Проверка: [закл].
11. **Виды урона сводятся в `damage_kinds`.**
    - `cast_spell.params[damage_phys]` → `damage` «Вид урона» `{choice, from damage_kinds, default "физический"}`.
    - `cast_spell.steps[15]` и `steps[18]`: `physical_hit @damage_phys` → `@damage.physical`.
    - Привязки `spell_fireball` и `spell_mana_bolt`: `damage_phys: да` → `damage: "физический"` (аргумент явный, D не делаем).
    - `tables.spell.columns[damage].from`: `spell_damage` → `damage_kinds`; клетки `"ф"` → `"физический"` у тех же двух записей.
    - `heal_spell.params[heal_kind].from` → `damage_kinds`.
    - Удалить таблицы `spell_damage`, `heal_kinds`, `damage_choice`.
    - Тест [закл], `like('spell_stunbolt', …, {damage_phys: 'нет'})` → `{damage: '"оглушающий"'}`.
12. **`cast_spell.params[combat]`**: `text, default "нет"` → `{choice, from spell_combat, optional}`, без умолчания. **`cast_spell.params[element]`**: `text` → `{choice, from spell_elements, default "нет"}`. Сравнения `@combat == "прямое"` и прочие остаются. Проверка: [закл].
13. **`heal_spell.params[clears]`**: `text, default ""` → `{effect, optional}`.
    - Удалить обёртку `steps[21]` (`branch @clears != ""`) и `steps[23]` (`end`). `steps[22]` (status `remove`) оставить: с пустым эффектом шаг пропускается сам.
    - У `spell_heal` и `spell_stabilize` снять `clears: ""`.
    - У `spell_heal` снять ещё `stabilize: нет` (это умолчание).
    - Проверка: [закл].
14. **`boost_spell`.** `steps[13].if`: `@итог.success и @spell_effect != ""` → `@итог.success`. `steps[14].args.attr`: `@attr или ""` → `@attr`. Проверка: [закл].
15. **`dg_alcohol`, `dg_jazz`, `dg_long_way`, `dg_zubrila`, `dg_kamikaze`, `dg_nitro`** — `duration.max`: `@dur или 60` → `@dur`. **`dg_alcohol_take.steps[1].args.dur`** и **`dg_jazz_take.steps[1].args.dur`**: `большее из(1, @срок)` → `@срок`. Проверка: [снимок].
16. **`sprite_diagnostics.modifiers[0].value`**: `@amount` → `большее из(1, @amount)`. В `sprite_power_use.steps[18].args.amount`: `большее из(1, @итог.total)` → `@итог.total`. Проверка: [техно].
17. **`frightened.params[0]` (`источник`)** — снять `optional`. `modifiers[0].if` → `@бросающий == @носитель и @против == @источник`. Испуг никто не накладывает. Проверка: [линт].

### 2.2. Умолчания колонок и снятие «или»

18. **`weapon.columns[ar1…ar5]`** — добавить `default 0`.
    - `ranges.rows[*].cells.item_ar`: `@вещь.arN или 0` → `@вещь.arN` (пять строк).
    - `melee_strike.steps[0]`: `(@вещь.ar1 или 0) + …` → `@вещь.ar1 + @действующий.ar_mod`.
    - Проверка: [бой], [калк].
19. **`firearm.columns[ammo_max, smart, str_min]`** — добавить `default 0`.
    - `firearm.sight`: `@smart или 0` → `@smart`.
    - `firearm.str_need`: `(@str_min или 0) - …` → `@str_min - сумма(строки("weapon_mod", "str_ease", @вещь))`.
    - `shoot.cost[9]` → `@вещь.ammo_max >= 1 и @вещь.ammo < 1`.
    - `reload.steps[0].if` → `@вещь.ammo_max < 1`.
    - `launch_blast.cost[3]` → `@вещь.ammo < 1`.
    - Проверка: [бой], [снар], [осн] (Страйкер).
20. **`shoot` целиком.**
    - `cost[0]` → `не @режим.always и не есть(@вещь.modes, @режим)`.
    - `cost[12]` → `@вещь.ammo_max >= 1 и не @режим.partial и @вещь.ammo < @режим.rounds`.
    - `cost[15]` → `@приём.cost >= 1`.
    - `cost[18].args.простых` → `если(@действующий.cover >= 1 и не @приём.cover_free, 1, 0) + если(@приём.simple, 1, 0)`.
    - `steps[0]` → `если(@вещь.ammo_max >= 1, меньшее из(@вещь.ammo, @режим.rounds), 0)`.
    - `steps[4]`: `(@режим.rounds или 1)` → `@режим.rounds`; `@режим.ar или 0` → `@режим.ar`; `(@режим.ease_burst или нет)` → `@режим.ease_burst`; `(@режим.ease_full или нет)` → `@режим.ease_full`.
    - `steps[5]`: `rounds` и `dv` так же; `(@приём.dv или 0)` → `@приём.dv`.
    - `steps[6]`: `(@приём.pool или 0)` → `@приём.pool`.
    - `steps[12].args.близко` → `@дистанция.close`.
    - `steps[16]`: `электричество` → `@electric или @вещь.ammo_shock`; `вырубить` → `@приём.knockout`; `без_урона` → `@приём.no_damage`.
    - Проверка: [бой], [калк], [осн], [веб-сб] (хвост `shoot` после «отпор» пересобирается из данных — прогнать).
21. **`melee_strike`.**
    - `cost[0]` → `@приём.cost >= 1`.
    - `cost[3].args.простых` — как у `shoot`.
    - `steps[1]` → `@dv + @приём.dv + @действующий.melee_dv_bonus`.
    - `steps[2]`: `@приём.pool`.
    - `steps[12]`: `электричество @electric`, `вырубить @приём.knockout`, `без_урона @приём.no_damage`.
    - Проверка: [бой], [калк].
22. **`edge_actions.columns[cost, dv, pool]`** — добавить `default 0`. В строках снять клетки, равные умолчанию: нули `cost`/`dv`/`pool` и `knockout: false`. У строки «нет» клеток не остаётся. Фильтров `where`/`rowSays` по этой таблице нет. Проверка: [бой].
23. **`reload.cost[0].args`.**
    - `сложное`: `пусто(@вещь.reload) или (@вещь.reload.complex или нет)` → `пусто(@вещь.reload) или @вещь.reload.complex`.
    - `простых`: `если(пусто(@вещь.reload) или @вещь.reload.complex, 0, 1)`.
    - Проверка: [бой], [калк], [осн].
24. **`grenade`.**
    - `damage_kind`: `default "физический"`.
    - `physical_dmg.expr` → `@damage_kind.physical`.
    - `electric`, `launched`: `default false`.
    - `count`: `expr 1` → `default 1`. Своё значение экземпляра сильнее и того и другого (`owned.ts: propsOf`), поэтому исход тот же.
    - Клетку `damage_kind: "физический"` снять у `grenade_frag`, `rocket_frag`, `rocket_antivehicle`.
    - `throw_blast.cost[0]` → `@вещь.launched`; `cost[3]` → `@вещь.count < 1`; `steps[6].args.electric` → `@вещь.electric`.
    - Проверка: [осн] (гранаты «Бритвы», count 2).
25. **`explosive.count`**: `expr 1` → `default 1`. `detonate.cost[0]` → `@вещь.count < 1`. Проверка: [осн].
26. **`лист` — характеристики и защита.** Умолчаний в `metatypes` не дописывать: у поля `metatype` умолчание «человек», а клетки заполнены во всех пяти строках.
    - Колонки 1…9 (body…edge), `max`: `(@metatype.<x>_max или 6) + …` → `@metatype.<x>_max + @attr_limits.<x>.bonus`.
    - `physical_max`: `… + @metatype.toughness`.
    - `defense_rating`: `… + @metatype.dermal + …`.
    - `astral_dr`: `@intuition + @armor_natural + @astral_armor`.
    - Проверка: [калк], [осн].
27. **`vehicle_models.columns[body, armor, pilot, sensor, interval, accel, top, handling_on, handling_off]`** — добавить `default 0`.
    - `лист.veh_body`, `veh_armor`, `veh_pilot`, `veh_sensor`, `veh_interval`, `veh_accel`, `veh_top`: снять `или 0`.
    - `veh_handling` → `если(@offroad, @vehicle_model.handling_off, @vehicle_model.handling_on) + округлить вниз(@physical / 3)`.
    - Проверка: [риг].
28. **`sheets.runner.modifiers[2]`** (`unarmed_physical`): `(@metatype.unarmed_physical или нет)` → `@metatype.unarmed_physical`. Проверка: [бой].
29. **`implant.columns[essence, cost, avail]`** и **`implant_weapon.columns[essence, cost, avail]`**: `(@grade.ess или 1)` → `@grade.ess`, `(@grade.cost или 1)` → `@grade.cost`, `(@grade.avail или 0)` → `@grade.avail`. Проверка: [снар], [веб-зап].
30. **`device.columns[device_rating, m_attack, m_sleaze, m_dp, m_firewall]`** — добавить `default 0`. `device.modifiers[0…4]`: снять `или 0`. Правку шума `modifiers[5]` не трогать — она уходит в шаг 4. Проверка: [матр], [снар].
31. **`vehicle_mod.mount_slots`** — добавить `default 0`. В правке `mounts_used` снять `или 0`. У `vmod_rigger_interface` снять клетку `mount_slots: 0`. Проверка: [риг].
32. **`sprite_kinds.columns[attack, sleaze, dp, firewall, init]`** — добавить `default 0`. В `sheets.sprite.modifiers[1…5]` снять `(@sprite_kind.<x> или 0)` → `@sprite_kind.<x>`. Проверка: [техно].
33. **`ic_kinds.defense`** — добавить `default "нет"`. Привязка `ic_strike`, аргумент `защита`: `@действующий.ic_kind.defense или "нет"` → `@действующий.ic_kind.defense`. Проверка: [матр].
34. **`matrix_access.on[0].steps[0].value`**: `@level.overwatch или 1` → `@level.overwatch`. Проверка: [матр].
35. **Хвосты «+ 0».**
    - `matrix_check`, `matrix_spike`, `matrix_tarpit`, `ic_attack`: `steps[0].count` → `большее из(0, @pool + @link.penalty)`.
    - В тех же эффектах снять `+ 0` в `steps[2].if`, `steps[4].if`, `steps[7].count`.
    - `matrix_hack` не трогать: у него там настоящие прибавки.
    - Проверка: [матр].
36. **`gear.wireless`** — добавить `default false`.
    - Клетки `laser_sight.aim`, `hidden_holster.conceal_mod`, `bipod.brace`: `@wireless == да` → `@wireless`.
    - Правки `medkit.modifiers[0].if` и `aud_enh_spatial_recognizer.modifiers[0].if`: `@строка.wireless == да` → `@строка.wireless`.
    - Проверка: [снар], [веб-зап].
37. **`creatures.columns[sk_астрал … sk_колдовство]`** (9 колонок) — добавить `default 0`.
    - `creature_template.steps[10…18]`: `@tpl.sk_<x> или 0` → `@tpl.sk_<x>`.
    - Колонку `magic` не трогать: пусто значит «оставить Магию листа».
    - Проверка: [снимок].

### 2.3. Поля да/нет вместо чисел-флагов

38. **`лист.is_device`**: `{number, default 0, min 0, max 1}` → `{boolean, default false}`.
    - `sheets.host.modifiers[0]` и `sheets.ic.modifiers[0]`: значение `1` → `да`.
    - Восемь читателей: `matrix_check`, `matrix_spike`, `matrix_tarpit`, `matrix_hack`, `ic_attack` (`steps[7]`); `cast_form`, `cast_form_attr` (`steps[10]`); `sprite_power_use` (`steps[9]`). Замена: `если(@цель.is_device < 1, @защита.persona, @защита.device)` → `если(@цель.is_device, @защита.device, @защита.persona)`.
    - Проверка: [матр], [техно].
39. **`лист.device_dead`** → `@dev_rating >= 1 и @matrix_damage >= @matrix_cm`, `kind boolean`. **`лист.converged`** → `@overwatch >= 40`, `kind boolean`. Подписки `field:` срабатывают на переход в «да». Проверка: [матр] («ПН 40 — конвергенция»).
40. **`лист.smartlink`** → `{boolean, default false}`, подпись «Смартлинк». Писателей нет.
    - `firearm.sight`: `если(@smartlink >= 1, …)` → `если(@smartlink, …)`.
    - `launch_blast.steps[0]` — снимается в шаге 3.
    - Тесты: [снар]:68 и [осн]:142, `smartlink: 1` → `true`.
41. **`лист.init_half`** → boolean. `лист.initiative`: `если(@init_half >= 1, 2, 1)` → `если(@init_half, 2, 1)`.
    **`лист.has_jack`, `has_medkit`, `has_fa_kit`** → boolean. Правки `cyberjack.modifiers[3]` и `medkit.modifiers[1]`: `1` → `да`. Сложения в писателях нет (только `set`).
    **`bone_density`**, правка `unarmed_physical`: `1` → `да`.
    Проверка: [снар], [матр].

### 2.4. Подписи-ключи → слова (ключи не менять)

42. **`focus_kinds`**: category «Группа источников», bond_mul «Карма привязки: × Мощь», cost_mul «Цена: × Мощь, ¥», avail_add «Доступность: к Мощи», text «Что даёт».
43. **`spirit_kinds`**:
    - body…charisma — «Тело: к Мощи», «Проворство: к Мощи», «Реакция: к Мощи», «Сила: к Мощи», «Воля: к Мощи», «Логика: к Мощи», «Интуиция: к Мощи», «Харизма: к Мощи»;
    - skills «Навыки», powers «Способности», weak «Слабости», move «Движение».
44. **`sprite_kinds`**: attack «Проникновение: к уровню», sleaze «Ускользание: к уровню», dp «Вычислительная мощность: к уровню», firewall «Сетевой экран: к уровню», init «Инициатива: к уровню × 2».
45. **`лист.tm_attack_cap…tm_fw_cap`**: «Отголосок: предел очков Проникновения / Ускользания / Вычислительной мощности / Сетевого экрана».
46. **`creatures`, `grunt_templates`, `contacts_examples`, `primes`, `pr_ranges`, `rep_changes`, `heat_*`, `security_zones`, `locks`, `sensors`, `chem_detect_mods`, `cyber_scan`, `pay_karma`, `pay_money`, `search_mods`, `astral_assense`, `astral_tracking`, `magic_barriers`, `material_resistance`, `metatype_mods`** — подписи по списку разбора части 8 (записи #89–#136). Все колонки сверены: они существуют.
    - Повторяющиеся колонки подписывать одинаково: «Тело», «Проворство», …, «Сущность», «Инициатива: основа», «Кубиков инициативы», «Стр.».
    - `sk_<навык>` → «Навык: <подпись строки skills>».
47. **Описания.**
    - `dead.description` → «Критический урон достиг Тело × 2 (с лишними ячейками) или Сущность 0.»
    - `matrix_hack.description`: «…админ без пользователя — защита +2 к СЭ и +4 к набору…» → «…администратор без доступа пользователя — значение защиты цели +4, набор защиты +2 (стр. 180–181)».

Проверка п. 42–47: [линт], [веб-зап].

### 2.5. Папки

48. **`system.groups`** было: {Атака, Преимущество, Лечение, Действия, Состояния, Общие правила, Снаряжение, Приёмы, Плата}.
    - Стало: {Атака, Преимущество, Действия, Состояния, Общие правила, Плата, Бой, Матрица, Магия, Заклинания, Качества, Транспорт, Химия, Мир, Шаги для других}.
    - «Лечение», «Снаряжение», «Приёмы» сняты: на них нет ссылок. Эффекты между папками не переносить.
    - Проверка: [линт].

### 2.6. Удалить мёртвое

49. **`take_damage.steps[10…13]`** (ветка `@amount >= 1` → `aided_fa=0`, `aided_kit=0` → `end`) удалить. Удалить и колонки `лист.aided_fa` и `aided_kit`. Проверка: [бой], [снимок].
50. **Колонки `лист.edge_ban_charisma`, `edge_ban_logic`, `edge_ban_social`** — удалить. В `on[0].if` у `reroll_failures`, `push_edge`, `edge_reroll_one`, `edge_bump`, `edge_plus_hit` скобка `не (…)` сводится к ветке `edge_ban_hands`:
    - стало: `@бросающий == @носитель и не (@носитель.edge_ban_hands >= 1 и (есть(@roll.tags, "атака") или есть(@roll.tags, "стрельба") или есть(@roll.tags, "ближний бой") или есть(@roll.tags, "экзотическое оружие") или есть(@roll.tags, "взлом замков"))) <хвост прежний>`.
    - `edge_ban_hands` и `shaky_hands` оставить.
    - Проверка: [пров], [веб-обл]:122 и :136 (строки условий поправить под новый текст).
51. **Аргумент `note`** в `on[0].cost[0].args` у `reroll_failures`, `push_edge`, `edge_reroll_one`, `edge_bump`, `edge_init`, `edge_plus_hit` — удалить. Умолчание у `spend_edge.note` есть, а отказ реакции «увидев кости» не показывается.
    - У `second_wind` и `shrug_off` `note` не трогать: на снимке есть строки «нужно 4 очк.».
    - Проверка: [пров], [веб-обл] — в `spendFromHolder` (около стр. 105) убрать строку «Если не хватает».
52. **`лист.bio_resist_bonus`** — удалить. В `matrix_hurt.steps[7].count` снять хвост `+ @лист.bio_resist_bonus`. Проверка: [матр].
53. **Пустые колонки и справочники.**
    - Колонку `matrix_defenses.text` удалить (пуста в 14 строках). Колонку `spell_defenses.text` удалить (пуста в 15 строках).
    - `spell_defenses.pool`: `default 0`, подпись «Набор защиты». Снять `pool: 0` у строк «исцеление», «критические», «порог», «Сопротивление материалов», «Мощь источника × 2», «нет». Строке «исцеление» дать `label` «5 − Сущность цели».
    - Клетку «Воля + выбранная характеристика» не трогать.
    - Таблицу `adversaries` удалить.
    - Колонку `metatypes.ranges` удалить.
    - Таблицу `submersion` удалить, её текст перенести в `hint` поля `лист.submersion_grade` (формулировка — по части 8, #108).
    - Колонку `spell.status` и клетку `status: "burning"` у `spell_fireball` удалить.
    - Проверка: [матр], [закл], [техно].
54. **Записи компендиума.**
    - Удалить `soft_autosoft` (дубль типа `autosoft`) и `sec_biometric` (дубль `acc_biometric_reader`).
    - У `drug_alcohol` удалить клетки `boosts`, `dur_expr`, `statuses`, `damage`, `speed_rounds`, `page`, `crash: ""`.
    - У `drug_jazz` удалить `speed_rounds`, `damage`, `statuses`, `dur_expr`, `boosts`, `dur_dice`, `crash_minutes_mul`, `page`.
    - У `tox_gamma_scopolamine` удалить `speed_rounds` и `page`. Клетку `statuses` оставить до J, клетка `damage` уходит в шаге 4.
    - У `veh_drive` и `wd_creature` снять аргумент `действующий` (вход-лист связывает `act.ts`), а следом пустой ключ `args`.
    - У листа «Бритва» удалить `values.essence` (Сущность — формула).
    - Проверка: [осн], [риг], [веб-зап].
55. **Повторы клеток — перенести в тип.**
    - `autosoft.columns`: переопределить по ключу `{cost: expr @rating * 500}`, `{avail: expr @rating}`, `{rating_max: default 9}`, `{legal: default "свободно"}`. У шести записей `as_*` снять эти четыре клетки.
    - `focus.columns`: `{cost: expr @rating * @focus_kind.cost_mul}`, `{avail: expr @rating + @focus_kind.avail_add}`. У `focus_ritual`, `focus_power`, `focus_weapon` снять клетки `cost` и `avail` (сверено: 4000/0, 18000/3, 7000/3).
    - `prone_pool`: в `weapon` добавить колонку `{prone_pool «Атакующий лёжа: к набору», number, default 0}`. Из `firearm` её удалить. В `melee` оставить `{key: prone_pool, default: -4}`. Клетку `-4` у `bow` оставить.
    - Проверка: [снар], [бой], [веб-зап] (цены `bow` и `cybereyes`).

## Шаг 3

### 3.1. Определения функций

Все функции — в папке «Шаги для других».

**A. `attack_cost` «Плата за атаку»** (новая).
- Входы: `действующий` «Кто атакует» (sheet, role actor); `приём` «Приём» (choice из `edge_actions`, default «нет»).
- Шаги:
  1. `branch @приём.cost >= 1` → `emit spend_edge(лист=@действующий, amount=@приём.cost, note="не хватает Преимущества на приём")` → `end`.
  2. `emit spend_action(лист=@действующий, сложное=да, простых=если(@действующий.cover >= 1 и не @приём.cover_free, 1, 0) + если(@приём.simple, 1, 0))`.
- Итогов нет.

**B. `attack_roll` «Бросок атаки»** (новая).
- Входы: `кто` (sheet, role actor), `набор` (number), `атк` «Значение атаки» (number), `зщ` «Наивысшее значение защиты целей» (number).
- Шаги:
  1. `roll id «атака_бросок»`, die pool, count `большее из(0, @набор + @кто.aim_bonus)`, tags `[атака]`, by `@кто`.
  2. `apply @кто.aim_bonus set 0`.
  3. `branch @атк - @зщ >= 4 и @кто.cover < 1` → `emit gain_edge(лист=@кто)` → `end`.
- Итоги: `успехов` (number) = `@атака_бросок`.
- Проба: трасса плоская (общий `sink`), и окно «увидев кости» открывается и внутри вызова (`run.ts:598`, `seen` у любого броска с `by`). Поэтому реакции Преимущества и поиск шага `атака_бросок` в тестах сохраняются.

**C. `scatter` «Рикошет»** (новая).
- Входы: `успехов` (number), `поправка` «Поправка к успехам» (number).
- Шаги:
  1. `roll id «метров»`, fixed `большее из(0, кинуть(2к6) - @успехов - @поправка)`.
  2. `apply @стол.scatter set @метров`.
- Итоги: `метров`.
- Знак в клетках `ranges` не переворачивать (см. «Отложено»).

**D. `resist_damage` «Сопротивиться урону»** (новая).
- Входы:
  - `лист` «Кто сопротивляется» (sheet, role target);
  - `источник` (sheet, role actor, optional);
  - `величина` «Урон до сопротивления» (number, role amount);
  - `физический` (boolean, default true);
  - `электричество` (boolean, default false);
  - `сила` «СУ для брони транспорта» (number, optional).
- Шаги:
  1. `roll id «сопротивление_бросок»`, count `@лист.soak`, tags `[сопротивление]` (только эта метка), by `@лист`.
  2. `emit id «вред» take_damage(лист=@лист, источник=@источник, amount=большее из(0, @величина - @сопротивление_бросок), physical_hit=@физический, dv=@сила, electric=@электричество)`. Пустой `сила` выпадает, и `dv` в `take_damage` остаётся пустым.
- Итоги: `урон` = `@вред.урон`.

**E. `blast_damage`** (переделка, тонкая функция). Через `strike_damage` её **не** вести: см. «Отложено».
- Входы: `цель` (sheet, role target), `су` «Сила урона» (number), `физический` (boolean, default true), `электричество` (boolean, default false).
- Шаги (было 9 элементов):
  1. `emit id «вред» resist_damage(лист=@цель, источник=@цель, величина=@су, физический=@физический)`. Аргумент `электричество` **не** передавать: сейчас `take_damage` его от взрыва не получает.
  2. `branch @электричество и @вред.урон >= 1` → `status shocked` на `@цель` → `end`.
  3. `branch @вред.урон > @цель.body` → `status prone` → `end`.
- Итоги: `урон`.
- Правило «лёжа −2» переносится в `prone.modifiers`: `{kind: edit, call: blast_damage, param: су, op: add, value: {expr: "-2"}, if: {expr: "@цель == @носитель"}}`. В описание `prone` дописать «против взрыва СУ −2». Роль `amount` у `су` не нужна: эффект вызывается шагом (`engine/effects.ts: calledOf`).

**F. `implant_blast`** (переделка).
- Входы: `лист` «Носитель» (sheet, role **actor**: носитель взрывает себя, цель не спрашивается), `су` (number).
- Шаги: один `emit id «вред» resist_damage(лист=@лист, величина=@су, физический=да)`.
- Итоги: `урон`.
- Набор Тела заменяется на `@лист.soak`; у людей `soak` равен Телу. Шаг в трассе теперь зовётся `сопротивление_бросок`, а не `тело`. Тест [маг]:70 проверяет только physical = 18.

**G. `can_cast` «Владеет магией»** (новая).
- Входы: `лист` (sheet, role actor), `навык` (choice из `magic_skills`).
- Шаги:
  1. `branch @лист.awakened == "аспектный маг" и @лист.aspect != @навык` → `stop "аспектный маг владеет только навыком «своим»"` → `end`.
  2. `branch @лист.magic < 1` → `stop "нет Магии"` → `end`.

**H. `drain_kinds` + `spell_drain`** (решение раздела 2).
- Справочник `drain_kinds` «Вид отдачи», `key: word`. Строки: «истощение», «угасание формы», «угасание компиляции».
- Колонки:
  - `pool` «Набор сопротивления» (number, формулы по строкам): `@лист.drain_pool` / `@лист.willpower + @лист.logic` / `@лист.willpower + @лист.charisma`.
  - `limit` «Физический, если больше» (field): `magic` / `resonance` / `resonance`.
  - `lasting` «Не лечится» (boolean, default false): да у «истощения».
  - `tag` «Метка броска» (text): «сопротивление истощению» / «угасание» / «угасание».
- В `spell_drain` добавить вход `вид` (choice из `drain_kinds`, default «истощение»).
  - `steps[0].count` → `большее из(0, @вид.pool)`; tags → `["сопротивление", {expr: "@вид.tag"}]`.
  - `steps[1]`: `id «вред»`, `physical_hit` → `@si - @выдержка.total > @лист.[@вид.limit]`, `drain` → `@вид.lasting`.
  - Итог `урон` → `@вред.урон`.
- Если `@лист.[@вид.limit]` не соберётся, сделать `limit` числом-формулой (`@лист.magic` / `@лист.resonance`).
- Эффект `fading` удалить в том же коммите, что и вызовы.

**I. `heal_damage` «Снять урон»** (новая).
- Входы: `лист` (sheet, role target), `amount` (number, role amount), `physical` (boolean, default true).
- Шаги: `branch @physical` → `apply @лист.physical subtract меньшее из(@лист.physical, @amount)` → `orElse` → то же для `stun` → `end`.

**J. `attr_test` «Проверка характеристик»** (новая).
- Входы: `лист` (sheet, role actor), `набор` (number), `порог` (number).
- Шаги:
  1. `roll id «бросок»`, count `@набор`, tags `[проверка]`, by `@лист`.
  2. `check id «итог»`, value `@бросок`, versus `@порог`.
- Итоги: `успех` (boolean) = `@итог.success`; `чистые` = `большее из(0, @итог.margin)`.
- Штрафы не прибавлять.

**K. `matrix_ready` «Готовность к Матрице»** (новая).
- Входы: `действующий` (sheet, role actor), `целей` (number, default 1), `link` (choice из `matrix_links`, default «нет»), `check_vm` (boolean, default true).
- Шесть стопов с прежними словами, в прежнем порядке:
  1. `@целей > 1 + @действующий.m_fork`;
  2. `@действующий.dev_rating < 1`;
  3. `@check_vm и @действующий.m_dp < 1 и @действующий.dev_dp >= 1`;
  4. `@действующий.device_dead`;
  5. `@действующий.noise > @действующий.dev_rating`;
  6. `@link == "Проникновение" и @действующий.m_attack < 1 или @link == "Ускользание" и @действующий.m_sleaze < 1`.

**L. `matrix_defend` «Отпор в Матрице»** (новая).
- Входы:
  - `цель` (sheet, role target), `действующий` (sheet, role actor), `взлом` (kind roll);
  - `защита` (choice из `matrix_defenses`, default «нет»);
  - `illegal` (boolean, default false), `порог` (number, default 0);
  - `к_зщ`, `к_защите` (number, default 0);
  - `edge_at_threshold` (boolean, default false).
- Шаги:
  1. `branch (@edge_at_threshold или @защита != "порог" и @защита != "нет") и @действующий.matrix_ar - (@цель.matrix_dr + @к_зщ - если(@illegal, @действующий.m_def_cut, 0)) >= 4` → `gain_edge(@действующий)`; `orElse` — то же в обратную сторону → `gain_edge(@цель)`; `end`.
  2. `roll id «отпор»`, count `большее из(0, если(@цель.is_device, @защита.device, @защита.persona) + @к_защите)`, tags `[защита, матрица]`, by `@цель`.
  3. `check id «итог»`, value `@взлом`, versus `если(@защита == "порог", @порог, @отпор)`.
  4. `branch @illegal и @защита != "порог" и @защита != "нет"` → `apply @действующий.overwatch add если(@действующий.ow_hide >= 1, 0, @отпор.total + если(@действующий.hack_programs >= 1, 1, 0))` → `end`.
- Итоги: `вышло` (boolean, no «не вышло») = `@итог.success`; `чистые` = `большее из(0, @итог.margin)`; `успехов` = `@итог.total`.

**M. `bio_hurt` «Биоотдача»** (новая).
- Входы: `лист` (target), `amount` (role amount), `оглушающая` (boolean, default false).
- Шаги — перенос `matrix_hurt.steps[6…9]` (уже без `bio_resist_bonus`): `branch @amount >= 1 и (@лист.matrix_mode == "холодная ВР" или … "горячая ВР")` → `roll «воля»` → `emit take_damage(amount=большее из(0, @amount - @воля.total), physical_hit=не @оглушающая и @лист.matrix_mode == "горячая ВР")` → `end`.
- У `matrix_hurt` удалить входы `bio` и `bio_stun` и шаги 6–9.

**N. `matrix_harm` «Нанести урон Матрицы»** (новая).
- Входы: `лист` (target), `amount` (role amount), `extra` (number, default 0).
- Шаги: `branch @лист.awakened == "техномант"` → `take_damage(лист=@лист, amount=@amount, physical_hit=нет)` → `orElse` → `apply @лист.matrix_damage add @amount + @extra` → `end`.

### 3.2. Вызывающие

1. **`spend_action` вместо копий.**
   - В `throw_blast.cost[9…14]`, `launch_blast.cost[9…14]`, `detonate.cost[3…8]`, `cast_spell.cost[12…17]`, `heal_spell.cost[9…14]`, `boost_spell.cost[9…14]`, `cast_form.cost[6…11]`, `cast_form_attr.cost[6…11]` заменить на `emit spend_action(лист=@действующий, сложное=да)`.
   - В `matrix_check`, `matrix_spike`, `matrix_tarpit`, `matrix_hack` (`cost[18…28]`) и `ic_attack` (`cost[15…25]`) заменить на `emit spend_action(лист=@действующий, сложное=@kind == "сложное", простых=если(@kind == "простое", 1, 0))`.
   - Слова стопа для простого действия станут «простых действий на этом ходу не хватает» (смысл тот же).
   - Проверка: [бой], [закл], [маг], [матр], [техно], [осн]. [снимок] обновить один раз после просмотра разницы.
2. **`shoot`.**
   - `cost[15…18]` → `emit attack_cost(действующий=@действующий, приём=@приём)`.
   - `steps[6…10]` → `emit id «атака» attack_roll(кто=@действующий, набор=@attack_pool + @приём.pool + если(@действующий.prone >= 1, @вещь.prone_pool, 0), атк=@атк, зщ=большее из(@цели.defense_rating))`.
   - `steps[12]` (теперь со сдвигом): `успехов` → `@атака.успехов`.
   - Проверка: [бой], [калк], [осн]:284, [веб-сб].
3. **`melee_strike`.** `cost[0…3]` → `attack_cost`. `steps[2…6]` → тот же вызов `attack_roll` (набор с `@вещь.prone_pool`). В `steps[8]`: `успехов` → `@атака.успехов`. Проверка: [бой], [калк].
4. **`throw_blast` и `launch_blast`, рикошет.**
   - `throw_blast.steps[2…3]` → `emit id «рикошет» scatter(успехов=@атака_бросок.total, поправка=@дистанция.throw_ricochet)`.
   - `launch_blast.steps[2…3]` → `scatter(успехов=@атака_бросок.total, поправка=0 - @дистанция.launch_ricochet)`.
   - `launch_blast.steps[0]` (атк) → `@дистанция.item_ar + @вещь.sight`: это дословно колонка `firearm.sight`.
   - Проверка: [осн] (Страйкер, гранаты).
5. **`strike_damage.steps[0…1]`** → `emit id «вред» resist_damage(лист=@цель, источник=@источник, величина=если(@без_урона, 0, @су), физический=@физический, электричество=@электричество, сила=если(@без_урона, 0, @су))`. Ветки `steps[2…10]` и итог не трогать. Проверка: [бой]:81 и :129, [калк].
6. **Вызовы `blast_damage`.**
   - `throw_blast.steps[6]` → `(цель=@цель, су=@кольцо.grenade_dv, физический=@вещь.physical_dmg, электричество=@вещь.electric)`.
   - `launch_blast.steps[6]` → `(цель, су=@кольцо.rocket_dv, физический=сколько(строки("grenade", "damage_kind", @вещь), "оглушающий") < 1, электричество=сколько(строки("grenade", "electric", @вещь), да) >= 1)`.
   - `detonate.steps[5]` → `(цель, су=@кольцо.charge_dv)`.
   - Проверка: [осн].
7. **Вызовы `implant_blast`.**
   - `device_bricked`: `{действующий=@носитель, amount=@носитель.implant_dead_dv}` → `{лист=@носитель, су=@носитель.implant_dead_dv}`.
   - Привязка `cortex_bomb_micro` «Детонация»: `{действующий=@действующий, amount=18}` → `{лист=@действующий, су=18}`.
   - Проверка: [маг]:70, [матр].
8. **`burning.on[0]`, `corroded.on[0]`** (roll «стойкость» + `take_damage`) → `emit resist_damage(лист=@носитель, величина=@level)`. **`poisoned.on[0].steps[0…1]`** → то же с `физический=@physical_hit`; снятие и повторное наложение не трогать. Проверка: [осн], [закл].
9. **`cast_spell.steps[17…18]`** («косвенное») → `emit id «вред» resist_damage(лист=@цель, источник=@действующий, величина=округлить вверх(@действующий.magic / 2) + большее из(0, @итог.margin) + @amp, физический=@damage.physical)`. Вход `сила` не передавать. Ветку «Распластан» (`steps[19…21]`) оставить. Проверка: [закл].
10. **`can_cast`.** У `cast_spell`, `heal_spell`, `boost_spell`, `ritual_cast` `cost[0…5]` заменить на `emit can_cast(лист=@действующий, навык="колдовство")`; у `summon_spirit` — на `навык="воплощение"`. Проверка: [закл], [маг], [веб-разв] (`summon_spirit`).
11. **Угасание через `spell_drain`.**
    - `cast_form.steps[1]` и `cast_form_attr.steps[1]` → `emit spell_drain(лист=@действующий, si=@fading_si, вид="угасание формы")`.
    - `compile_sprite.steps[4]` → `spell_drain(лист=@действующий, si=@отпор.total, вид="угасание компиляции")`.
    - Проверка: [техно], [закл]:94 («выдержка» = 9).
12. **`heal_spell.steps[14…20]`** → `branch @stabilize` → `heal_damage(лист=@цель, amount=@цель.critical)` → `orElse` → `heal_damage(лист=@цель, amount=большее из(0, @итог.margin), physical=@heal_kind.physical)` → `end`. Проверка: [закл].
13. **`attr_test`.**
    - `nauseated.on[0]`: `emit id «тошнота» attr_test(лист=@носитель, набор=@носитель.body + @носитель.willpower, порог=2)`; apply `nausea_lost`: `если(@тошнота.успех, 1, 2)`.
    - `insecurity_check.on[0]`: `emit id «выдержка» attr_test(лист=@носитель, набор=@носитель.willpower, порог=2)`; `branch не @выдержка.успех` → `status insecurity_shaken` → `end`.
    - Проверка: [снимок].
14. **Матрица.**
    - **`matrix_check`, `matrix_spike`, `matrix_tarpit`, `matrix_hack`:** `cost[0…17]` → `emit matrix_ready(действующий=@действующий, целей=сколько(@цели), link=@link)`, за ним вызов `spend_action` из п. 1. `steps[2…14]` → `emit id «отпор_итог» matrix_defend(цель=@цель, действующий=@действующий, взлом=@взлом, защита=@защита, illegal=@illegal, порог=@порог, edge_at_threshold=да)`, затем `branch не @отпор_итог.вышло` → `stop "не вышло"` → `end`.
    - **У `matrix_hack`** дополнительно: `к_зщ=если(@level == "администратор" и не @had_user, 4, 0)`, `к_защите=если(@level == "администратор" и не @had_user, 2, 0)`.
    - **`matrix_spike.steps[15]`** → `matrix_hurt(лист=@цель, amount=округлить вверх(@действующий.matrix_ar / 2) + @отпор_итог.чистые)`, затем `branch @действующий.m_bio + @действующий.m_bio_stun >= 1` → `bio_hurt(лист=@цель, amount=то же, оглушающая=@действующий.m_bio < 1 и @действующий.m_bio_stun >= 1)` → `end`.
    - **`matrix_tarpit.steps[15]`** — то же с `amount = 1 + @отпор_итог.чистые`; в `steps[19]` (`matrix_drain`) `amount` = `1 + @отпор_итог.чистые`.
    - **`ic_attack`:** `cost[0…14]` → `matrix_ready(…, check_vm=нет)` (у льда стопа по ВМ нет), затем `spend_action`. `steps[2…14]` → `matrix_defend(…, edge_at_threshold=да)` + стоп. В `steps[15…34]` выражение `@итог.total - если(@защита == "порог", @порог, @отпор.total)` заменить на `@отпор_итог.чистые`. Искрящий: `matrix_hurt(лист=@цель, amount=0)` + `bio_hurt(лист=@цель, amount=@действующий.host_rating + @отпор_итог.чистые)`. Чёрный: `matrix_hurt` + `bio_hurt` с той же суммой. Убрать `bio: 0`.
    - **`matrix_hurt.steps[1…5]`** → `emit matrix_harm(лист=@лист, amount=большее из(0, @amount - @экран.total), extra=если(@amount >= 1, @лист.m_vm_extra, 0))`.
    - **`cast_form` и `cast_form_attr`:**
      - `steps[3…14]` → `emit id «отпор_итог» matrix_defend(цель=@цель, действующий=@действующий, взлом=@форма, защита=@защита, illegal=@illegal, порог=@threshold или @порог)`, `edge_at_threshold` не передавать.
      - Дальше: `@итог.success` → `@отпор_итог.вышло`; в шаге «величина» `большее из(0, @итог.margin)` → `@отпор_итог.чистые`, `@итог.total` → `@отпор_итог.успехов`.
      - Ветки `steps[16…19]` слить в одну `@outcome == "урон Матрицы"` → `matrix_harm(лист=@цель, amount=@величина)`.
    - **`sprite_power_use.steps[2…10]`** → `emit id «отпор_итог» matrix_defend(цель, действующий, взлом=@способность, защита, порог=@порог)`. Дальше `@итог.success` → `@отпор_итог.вышло`, `@итог.total` → `@отпор_итог.успехов`.
    - **`convergence.on[0].steps[0…2]`** (копия «в ВР → dumpshock») — удалить. Демпшок даст `device_bricked`, кость та же.
    - Проверка: [матр] («отпор» ищется плоско, `:150`), [техно], [снимок].
15. **`drive_check`.** Сразу после `each` вставить:
    - `{id «набор», roll, fixed: большее из(0, если(@действующий == @цель, @цель.as_maneuver + @цель.veh_pilot, если(@цель.jumped, @цель.rig_pilot + @цель.rig_int + @цель.rig_vcr, @действующий.skills.пилотирование.pool)) - @цель.veh_speed_pen)}`;
    - `{id «порог», roll, fixed: большее из(0, @цель.veh_handling - если(@цель.jumped, @цель.rig_vcr, 0) + @shift)}`.

    `count` у «вождение» и «удержать» → `@набор`; `versus` у «итог» и «авария» → `@порог`. Проверка: [риг].

## Шаг 4

### 4.1. Новые колонки справочников

| Таблица | Ключ «Подпись» | Вид, умолчание | Значения по строкам |
|---|---|---|---|
| `fire_modes` | `ease` «Гашение отдачи» | number, 0 | короткая и длинная очередь `{expr @вещь.recoil_burst}`; непрерывный огонь `{expr @вещь.recoil_full}` |
| `fire_modes` | `penalty` «К значению атаки: остаток очереди и гашение» | number, формула колонки `меньшее из(0, если(@выстрелов >= 1 и @выстрелов < @строка.rounds, 0 - @выстрелов, @строка.ar) + @строка.ease)` | — |
| `fire_modes` | `dv_shot` «К урону: остаток очереди» | number, формула колонки `если(@выстрелов >= 1 и @выстрелов < @строка.rounds, если(@выстрелов >= 2, 1, 0), @строка.dv)` | — |
| `fire_modes` | удалить `ease_burst`, `ease_full` и их клетки | | |
| `ranges` | `throwable` «Можно метнуть» | boolean, false | да: вплотную, близкая, средняя |
| `action_kinds` | `complex` «Сложное» | boolean, false | да: «сложное» |
| `action_kinds` | `simple` «Простых действий» | number, 0 | 1: «простое» |
| `matrix_modes` | `online` «В Матрице» | boolean, **false** | да: ДР, холодная ВР, горячая ВР |
| `matrix_modes` | `vr` «Виртуальная реальность» | boolean, false | да: холодная и горячая ВР |
| `matrix_modes` | `hot` «Горячий сим» | boolean, false | да: горячая ВР |
| `matrix_modes` | `init_base` «Основа инициативы» | number, формула колонки `@reaction + @intuition` | холодная и горячая ВР `{expr @awakened.vr_init}` |
| `awakened_kinds` | `living_persona` «Живой аватар» | boolean, false | да: техномант |
| `awakened_kinds` | `vr_init` «Инициатива в ВР» | number, формула колонки `@intuition + @m_dp` | техномант `{expr @logic + @intuition}` |
| `awakened_kinds` | `drain_pool` «Сопротивление истощению» | number, формула колонки `@willpower + @trad_attr` | адепт `{expr @body + @willpower}` |
| `awakened_kinds` | `one_skill` «Один магический навык» | boolean, false | да: аспектный маг |
| `awakened_kinds` | `programs_cap` «Программ можно запустить» | number, 99 | 0: техномант |
| `astral_modes` | `active` «В астрале» | boolean, false | да: восприятие, проекция |
| `astral_modes` | `dr` «Значение защиты» | number, формула колонки `@defense_rating` | проекция `{expr @astral_dr}` |
| `spell_defenses` | `opposed` «Встречная проверка» | boolean, false | да у девяти строк: Воля + Интуиция, Реакция + Воля, Тело + Воля, Логика + Воля, Воля, Интуиция + Логика, Тело, Тело + Сила, Воля + выбранная характеристика |
| `spell_defenses` | `versus` «Против чего» | number, формула колонки `@отпор` | исцеление `большее из(0, округлить вниз(5 - @цель.essence))`; критические `@цель.critical`; порог / Сопротивление материалов / Мощь источника × 2 `@threshold или @порог`; «нет» — явное `0` |
| `spell_elements` | `status` «Накладывает» | effect | огонь burning, кислота corroded, холод chilled, электричество shocked |
| `matrix_links` | `zero` «Связанная характеристика на нуле» | boolean, false | Проникновение `{expr @действующий.m_attack < 1}`, Ускользание `{expr @действующий.m_sleaze < 1}` |
| `access_levels` | `dr_bonus` «К ЗЩ цели без доступа пользователя» | number, 0 | 4: администратор |
| `access_levels` | `pool_bonus` «К набору защиты без доступа пользователя» | number, 0 | 2: администратор |
| `program_kinds` | `hacking` «Программа взлома» | boolean, false | да: взлом |
| `matrix_defenses` | `opposed` «Встречная» | boolean, **true** | нет: «порог», «нет» |
| `matrix_defenses` | `by_threshold` «По порогу» | boolean, false | да: «порог» |
| `ic_kinds` | `dmg` «Урон Матрицы» | number | взрывной `@действующий.host_rating`; искрящий `0` (именно 0: кость Сетевого экрана сохраняется); убивающий и чёрный `@действующий.host_rating + @отпор_итог.чистые` |
| `ic_kinds` | `bio` «Биоотдача» | number | искрящий, чёрный `@действующий.host_rating + @отпор_итог.чистые` |
| `ic_kinds` | `lock` «Залипание» | boolean, false | да: взрывной, липнущий |
| `ic_kinds` | `cut` «Снижает» | choice из `matrix_attrs` | едкий СЭ, подавляющий П, проявляющий У, сковывающий ВМ |
| `implant_slots` | `cultured` «Культивированный» | boolean, false | да: культивированный |
| `device_kinds` | `noise_per_rating` «Шумоподавление на рейтинг» | number, 0 | 1: РПУ |
| `veh_control` (новая, `key: word`) | строки «сам», «водитель», «захват». `pool` «Набор вождения», `inside` «Ведущий внутри», `dr` «Пилотирование к защите», `ar` «Пилотирование к атаке» | `pool` number; `inside` boolean, false; `dr` и `ar` number | `pool`: сам `@цель.as_maneuver + @цель.veh_pilot`, водитель `@действующий.skills.пилотирование.pool`, захват `@цель.rig_pilot + @цель.rig_int + @цель.rig_vcr`. `inside`: да у водителя и захвата. `dr`: `@as_maneuver` / `@driver_pilot` / `@rig_pilot`. `ar`: `@veh_pilot` / `@driver_pilot` / `@rig_pilot` |
| `toxin_vectors` (новая, `key: word`) | строки контактный, поглощаемый, вдыхаемый, инъекционный. `cut` «Сила ниже на» | number, формула колонки `@цель.tox_cut` | вдыхаемый `{expr @цель.tox_cut + @цель.tox_cut_inhaled}` |
| `form_outcomes` (новая, `key: word`) | 9 строк: урон Матрицы, лечение Матрицы, шум цели +, ПН цели +, свой ПН −, свой шум −, характеристика +, характеристика −, нет. Колонки `status` «Висящее», `on_self` «На себя», `amount` «Величина висящего» | `status` effect; `on_self` boolean, false; `amount` number | `status`: свой шум − form_channel, характеристика + form_infusion, характеристика − form_diffusion. `on_self`: да у «свой шум −». `amount`: `@величина` / `меньшее из(@величина, @attr.target_device)` / `меньшее из(@величина, большее из(0, @attr.target_persona - 1))` |
| `sprite_power` | `outcome` → `status` «Накладывает при успехе» и `hit_now` «Урон Матрицы сразу» | `status` effect; `hit_now` number, 0 | клетка `spw_trap`: status sprite_trap; `outcome` у `spw_hash` снять |
| `weapon_classes` | `mods` (text) → `mounts` «Места креплений» | choice из `mounts`, many | «сверху» → [сверху]; «сверху, ствол» → [сверху, ствол]; «сверху, ствол, подствол» → [сверху, ствол, подствол]; «сверху, подствол» → [сверху, подствол]; «нельзя» и пусто — без клетки |

### 4.2. Замены формул и связанные правки

1. **`shoot`.**
   - `steps[4]` (атк) → `@дистанция.item_ar + @режим.penalty + @вещь.sight + @вещь.ammo_ar + если(@действующий.prone >= 1, @вещь.prone_ar + @вещь.brace_bonus, 0) + @действующий.ar_mod`.
   - `steps[5]` (ур) → `@dv + @режим.dv_shot + @приём.dv + @вещь.ammo_dv`.
   - Шаг «выстрелов» не переименовывать: его читают клетки.
   - Проверка: [бой], [калк].
2. **`throw_blast.cost[6]`** → `не @дистанция.throwable`. Проверка: [осн].
3. **`cover.modifiers[1]`** (правка броска «атака»): `value если(@level >= 4, -2, 0)` → `-2`; `if` → `@бросающий == @носитель и @level >= 4`. Проверка: [бой].
4. **`spend_action` в пяти эффектах Матрицы:** `сложное=@kind.complex`, `простых=@kind.simple`. Проверка: [матр].
5. **Инициатива и техномант.**
   - `лист.initiative` → `округлить вниз((@matrix_mode.init_base + @wound_mod + @condition_mod + @init_mod) / если(@init_half, 2, 1))`.
   - `лист.drain_pool` → `@awakened.drain_pool`.
   - `лист.programs_loaded.max` → `@awakened.programs_cap`.
   - `sheets.runner.modifiers[7…11].if` → `@awakened.living_persona`.
   - `cast_form.cost[0]`, `cast_form_attr.cost[0]`, `compile_sprite.cost[0]` → `не @действующий.awakened.living_persona`.
   - `matrix_harm.steps[0]` → `@лист.awakened.living_persona`.
   - `can_cast.steps[0]` → `@лист.awakened.one_skill и @лист.aspect != @навык`.
   - Проверка: [матр] (холодная и горячая ВР), [техно], [маг] (истощение 9).
6. **Режимы Матрицы.**
   - `bio_hurt.steps[0]` → `@amount >= 1 и @лист.matrix_mode.vr`; его `physical_hit` → `не @оглушающая и @лист.matrix_mode.hot`.
   - `dumpshock.steps[0]` → `не @лист.matrix_mode.vr`; `steps[4].physical_hit` → `@лист.matrix_mode.hot`.
   - `device_bricked.on[0].if` → `@лист == @носитель и (@носитель.matrix_mode.online или @носитель.implant_dead_dv >= 1)`; `steps[0]` → `@носитель.matrix_mode.vr`.
   - `cyberjack`, правка `init_dice` → `если(@matrix_mode.vr, если(@строка.rating >= 4, 2, 1), 0)`.
   - `burned_out`, правка `edge_no_spend` → `если(@matrix_mode.online, 1, 0)`.
   - Проверка: [матр], [маг].
7. **Астрал.** `лист.plane_dr` → `@astral_mode.dr`. `sheets.runner.modifiers[6].if` → `@бросающий == @носитель и @носитель.astral_mode.active`. Проверка: [закл].
8. **Защиты заклинаний.**
   - В `cast_spell`, `heal_spell`, `boost_spell`: `steps[2].if` → `@defense.opposed и @действующий.spell_ar - большее из(@цели.plane_dr) >= 4`; `steps[6].if` → `@defense.opposed`; `steps[12].versus` → `@defense.versus`.
   - Сначала узкая проба: клетка с `@отпор` отдаёт в проверку бросок, и линт не ругается. Если нет — колонку `versus` в «Отложено».
   - Проверка: [закл].
9. **Стихии.**
   - `cast_spell.steps[22…30]` → `branch большее из(0, @итог.margin) >= 1` → `{status, effect: {expr @element.status}, to @цель, args {level: большее из(0, @итог.margin)}}` → `end`. Следующий `orElse @sustain…` остаётся рукой той же цепочки.
   - У `chilled` и `shocked` вход `rounds` → `level` (подпись «Раундов», умолчания 3 и 2, min 1); `duration.max` → `@level`.
   - Тесты: [закл]:66 `.rounds` → `.level`; [веб-обл]:49–58 — `param(…, 'level')`, формула `@level`.
10. **`matrix_ready`, стоп 6** → `@link.zero`. Проверка: [матр].
11. **`matrix_hack`, вызов `matrix_defend`:** `к_зщ` → `если(@had_user, 0, @level.dr_bonus)`, `к_защите` → `если(@had_user, 0, @level.pool_bonus)`. Проверка: [матр] (MX-4, had_user).
12. **`program.modifiers[0]`** → `если(@строка.category.hacking, 1, 0)`. Проверка: [матр].
13. **Тело `matrix_defend`.**
    - `versus` → `если(@защита.opposed, @отпор, если(@защита.by_threshold, @порог, 0))`.
    - Условие ПН → `@illegal и @защита.opposed`.
    - В обеих ветках ±4: `(@edge_at_threshold или @защита.opposed)`.
    - Проверка: [матр], [техно].
14. **`ic_attack.steps[15…34]`** заменить четырьмя ветками, каждая закрывается `end`:
    1. `не пусто(@действующий.ic_kind.dmg)` → `matrix_hurt(лист=@цель, amount=@действующий.ic_kind.dmg)`;
    2. `не пусто(…bio)` → `bio_hurt(лист=@цель, amount=@действующий.ic_kind.bio)`;
    3. `@действующий.ic_kind.lock` → `status link_lock`;
    4. `не пусто(…cut)` → `status matrix_stat_cut(attr=@действующий.ic_kind.cut, amount=@отпор_итог.чистые)`.

    Проверка: [матр]. [веб-разв]:56 ждёт руку «чёрный:» — тест перевести на развилку по полю листа, собранную в самом тесте.
15. **Импланты и устройства.**
    - `bioware.cultured`: `expr @slot.cultured`; клетку `cultured: true` у `reflex_recorder` снять.
    - `device.noise_cut`: `expr @device_rating * @device_kind.noise_per_rating`; правка шума → `0 - @строка.noise_cut`; клетку `noise_cut: 3` у `dev_rcc_dronemaster` снять.
    - Проверка: [снар], [риг].
16. **Сложные формы — `form_outcomes`.**
    - Вход `outcome` у `cast_form` и `cast_form_attr` и колонка `complex_form.outcome` → choice из `form_outcomes` (default «нет»).
    - Ветки `apply` остаются блоком по `@outcome ==`.
    - Три ветки «Наложить» заменить одним шагом после блока: `{status, effect: {expr @outcome.status}, to: {expr если(@outcome.on_self, @действующий, @цель)}, args {attr: @attr, amount: @outcome.amount}}`.
    - Держание через `sustaining` не трогать.
    - Проверка: [техно].
17. **`sprite_power_use`, ветки исхода.**
    - Вход `outcome` → входы `status` (effect, optional) и `hit_now` (number, default 0).
    - `steps[12…19]` → `{status, effect: {expr @status}, to @цель}` без `dmg` и `amount` (раздел 2), затем `branch @hit_now >= 1` → `matrix_hurt(лист=@цель, amount=@hit_now)` → `end`.
    - Привязки: у `spw_trap` `outcome` → `status: "sprite_trap"`; у `spw_hash` `outcome` снять.
    - `sprite_power.action` → choice из `action_kinds`.
    - Проверка: [техно].
18. **Навык броска.** Входы `skill` у `cast_form`, `cast_form_attr`, `sprite_power_use` и колонки `complex_form.skill`, `sprite_power.skill` → choice из `skills`. В `steps[0].count` `если(@skill == "взлом", …взлом.rank, …электроника.rank)` → `@действующий.skills.[@skill].rank`. Проверка: [техно].
19. **Крепления.** `firearm.mounts`: `expr @class.mounts`. Клетки `mounts` у `colt_l36`, `predator_vi`, `ak_97`, `rpk`, `striker` снять: все пять совпадают с классом. Проверка: [снар], [веб-зап].
20. **Транспорт.**
    - Новая функция `drive_mode` «Кто ведёт»: входы `действующий`, `цель` (sheet); шагов нет; итог `кто` (choice из `veh_control`) = `если(@действующий == @цель, "сам", если(@цель.jumped, "захват", "водитель"))`.
    - Это отход от раздела 2 (`@цель.control`): при `driver_pilot = 0` и нажатии с чужого листа раздел 2 дал бы «сам» — смена исхода.
    - В «Лист» новая колонка `veh_handling_rig` = `@veh_handling - если(@jumped, @rig_vcr, 0)` и поле `control` (choice из `veh_control`, `expr если(@jumped, "захват", если(@driver_pilot >= 1, "водитель", "сам"))`). Сначала проба, что формула-выбор собирается.
    - `drive_check`: после `each` — `emit id «режим» drive_mode(…)`; «набор» → `большее из(0, @режим.кто.pool - @цель.veh_speed_pen)`; «порог» → `большее из(0, @цель.veh_handling_rig + @shift)`; `branch @действующий != @цель` → `@режим.кто.inside`.
    - `vehicle.modifiers[defense_rating]` → `@control.dr + @veh_armor`; `лист.veh_ar` → `@control.ar + @veh_sensor`.
    - Проверка: [риг] (автопилот, водитель с аварией, дрон в захвате с нажатием со своего листа).
21. **Токсины.**
    - `toxin.damage` (text) → `damage_kind` «Вид урона» (choice из `damage_kinds`).
    - У `intoxicate` вход `dmg` → `damage_kind` (choice, optional, без умолчания); `branch @dmg != "нет"` → `не(пусто(@damage_kind))`; `physical_hit` → `@damage_kind.physical`.
    - Колонки `toxin.vector` и `drug.vector` → choice из `toxin_vectors`. Вход `inhaled` → `vector` (choice из `toxin_vectors`). Шаг «итог» → `большее из(0, @power + @doses - @vector.cut)`.
    - У `tox_gamma_scopolamine` снять клетку `damage: "нет"` и аргумент `dmg`; `inhaled: нет` → `vector: @vector`.
    - Проба: `tox_cut` и `tox_cut_inhaled` не равны 0, проверить на инъекционном и вдыхаемом.
    - Проверка: [снимок].

## Отложено

**Нужен движок:**
- E1/E2 — фильтры меток подписок и правка «метка»: `edge_ban_*` целиком, `shaky_hands`, `dodge_ready`/`block_ready`, `edge_bonus_*`.
- F — мишень правки из входа: `matrix_stat_cut`, `form_infusion`/`form_diffusion` и `sp_increase_attribute` одной правкой; `focus_kinds`/`spell_categories` с владельцем.
- G — висящий слышит своё «появилось». Сюда переезжает снятие `chilled.on`/`wet.on` с опорой на `burning.on`: без G сам `burning` своё появление может не услышать, и тогда исход меняется.
- H, F2, J, O, Q — `drug_effect`, `statuses` у токсина, `poisoned` через `@осталось`, выдача `unconscious`/`bleeding`.
- L — ранги навыков у типов листов.
- U, V, W — кнопки у типов записей, `binding.if`, одно чувство.
- X — ссылка на другой лист: лёд → сервер, `controller`.
- Y — несколько основ.
- E4 — `@стол.бой`.
- E7 — формула сбоя.
- Проверка формул колонок в линте.

**Меняет исход (шаг 8):**
- `blast_damage` через `strike_damage`: в `take_damage` пойдут `dv` = СУ и источник. Взрыв и косвенное заклинание на «СУ до сопротивления» — вопрос 14.
- Метки «физический» и вид урона на броске сопротивления (`bone_density`).
- `defend` с родом и дистанцией, правки `prone`, снять `ranges.close`.
- `reload_kinds.action` и стоп «не перезаряжают» первым (Страйкер).
- `action_lock` в `spend_action`, `turn_actions` на round-start.
- Бюджет хода через `simple_per_turn` и правки «Тошноты» (связан с `action_lock`).
- `gain_edge` с пределом в бою, `round_edge`/`scene_start`, `second_wind`/`shrug_off` на действующего, удалить `roll_edits` `reroll_failures`/`push_edge`.
- Штрафы `wound_mod`/`condition_mod` правкой броска (документ и советник), `condition_mod` вне инициативы.
- `ar_mod` и «лёжа» у `throw_blast`, `frightened` через вход-бросок.
- `dumpshock` (10 − Воля), `matrix_drain` на `m_dp`, стоп ВМ у льда, плата у `sprite_power_use`.
- Стоп `needs_attr` у формы, навыки спрайта по виду, `skills.roll.tags`, `attributes.field`.
- Авария `drive_check` через `resist_damage`: бросает Тело действующего, а не `soak`.
- `drive_mode` через `лист.control`.
- `intoxicate` при равенстве силы и успехов, метка «пилотирование» у «удержать», респиратор по пути введения.
- `ammo_kind.cost` от класса.
- `ammo_stun`/`ammo_shock` с учётом гранат (затрагивает `shoot`).

**Не в шагах 2–4:**
- Шаг 5 — кнопки типов: патроны в аргументах, одна «Сотворить», `matrix_action`, `ritual`, `toxin`/`drug`, `launcher`, `edge_heal`, `defense_action`.
- Шаг 6 — типы листов: `spirit`, `sprite`, `creature`, `npc`, `matrix_host`, `person`; `soak = @body` с правкой типа «Транспорт»; `unarmed_physical` формулой.
- Шаг 7 — метки и подписки: метки рода действий, «урон Матрицы», «биоотдача».
- Раскладка блоков.

**Без опоры в сводке или с пробелом проверки:**
- `edge_locked`: его нет в разделе 1.2.
- Справочники по рейтингу `explosive_*`, `cyberjack_ratings`, `cybereyes_ratings`, `bone_density_ratings`: их нет в списке шага 4, работа `таблица()` в клетке записи и в правке не проверена, части 8 и 9 расходятся.
- `weapon_classes.skill`: нужна книга для остальных классов.
- `gear.rating default 0` и `(@вещь.rating или 0)` в `detonate` — до вопроса 9 о детонаторе.
- `launch_blast` с физическим уроном и электричеством через `ammo_*`.
- `veh_control.init_base`/`init_dice`, `terrains`, `autosofts`.
- Удаление аргумента `действующий` в остальных 23 привязках: только после пробы на `veh_drive` и `wd_creature`.

**Вопросы владельцу:**
- Знак `throw_ricochet`/`launch_ricochet` (в данных не переворачивать).
- `fire_modes.area`.
- `grenade.status`/`status_level`/`blast`/`ar_vehicle`, `armor_mod.status`/`charges`.
- `detonate` простым действием.
- Четыре «молчащих» вида льда.
- `matrix_stat_cut`, `spw_hash` и `form_channel` со сроком.
- Боезапас «Страйкера» хранится дважды.
- `dmg` и `amount` у Шторма и Диагностики.
- `use_res`.
- `m_vm_extra` в уроне от формы.
- Поля без писателей и читателей: `has_fa_kit`, `has_jack`, `has_medkit` — удалить или оставить.
- `spirit_hard`, `spell.boost_field`.
- `roll_edits.wild_die`.
- Кому положены `system.grants`.
- Предел `@drain_phys или 0` у группы.
- Числа заготовок `grunt_templates`, Магия вампира и броня существ.
- `insecurity`, «Встать», «Сбить пламя», кто накладывает испуг и слепоту.

**Не трогать:** поддержание (`docs/sr6-sustain.md`): `stop_spell`, `sustained`, `sustain`, руку `@sustain и @spell_effect != ""`.
