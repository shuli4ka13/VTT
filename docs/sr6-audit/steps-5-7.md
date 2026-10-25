# Шаги 5–7: списки правок образца

Собрано сценарием по `results/` и `checks/` с учётом доработок движка этой ночи.

## Шаг 5

Общие правила для всех кнопок типов записей:
- Кнопка типа пишет аргументы явно, через `@свойство`: решения D нет, `owned.ts:146 argsWithProps` возвращает `binding.args` как есть.
- Аргумент `действующий` не пишется. Так уже сделано у `firearm.bindings`: первый вход-лист заполняет сам движок.
- Номера действий берутся по полному списку кнопок.

Проверка по каждому пункту: названный тест, затем `samples.shadowrun-*.test.ts` целиком и один раз золотой снимок `packages/engine/tests/golden` после просмотра разницы.

### Атака

1. **Новый тип `ranged_weapon` «Оружие дальнего боя»; `system.tables.firearm`**
   - Было: у `firearm` (extends `weapon`) колонки `modes, ammo_max, ammo, reload, mounts, str_min, smart, sight, brace_bonus, recoil_burst, recoil_full, str_need, ammo_ar, ammo_dv, ammo_stun, ammo_shock, prone_ar` и кнопки [Выстрелить→`shoot`, Перезарядить→`reload`].
   - Стало: `ranged_weapon` {shape book, use item, extends `weapon`, block «Снаряжение», icon и hint как у `firearm`}. Все перечисленные колонки переезжают в него без изменений, кнопок у него нет. `firearm`: extends `ranged_weapon`, свои колонки убрать, `bindings` оставить.
   - Поправка адреса: `prone_pool` лежит в `weapon`, а не в `firearm`, его не трогать.
   - Зачем: при слиянии кнопок по эффекту (V) наследник `firearm` унаследовал бы «Выстрелить». Заглушка `if: нет` из части 9 отклонена как подгонка.
   - Записи `colt_l36` и других стволов не трогать: `colt_l36:0/1` сохраняются.
   - Проверка: `samples.shadowrun-combat.test.ts`.

2. **Новый тип `launcher` «Пусковая установка»**
   - Тип: {shape book, use item, extends `ranged_weapon`, block «Снаряжение»}.
   - Кнопки: [{label «Выстрелить», effect `launch_blast`, args {attack_pool: `@skill.pool`}}, {label «Перезарядить», effect `reload`}].
   - Колонки-формулы:
     - `dv_e`/`dv_c`/`dv_n` = `большее из(0, строки("blast_item", "<кол>", @вещь))`;
     - `physical_dmg` (boolean) = `сколько(строки("blast_item","damage_kind",@вещь),"оглушающий") < 1`;
     - `electric` (перекрывает `weapon.electric`) = `сколько(строки("blast_item","electric",@вещь), да) >= 1`;
     - `charged` «Заряд поставлен» = `сколько(строки("blast_item","dv_e",@вещь)) >= 1`.
   - Таблица именно `blast_item`, а не `rocket`: `строки` идёт по наследникам (`refs.ts rowsOfTable → isUnder`). Иначе вставленная граната пропадёт.

3. **`compendium.records striker`**
   - Было: table `firearm`, своя кнопка [Выстрелить→`launch_blast`].
   - Стало: table `launcher`, свою кнопку удалить, клетки не трогать.
   - `striker:0` = `launch_blast`, `striker:1` = `reload`. Чужие аргументы `shoot` у `launch_blast` пропадают.
   - Проверка: `samples.shadowrun.test.ts:202–211` без правок.

4. **`system.effects.launch_blast`**
   - params: добавить {key `attack_pool`, «Набор атаки», number}.
   - Шаг `атака_бросок`: count `@действующий.skills.[@вещь.skill].pool` → `@attack_pool`, метки [атака] оставить.
   - Стоп «не поставлен ни один заряд»: условие `сколько(строки("grenade","dv_e",@вещь)) < 1` → `не @вещь.charged`.
   - В `blast_damage` внутри «Для каждого»: физический → `@вещь.physical_dmg`, электричество → `@вещь.electric`.
   - Аргумент «источник» не добавлять: это шаг 8.

5. **Новый тип `blast_item` «Взрывчатое»**
   - Тип: {shape book, use item, block «Снаряжение», extends `gear`, кнопок нет}.
   - Из `grenade` сюда переезжают без изменений `dv_e, dv_c, dv_n, blast, damage_kind, physical_dmg, electric, status, status_level, count`.
   - `launched` сюда не переезжает.

6. **`system.tables.grenade`**
   - label «Граната, ракета» → «Граната»; extends `gear` → `blast_item`.
   - Колонки: убрать переехавшие, `launched` и `ar_vehicle`. Добавить `skill` «Навык» (choice from skills, default «атлетика»).
   - Кнопка: [Бросить→`throw_blast`] → [{label «Бросить», effect `throw_blast`, args {attack_pool: `@skill.pool`}}]. `grenade_frag:0` сохраняется.

7. **Новый тип `rocket` «Заряд для установки»; записи `rocket_frag`, `rocket_antivehicle`**
   - Тип: extends `blast_item`, кнопок нет. Своя колонка `ar_vehicle` переезжает из `grenade` как есть.
   - Записи: table `grenade` → `rocket`, клетку `launched: true` снять.
   - Кнопка «Бросить», которая всегда отказывала, у снарядов пропадает.

8. **`system.effects.throw_blast`**
   - params: добавить `attack_pool` (number).
   - Удалить три шага «Если @вещь.launched → Стоп … → конец».
   - `атака_бросок`: count `@действующий.skills.атлетика.pool` → `@attack_pool`.
   - Шаг «атк» не трогать (вопрос 4).

9. **`system.tables.explosive`**
   - extends `gear` → `blast_item`.
   - Колонки: `count` «Сколько пакетов» (умолчание 1 наследуется), `dv_e` = `@rating`, `dv_c` = `округлить вниз(@rating / 2)`, `dv_n` = `округлить вниз(@rating / 4)`, `blast` = `@rating`.
   - `damage_kind` и `electric` берут умолчания `blast_item`, значит, `detonate` получает те же «физический: да» и «электричество: нет».
   - Проба: запись «Детонатор» без рейтинга показывается без ошибки. Если падает, `explosive` не переводить, у `blast_rings` оставить `charge_dv`.

10. **`system.tables.blast_rings` и вызовы `blast_damage`**
    - Колонки `grenade_dv`, `rocket_dv`, `charge_dv` → одна `dv` «СУ».
    - Клетки: эпицентр `@вещь.dv_e`, вплотную `@вещь.dv_c`, близко `@вещь.dv_n`.
    - В `throw_blast`, `launch_blast`, `detonate` аргумент су: `@кольцо.<…>_dv` → `@кольцо.dv`.

11. **`firearm.bindings[0]` и `system.effects.shoot` — патроны в аргументах**
    - Кнопка:
      - dv `@dv` → `@dv + @ammo_dv`;
      - physical_hit `@damage_kind.physical` → `@damage_kind.physical и не @ammo_stun`;
      - electric `@electric` → `@electric или @ammo_shock`.
    - `shoot`:
      - шаг «ур» `… + @вещь.ammo_dv` → без этого слагаемого;
      - в шаге «вред» физический `не @вещь.ammo_stun и @physical_hit` → `@physical_hit`;
      - электричество `@electric или @вещь.ammo_shock` → `@electric`.
    - `ammo_ar` в «атк» остаётся.

12. **Защитные действия: справочник `defense_actions`, эффект `defense_action`; удалить `act_dodge`, `act_block`, `act_full_defense`**
    - Справочник `defense_actions` {key word}, колонки: `status` (effect), `complex` (boolean, default false), `simple` (number, default 0), `text`.
    - Строки:
      - «Уклониться» {status `dodge_ready`, simple 1};
      - «Блокировать» {status `block_ready`, simple 1};
      - «Глухая оборона» {status `full_defense`, complex true}.
      - Тексты строк — по части 1.
    - Эффект `defense_action`:
      - params: `действующий` (sheet, role actor), `действие` (choice from `defense_actions`, ask {by actor});
      - cost: `spend_action(лист=@действующий, сложное=@действие.complex, простых=@действие.simple)`;
      - steps: status `{expr @действие.status}` на `@действующий`.
    - `system.grants`: три id → `defense_action`.
    - Проверка: `samples.shadowrun-combat.test.ts:222–239` (`+act_*` → `+defense_action` с ответом «действие»); снимок.

### Преимущество

13. **Новый тип `edge_action` «Действие Преимущества» (extends `action`)**
    - Колонки `edge_cost`, `heal_stun`, `heal_physical` (number, default 0, min 0).
    - Кнопка: [{effect `edge_heal`, args {edge_cost: `@edge_cost`, heal_stun: `@heal_stun`, heal_physical: `@heal_physical`}}], без подписи. При одной кнопке подпись берётся из записи (`events/actions.ts:112`).
    - На сам `action` кнопку не ставить, иначе её получит `act_scene`.

14. **Записи `act_second_wind`, `act_shrug`**
    - table `action` → `edge_action`, свои кнопки удалить.
    - Клетки: {edge_cost 3, heal_stun 1} и {edge_cost 4, heal_physical 1}.
    - id `:0` и подписи сохраняются.

15. **Новый `edge_heal` «Залечить за Преимущество»; удалить `second_wind`, `shrug_off`**
    - group «Преимущество». params: действующий, цели (many), edge_cost, heal_stun (0), heal_physical (0).
    - cost: `spend_edge(лист=@действующий, amount=@edge_cost)`.
    - steps: each цели;
      - ветка `@heal_stun >= 1` → apply `@цель.stun` = `меньшее из(@действующий.stun, @heal_stun)`;
      - ветка `@heal_physical >= 1` → apply `@цель.physical` = то же от `physical`.
    - Цель и величина от действующего сохранены нарочно: снимок держит `razor·act_second_wind → silk`.
    - Текст отказа станет умолчанием `spend_edge`: склейки строк в формулах нет.
    - В `samples/pieces.json:382–383` `"second_wind","shrug_off"` → `"edge_heal"`.
    - Проверка: `samples.shadowrun.test.ts:219`, `apps/server/test/scenarios/shadowrun.scenarios.ts:115` (ожидание `нужно 3` → новый текст), снимок.

### Матрица

16. **Новый тип `matrix_base`; `system.tables.matrix_action`**
    - `matrix_base` «Матрица: действие» {shape book, use action, block «Матрица»}, кнопок нет. Колонки:
      - `pool` = `@действующий.skills.взлом.pool`;
      - `защита` (choice `matrix_defenses`, default «нет»);
      - `illegal` (default false);
      - `kind` (choice `action_kinds`, default «сложное»);
      - `link` (choice `matrix_links`, default «нет»);
      - `action` (text).
    - `matrix_action`: extends `matrix_base`, колонки `урон` (number) и `накладывает` (effect).
    - Кнопка `matrix_action`: [{effect `matrix_check`, args {pool, защита, illegal, kind, link, action, урон, накладывает — каждое `@<то же имя>`}}].
    - Колонка `effect` из сводки не собирается: `binding.effect` — строка.
    - Вариант части 9 отклонён: аргументы по позиции при V не наследуются.
    - Делать одним коммитом с пунктами 17–20.

17. **Новый тип `resonance_action` «Действие техноманта»; запись `tm_sprite_compile`**
    - Тип без колонок и кнопок.
    - Запись: table `matrix_action` → `resonance_action`, кнопка своя, id `:0` тот же.
    - `magic_action` из части 9 не брать.
    - Проверка: `samples.shadowrun-techno.test.ts:26`.

18. **Записи `mx_hide`, `mx_spike`, `mx_tarpit`**
    - Свои кнопки удалить, значения переходят в клетки:
      - `mx_hide`: {pool `@действующий.skills.взлом.pool - @действующий.logic + @действующий.intuition`, защита «Интуиция + ВМ», illegal true, action «спрятаться»};
      - `mx_spike`: {защита «ВМ + СЭ», illegal true, link «Проникновение», action «инфошип», урон `округлить вверх(@действующий.matrix_ar / 2) + @отпор_итог.чистые`};
      - `mx_tarpit`: {то же, action «смоляная яма», урон `1 + @отпор_итог.чистые`, накладывает `matrix_drain`}.
    - Проба: клетка с `@отпор_итог` подставляется в выражение шага и не вычисляется при связывании кнопки. Пустой `урон` у `mx_hide` не уводит в самоссылку. Если проба не прошла, урон spike и tarpit уходит в «Отложено», а их кнопки остаются у записей.

19. **`system.effects.matrix_check`; удалить `matrix_spike`, `matrix_tarpit`**
    - params: + `урон` (number, optional), + `накладывает` (effect, optional).
    - После стопа «не вышло», внутри «Для каждого»: ветка `не пусто(@урон)` →
      - `matrix_hurt(лист=@цель, amount=@урон)`;
      - ветка биоотдачи как в нынешнем `matrix_spike` (`bio_hurt` с `оглушающая`);
      - ветка `@действующий.m_lockdown >= 1` → status `link_lock`;
      - конец.
    - Затем ветка `не пусто(@накладывает)` → status `{expr @накладывает}` на `@цель` (amount=`@урон`).
    - Порядок костей прежний.
    - Проверка: `samples.shadowrun-matrix.test.ts` (строка 90 — залипание после урона).

20. **Новый тип `matrix_access_action` «Взлом доступа»; запись `mx_brute`**
    - Тип extends `matrix_base`. Кнопка [{effect `matrix_hack`, args {pool, защита, illegal, kind, link, action}}].
    - `mx_brute`: table → `matrix_access_action`, кнопку удалить, клетки {защита «Воля + СЭ», illegal true, link «Проникновение», action «брутфорс»}.
    - `level` и `had_user` спрашиваются, как раньше. `mx_brute:0` сохраняется.

21. **`system.sheets.ic.grants`; `ic_attack`; удалить `ic_strike`; `baraholka_killer.has`**
    - `ic.grants` = [`ic_attack`].
    - `ic_attack.params`: оставить `действующий` (+ role actor, как у `act_dodge`), `цели`, `порог`. Удалить `pool, защита, illegal, kind, action, link`.
    - Подстановки:
      - `@pool` → `@действующий.host_rating * 2`;
      - `@защита` → `@действующий.ic_kind.defense`;
      - illegal → нет;
      - метка `{@action}` → «лёд»;
      - `spend_action(сложное=да)`;
      - `matrix_ready(… check_vm=нет)` без `link`.
    - Порог сохранить: вопрос задаётся сейчас, его снятие меняет журнал. Ни одна строка `ic_kinds.defense` не равна «порог» (проверено), поэтому снять его можно отдельно, по ответу.
    - `ic_strike` удалить, из `baraholka_killer.has` его снять.
    - Проверка: `samples.shadowrun-matrix.test.ts:114, 123, 139` (`ic_strike:0` → `+ic_attack`, вопрос 42).

### Магия и техномант (кнопки остаются у записей, см. «Отложено»)

22. **`cast_spell` поглощает `heal_spell` и `boost_spell`; оба удалить**
    - Состояние после шагов 2–4. Имена `drain_base, sustain, spell_effect, bond` не трогать (`docs/sr6-sustain.md`).
    - Новые входы:
      - `outcome` (choice `spell_outcomes`, default «нет»);
      - `clears` (effect, optional);
      - `choose_hits`, `pick_attr` (boolean, нет);
      - `cap` (number, 4);
      - `want` (number, 1, min 1, ask actor, if `@choose_hits`);
      - `heal_kind` (choice `damage_kinds`, «физический», ask actor, if `@outcome.heal_pick`).
    - Условия вопросов у старых входов:
      - `attr` — if `@pick_attr`;
      - `amp` — if `@category.amp`;
      - `widen` — if `@category.amp или @area`;
      - `порог` — if `@defense.gm_threshold и пусто(@threshold)`.
    - Вход `stabilize` удалить.
    - Колонки справочников:
      - `spell_categories.amp` (да у «боевое»);
      - `spell_defenses.gm_threshold` (да у «порог», «Сопротивление материалов», «Мощь источника × 2»);
      - `spell_outcomes`: строка «стабилизация», колонки `heals`, `heal` (`@защита.чистые` / `@цель.critical`), `heal_physical` (`@heal_kind.physical` / да), `heal_pick`.
    - Новая функция `spell_defense` (папка «Шаги для других»):
      - входы: цель, заклинатель, защита, сотворение, высшая_зщ, порог (0), attr;
      - шаги: gain_edge цели при ±4, бросок «отпор» [защита, сопротивление магии], проверка против `@защита.versus`;
      - итоги: прошло, чистые.
      - В клетках `spell_defenses.versus` `@threshold или @порог` → `@порог`.
    - В `cast_spell`:
      - `spell_drain.si` = `@drain_base + 2 * @amp + @widen + большее из(0, @want - 1)`;
      - внутри «Для каждого» вызов `защита = spell_defense(…, порог=@threshold или @порог)`;
      - ветка «прошло» развилкой по исходу: «урон» (прежние руки, `@итог.margin` → `@защита.чистые`); `@outcome.heals` → `heal_damage` + СНЯТЬ `@clears`; «усиление поля» → НАЛОЖИТЬ `@spell_effect` (amount=`меньшее из(@want, @защита.чистые, @cap)`); «состояние» — прежняя рука.
    - Кнопки записей остаются литералами:
      - `spell_heal`, `spell_stabilize`, `spell_increase_attribute`, `spell_armor` → effect `cast_spell`;
      - outcome: урон (fireball, mana_bolt), лечение, стабилизация, «усиление поля»;
      - increase_attribute: choose_hits/pick_attr да, cap 4; armor: choose_hits да, cap 20;
      - у stabilize снять `stabilize: да`.
    - Проба: клетки `@защита.чистые` и `@heal_kind.physical` читаются в области `cast_spell` (C).
    - Проверка: `samples.shadowrun-spells.test.ts`, `samples.shadowrun-magic.test.ts`, снимок.

23. **`cast_form_attr` → в `cast_form`; запись `cf_infusion`**
    - В `form_outcomes` колонка `needs_attr` (boolean, да у «характеристика +/−»).
    - `cast_form.params[attr]`: + ask {by actor, if `@outcome.needs_attr`}.
    - `cf_infusion:0`: effect `cast_form_attr` → `cast_form`, аргументы прежние (литералы, поэтому условие вопроса работает).
    - `cast_form_attr` удалить: после шага 3 он совпадает с `cast_form`, кроме вопроса.
    - Проверка: `samples.shadowrun-techno.test.ts:51` (ответ `{attr:'ВМ'}` остаётся).

### Кнопки на типах без условных вопросов

24. **`sprite_power.bindings`; записи `spw_trap`, `spw_hash`**
    - Кнопка типа: [{label «Применить», effect `sprite_power_use`, args {skill: `@skill`, use_res: `@use_resonance`, защита: `@defense`, status: `@status`, hit_now: `@hit_now`}}]. Колонки `status` и `hit_now` — из steps-2-4, 4.2 п.17.
    - Кнопки записей удалить, `:0` сохраняется.
    - Подпись на экране станет «Ловушка · Применить».
    - Проверка: `samples.shadowrun-techno.test.ts:72`.

25. **`ritual.bindings`; `ritual_roving_spell`**
    - Кнопка типа: [{label «Провести», effect `ritual_cast`, args {threshold: `@threshold`}}].
    - Кнопку записи (threshold 6 = клетка) удалить.

26. **`toxin` (колонки, кнопка); `intoxicate`; `tox_gamma_scopolamine`**
    - Колонка `statuses` «Состояния» (effect, many, optional), клетка у записи уже есть.
    - `intoxicate`: входы `s1/s2/s3` → `statuses` (effect, many, optional). Три ветки «@sN != ""» → один шаг status `{expr @statuses}` на `@цель` внутри ветки успеха (J).
    - Кнопка типа: [{label «Ввести», effect `intoxicate`, args {power: `@power`, damage_kind: `@damage_kind`, vector: `@vector`, statuses: `@statuses`}}] (имена после 4.2 п.21).
    - Кнопку записи удалить. Порядок immobilized → dazed прежний.
    - Проверка: снимок.

27. **`drug` «Принять»; новая функция `take_drug`; удалить `dg_alcohol_take`, `dg_jazz_take`**
    - `take_drug` (group «Химия», params [действующий]): шаг `{id срок, type roll, fixed @вещь.dur_minutes}`, затем status `{expr @вещь.on_take}` на `@действующий` с args {dur: `@срок`}.
    - Колонки `drug`:
      - `on_take` (effect): `dg_alcohol` / `dg_jazz`;
      - `dur_minutes` (number): `большее из(60, (8 - @действующий.body) * 60)` / `10 * кинуть(к6)`.
    - Кнопка типа: [{label «Принять», effect `take_drug`}]. Кнопки записей удалить.
    - Сначала проба: клетка через `@вещь` видит `@действующий`, а кость из клетки бросается шагом и попадает в журнал. Часть 7 утверждает обратное (`item-ref.ts`). Не прошла — пункт в «Отложено».

28. **`vehicle.grants`; удалить запись `veh_drive`**
    - `vehicle.grants` = [`drive_check`]. Запись `veh_drive` удалить, из `drone_doberman.has` снять.
    - Аргументов кнопка не передавала, W не нужен.
    - Проверка: `samples.shadowrun-rigging.test.ts` (`veh_drive:0` → `+drive_check`).

## Шаг 6

Предел min/max режет только шаг «Изменение» (`steps/apply.ts:72–74`), правка типа листа не режется. Отсюда три следствия:
- Магия духа и Резонанс спрайта остаются шагами: при Мощи или Уровне 7 и выше шаг режет их по пределу.
- Ранги считаются через `меньшее из(10, …)` (у ранга `max` 10).
- Существа уходят в «Отложено».

1. **Этап «основа» у характеристик и ранга**
   - Адрес: `лист.columns` body, agility, reaction, strength, willpower, logic, intuition, charisma, edge (`stages`) и `skills.columns[rank].stages`.
   - Было: [адепт, аугментация] у body…strength, [аугментация] у willpower…edge, [адепт] у rank.
   - Стало: первым этапом `{key основа, label основа}`.
   - Правок без этапа на эти поля нет, молча в «основу» ничего не переедет.
   - Пункт общий для духа, спрайта и пешек, делается один раз.

2. **Новый тип листа `person` «Метачеловек»; `runner`**
   - В `person` перенести без изменений правки `runner.modifiers` [0, 1, 3…11]: magic/resonance от Сущности, init_dice, правка броска «матрица», поддержание, астрал, dev_* живого аватара.
   - `runner`: `extends: person`, свои правки снять.
   - `npc`, `opponent`, `grunt` на `person` не переводить (вопрос 64).

3. **`лист.unarmed_physical`; правка `runner.modifiers[2]`**
   - Было: {kind boolean, default false, min 0, max 1, stages [основа, combine set:max]} и правка `set @metatype.unarmed_physical`.
   - Стало: {expr `@metatype.unarmed_physical`, stages [основа]}. Ключи kind/default/min/max/combine снять, правку раннера удалить.
   - `bone_density` (`set да`) остаётся. Читателей у поля нет.

4. **`лист.soak`; `vehicle.modifiers`**
   - Было: expr `если(@veh_body >= 1, @veh_body, @body)`.
   - Стало: `@body`, а в `vehicle.modifiers` правка {target soak, op set, value `@veh_body`, if `@veh_body >= 1`}.
   - Условие ровно как в нынешней формуле. У части 8 его нет (транспорт без модели получил бы 0), у части 9 стоит `не пусто(@vehicle_model)` — оба варианта не взяты.
   - Проверка: `samples.shadowrun-rigging.test.ts`, `samples.shadowrun-combat.test.ts`.

5. **Дух: `spirit_kinds.skills`, `spirit.modifiers`, `summon_spirit`**
   - Колонка `skills`: text («Астрал, Атлетика, …») → choice from skills, many. Клетки:
     - воздуха, огня, воды — [астрал, атлетика, ближний бой, внимание, экзотическое оружие];
     - земли — без атлетики;
     - зверей — [астрал, ближний бой, внимание];
     - предков — + колдовство.
   - Уточнение «(Плавание)» у «воды» перенести в её `powers`. Три колонки да/нет из части 5 не нужны.
   - В `spirit.modifiers` (stage основа):
     - восемь правок {target <характеристика>, op set, value `большее из(1, @spirit_force + @spirit_kind.<характеристика>)`, if `не пусто(@spirit_kind)`};
     - одна правка {target `cell:skills.*.rank`, op set, value `меньшее из(10, @spirit_force)`, if `если(пусто(@spirit_kind), нет, есть(@spirit_kind.skills, @строка))`}.
   - `summon_spirit`: удалить развилку по `@kind` (шаги 10…90 с её «конец»). Шаги 6–9 (Мощь, вид, услуги, magic) и `spirits_force` остаются.
   - `spirit.modifiers[5…12]` (`attr_limits.*.bonus +20`) удалить: шагом на характеристики больше никто не пишет. Перед удалением убедиться, что значение выше предела нигде не режется.
   - hint: «Дух: характеристики и навыки = Мощь + смещение вида…».
   - Проверка: `samples.shadowrun-magic.test.ts` («дух воздуха Мощи 4», computed). `apps/web/src/screens/constructor/effects/degree-switch.test.tsx` перевести на развилку, собранную в самом тесте.

6. **Спрайт: `sprite.modifiers`, `compile_sprite`, `sprite_kinds.skills`**
   - В `sprite.modifiers` (stage основа, if `не пусто(@sprite_kind)`):
     - willpower, logic, intuition, charisma = `большее из(1, @sprite_level)`;
     - `skills.взлом.rank`, `skills.электроника.rank`, `skills.инженерное_дело.rank` = `меньшее из(10, @sprite_level)` — всем видам, как сейчас.
   - `compile_sprite`: удалить шаги 9…15. Шаги 6, 7, 8 (resonance) и 16–18 остаются.
   - `sprite.modifiers[7…10]` (`attr_limits +20`) удалить.
   - `sprite_kinds.skills` → choice many: взломщик, инфоспрайт, крушитель, посыльный — [взлом, электроника]; техноспрайт — [инженерное дело, электроника]. Не читать до ответа 55.
   - hint: «…= уровень (пишет «Компилировать»)» → «…= уровень».
   - Проверка: `samples.shadowrun-techno.test.ts:61, 72` (8 кубиков у «Ловушки»).

7. **Тип `npc` «По заготовке»; `grunt`, `opponent`; шесть листов**
   - В `лист` колонка `npc_template` (choice `grunt_templates`, optional).
   - `grunt_templates`: magic, resonance — default 0. `attr_aug` (JSON-текст) → `body_aug_add`, `agility_aug_add`, `reaction_aug_add`, `strength_aug_add` (default 0), клетки — разности по части 9.
   - Правки `npc` (все с if `не пусто(@npc_template)`):
     - body…charisma, magic, resonance — set на «основе»;
     - init_dice и essence — set;
     - `*_aug_add` — add на «аугментации».
   - `grunt`, `opponent`: `extends: npc`.
   - Листы humanis, fiveeyes, fiveeyes_2, sauron, lone_star, mafia: снять body…charisma, вписать `npc_template` по части 9. Ранги в `values` остаются.

8. **Тип `matrix_host` «Узел Матрицы»; `host`, `ic`**
   - В `matrix_host` переносятся одинаковые правки `host[0,1]` и `ic[0,1]`: `is_device set да` и `dev_rating set @host_rating` (stage основа).
   - `host` и `ic`: `extends: matrix_host`, эти правки у себя снять.
   - Ссылку льда на сервер не вводить (см. «Отложено»).
   - Проверка: `samples.shadowrun-matrix.test.ts`.

## Шаг 7

Новые метки эффектов не совпадают ни с одним ключом подписок в данных. Ключи `on` в образце: `call:roll`, `call:take_damage`, `field:*`, `gained:<id>`, `lost:dg_*`, `moment:*`, `rolled`, `seen`. Метки в метки броска не попадают (`steps/roll.ts tagsOf`), поэтому исход от самих меток не меняется. Каждое новое слово метки броска добавляется строкой `rolls`, иначе его не пропустит `tagWords`.

### `system.tags`: один объект (сейчас ключа нет)

| Метка | Договор | Ставится на |
|---|---|---|
| атака | inputs [действующий sheet, цели sheet many], each «цель», outputs [«вред»] | — (через includes) |
| стрельба / ближний бой / взрыв | includes [атака] | `shoot`, `launch_blast` / `melee_strike` / `throw_blast`, `launch_blast` |
| действие в Матрице | inputs [действующий, цели many], each «цель», outputs [«отпор_итог»] | `matrix_check`, `matrix_hack`, `cast_form`, `sprite_power_use` |
| лёд | includes [действие в Матрице] | `ic_attack` |
| урон Матрицы | inputs [лист, источник, amount] | только `matrix_hurt` (не `matrix_harm`: он вызывается из `matrix_hurt`, и подписка сработала бы дважды) |
| биоотдача | inputs [лист, amount] | `bio_hurt` |
| заклинание | inputs [действующий, цели many], each «цель», outputs [«защита»] | `cast_spell` (после п. 22 шага 5) |
| висящее заклинание | inputs [amount, net] | `sp_increase_attribute`, `sp_armor` |
| призыв / ритуал | [действующий, цели many] / [действующий] | `summon_spirit` / `ritual_cast` |
| сложная форма | как «действие в Матрице» | `cast_form` |
| способность спрайта | [действующий, цели many] | `sprite_power_use` |
| висящая форма | inputs [amount] (без «держит») | `form_infusion`, `form_diffusion`, `form_channel` |
| стихия | inputs [level] | `burning`, `corroded`, `chilled`, `shocked` |
| урон в раунд | inputs [level] | `burning`, `corroded`, `poisoned` |
| гасит горение | — | `chilled`, `wet` |
| приём Преимущества | — | `reroll_failures`, `push_edge`, `edge_reroll_one`, `edge_bump`, `edge_plus_hit`, `edge_init`, `edge_heal` |
| бонус Преимущества | без входов: чувство лежит в клетке записи | `edge_bonus` |
| токсин / вождение | [действующий, цели many], each «цель» | `intoxicate` / `drive_check` |

Сопутствующие правки и проверки:
- У `throw_blast` и `launch_blast` шагу `blast_damage` внутри «Для каждого» дать id `вред`.
- `detonate` не метить (вопрос владельцу).
- Линт договоров (`model/lint.ts:1341–1357`) должен пройти. Проверить, что у `sprite_power_use` есть «Для каждого» и шаг `отпор_итог`.

### Атака
1. **`dodge_ready`**
   - Было: duration permanent; on[0] rolled if `@бросающий == @носитель и есть(@roll.tags,"защита")`, шаг «снять себя».
   - Стало: duration {uses, max 1}; if `@бросающий == @носитель`, tags [защита]; шаги убрать: заряд сжигается в `core/run.ts burn`.
2. **`block_ready`**: то же, tags [защита, ближний бой].
   - Проверка: `samples.shadowrun-combat.test.ts:222–239`.

### Преимущество

3. **`rolls.rows`**: + «без Преимущества», + «бонус Преимущества», без заявки.
4. **`shaky_hands.modifiers`; `лист.edge_ban_hands`**
   - Было: {value, target `edge_ban_hands`, add 1}.
   - Стало: {kind edit, call roll, param tags, value `"без Преимущества"`, anyTags [атака, стрельба, ближний бой, экзотическое оружие, взлом замков], if `@бросающий == @носитель`}.
   - notTags [защита] не ставить: это шаг 8.
   - Колонку `лист.edge_ban_hands` удалить (§2).
5. **Реакции Преимущества, on[0]**
   - Скобку `не (@носитель.edge_ban_hands >= 1 и …)` и звено `не есть(@roll.tags,"инициатива")` убрать из `if`, вместо них фильтр меток подписки:
     - `reroll_failures`: if `@бросающий == @носитель и не @roll.atMin * 2 > @roll.rolled`, notTags [инициатива, без Преимущества];
     - `push_edge`, `edge_bump`, `edge_plus_hit`: if `@бросающий == @носитель`, notTags [инициатива, без Преимущества];
     - `edge_reroll_one`: if `@бросающий == @носитель`, notTags [без Преимущества];
     - `edge_init`: if `@бросающий == @носитель`, tags [инициатива];
     - `glitch` и `critical_glitch`: последнее звено → notTags [инициатива].
   - Проверка: `samples.shadowrun-magic.test.ts:62–67` (offers у «Дрожи в руках»), `build-cover-other.test.tsx:122, 136` (перевести на фильтр «не»).
6. **`edge_bonus` (новый); удалить пять `edge_bonus_*`; `system.grants` + `edge_bonus`**
   - Эффект: passive, permanent; on [{seen, if `@бросающий == @носитель`, tags [бонус Преимущества], steps [gain_edge(лист=@носитель)]}].
7. **`adept_improved_sense`**
   - grants удалить.
   - modifiers + {edit roll tags `"бонус Преимущества"`, anyTags [зрение, слух, осязание, вкус, обоняние], if `@бросающий == @носитель`}. Пять чувств, как сейчас.
   - Справочник `senses` из части 2 не заводить, строки чувств из `rolls` не убирать. Одно чувство — шаг 8.
8. **`aud_enh_spatial_recognizer`**
   - grants удалить.
   - + {edit roll tags `"бонус Преимущества"`, tags [слух], if `@бросающий == @носитель`}. Сужение до «внимание + слух» — новое правило, не здесь.
   - Сегодня пункты 6–8 не срабатывают ни разу.

### Состояния

9. **`burning`**
   - on[1] (gained:burning → снять wet, chilled) → `attach` [{status remove, effect «гасит горение», to `@носитель`}] (I).
   - on[2] и on[3] → одна подписка {on `gained:гасит горение`, if `@лист == @носитель`, steps [снять burning с `@носитель`]} (G).
10. **`chilled.on`, `wet.on`**: удалить целиком, связь держит `burning`.
11. **`petrified.on[0]`** → `attach` [{status remove, effect «урон в раунд», to `@носитель`}].
    - Проверка: снимок; тесты состояний в `samples.shadowrun-combat.test.ts`.

### Матрица

12. **`matrix_hurt`**: params + `источник` (sheet, optional). В `matrix_check` передать `источник=@действующий`.
13. **Новый `lockdown_attack`; `prog_lockdown`; ветка `m_lockdown`; `лист.m_lockdown`**
    - `lockdown_attack`: passive, permanent, on [{`after:урон Матрицы`, if `@источник == @носитель`, steps [status `link_lock` на `@лист`]}].
    - `prog_lockdown`: правку удалить, grants [`lockdown_attack`].
    - Ветку `m_lockdown` в `matrix_check` и колонку `лист.m_lockdown` удалить.
14. **Новый `biofeedback_attack`; `prog_biofeedback`; ветка биоотдачи**
    - `biofeedback_attack`: такая же подписка, steps [`bio_hurt(лист=@лист, amount=@amount)`].
    - `prog_biofeedback`: + grants; правку `m_bio +1` оставить.
    - Ветка в `matrix_check` сужается до `@действующий.m_bio < 1 и @действующий.m_bio_stun >= 1` → `bio_hurt(оглушающая=да)`.
    - Проба порядка: биоотдача и залипание идут после урона, биоотдача раньше залипания, как сейчас. Проверка: `samples.shadowrun-matrix.test.ts:90`.
15. **`matrix_attrs.field` «Поле персоны» (field)**
    - Клетки: П `m_attack`, У `m_sleaze`, ВМ `m_dp`, СЭ `m_firewall`.
    - Расходится с §2 («третью колонку не плодить»), но F требует колонку вида «поле». `target_*` — числа-формулы.
    - Одна колонка на `matrix_stat_cut` и формы.
16. **Одна правка вместо четырёх**
    - `matrix_stat_cut.modifiers[0..3]` → {target `{@attr.field}`, add, stage «снижение», value `0 - @amount`}.
    - `form_infusion` — value `@amount`; `form_diffusion` — value `0 - @amount`.
17. **Метка «биоотдача» у броска**: `rolls` + «биоотдача»; бросок «воля» в `bio_hurt` — tags [сопротивление, биоотдача].
    - Проверка: `samples.shadowrun-matrix.test.ts`, `samples.shadowrun-techno.test.ts`.

### Магия

18. **`sp_increase_attribute`**
    - Вход `attr`: text → choice from attributes, optional.
    - Восемь лесенок → {target `{@attr}`, add, stage «аугментация», value `@amount`, if `@attr != "edge" и @attr != "magic" и @attr != "resonance"`}.
    - `attributes.field` отложен в steps-2-4 (строка 583), поэтому мишень — значение строки. Колонку `spell_field` не заводить.
    - Проба: условие снимает правку раньше поиска этапа: у magic и resonance нет «аугментации».
    - Проверка: `samples.shadowrun-spells.test.ts`.
19. **`focus`: две правки**
    - `focus_kinds`: owner sheet; `force` «Мощь надетых» (number, 0, min 0, stages [основа, add:max]); `by_category` (boolean, явно во всех 15 строках, да у «Источник сотворения заклинаний»). Остальные колонки должны быть заполнены во всех строках, иначе пустая клетка станет вводом.
    - `spell_categories`: owner sheet, `focus` → number 0 со stages [основа, add:max]; пять клеток `@действующий.focus_sp_*` снять.
    - `focus.modifiers[0..12]` → {target `focus_kinds.{@строка.focus_kind}.force`, add `@строка.rating`, if `не @строка.focus_kind.by_category`} и {target `spell_categories.{@строка.category}.focus`, add `@строка.rating`, if `@строка.focus_kind.by_category`}. Правка `focus_force_total` остаётся.
    - Читатели (найдено скриптом):
      - `@действующий.focus_power` (5 мест) → `@действующий.focus_kinds.Источник_силы.force`;
      - `focus_summon` → `…Источник_призыва.force`;
      - `focus_ritual` → `…Источник_ритуального_заклинания.force` (Источник силы в `ritual_cast` сохраняется);
      - `@category.focus` (3 места) → `@действующий.spell_categories.[@category].focus`.
    - 13 колонок `лист.focus_*` удалить: у banish, counter, alchemy, disenchant, weapon читателей нет.
    - Проверка: `samples.shadowrun-magic.test.ts`, `samples.shadowrun-spells.test.ts`.

### Токсины и транспорт

20. **Пути введения как метки броска**: `rolls` + «контактный», «поглощаемый», «вдыхаемый», «инъекционный». У броска «стойкость» в `intoxicate` tags [сопротивление, токсин, `{expr @vector}`]. Правок под эти слова нет.

## Отложено

**Нужен движок (буквы из списка «НЕТ» или дыра без буквы):**
- **Кнопки типов `spell` и `complex_form`.** `model/asks.ts askHolds` вычисляет аргумент привязки через `evaluate(() => null)`, так что аргумент-свойство (`@category`, `@outcome`, `@pick_attr`) даёт `null`, а условие вопроса берёт умолчание. На типе молча пропадут вопросы `amp`, `widen`, `want`, `attr`, `heal_kind`, а у «Инфузии» — вопрос характеристики. Нужно расширить Z: условие вопроса должно видеть клетки записи. Вариант части 6 (attr в клетке экземпляра) — подгонка. Туда же уходят перенос «Прекратить» на тип и колонка `spell_durations.sustained`.
- **Ранги пешек `npc`** (`cell:skills.*.rank` = `@npc_template.[@строка]`). `Pick` не переводит ключ в слаг (`formula/evaluate.ts:130`), а колонки названы `sk_<слаг>`. «Колонку по строке» из L нужно дописать. До этого ранги остаются в `values` листов.
- **`drug_effect` и отходняк в «при спадании»**: нужны F2 и H2.
- **Колонка `crash_*`/`up_*` у `drug`**: те же F2 и H2. Если проба п. 27 шага 5 не прошла, туда же уходит `take_drug`.
- **Одно чувство у `adept_improved_sense`, три отдельные защитные кнопки, `edge_bonus` с входом `sense`**: нужен W.
- **E3** (одно Преимущество за действие), **E5**, **E6**, **E7** (формула сбоя в `glitch`).
- **Y**: Сущность одной суммой, `implant_weapon`.
- **AB**: трата снаряда «Страйкера», боезапас хранится дважды.
- **Вызов эффекта по колонке у `matrix_action`**: колонка `effect` из сводки не собирается, взята схема с основой `matrix_base`.
- **Урон `mx_spike`/`mx_tarpit` клеткой**: если клетка с `@отпор_итог` не подставляется, нужен ленивый аргумент.
- **`matrix_drain` через `0 - @осталось`**: O подаёт остаток только в подписки, не в правки.
- **`poisoned` через `@осталось`**: в бою уроны L−1…1 вместо L…1, вне боя срок не идёт, конец боя снимает яд.

**Меняет исход (шаг 8):**
- **«Облик существа» → тип `creature`** (`creature_kind`, 18 правок, удалить `creature_template` и `wd_creature`). Шаг режет Силу 0 → 1 (крыса), 30/40 → 26 (драконы), Магию 10 → 6. Сюда же Магия вампира `меньшее из(6, @essence)` и броня существ (вопросы 63, 64).
- **Магия духа и Резонанс спрайта правкой типа**: при значении 7 и выше пропадёт обрезка.
- **`from:` у целей `summon_spirit`, `compile_sprite`, `creature_template` (AA)**: отказ там, где сейчас проходит.
- **`npc`/`opponent`/`grunt` extends `person`** (вопрос 64).
- **Ссылка `ic_host` и поля `host_*_add`** (X есть, решение за владельцем, вопрос 15).
- **Набор `mx_hide` «без обучения»** (вопрос 39).
- **Без `cap` и `choose_hits` у «Брони»**, `widen` только при `@area`, отказ при `attr` = edge/magic/resonance.
- **notTags [защита] у «Дрожи в руках»**, стоп «Дрожь» в плате атак.
- **`edge_heal` только на себя**, текст отказа с числом очков.
- **`reload`** («Страйкер»), **`defend`** с родом и дистанцией, правки `prone`.
- **`blast_damage` через `strike_damage`**, метка «физический» (`bone_density`).
- **Респиратор по пути введения**, `intoxicate` при равенстве.
- **`wet` −6 к холоду и электричеству**, `blinded` III автопровалом, `beatdown`, `dead` («мёртвого не вылечить»), `nauseated` (бюджет хода), `condition_mod` вне инициативы.
- **Вход «спрайт» и метка «держит спрайт» у `sprite_trap`/`sprite_storm`.**
- **Навыки спрайта по виду**, плата у `sprite_power_use`, стоп `needs_attr` у формы.
- **Снятие `порог` у `ic_attack`**: меняет журнал вопросов.

**Вопросы владельцу:**
- Метка «взрыв» у `detonate`: подрыв станет «атакой».
- «атк» у `throw_blast`/`launch_blast` (вопрос 4).
- `ar_vehicle` (вопрос 10); `status`, `status_level`, `blast` у взрывчатого.
- `fire_modes.area`, знак рикошета.
- Детонатор и цена подрыва (вопрос 9).
- `use_res`; `dmg`/`amount` у Шторма и Диагностики.
- Программа «только оглушающая биоотдача»: после ответа снять `m_bio`, `m_bio_stun` и суженную ветку.
- Четыре молчащих вида льда, срок `matrix_stat_cut`, `spw_hash`, `form_channel`.
- Кому положены `system.grants`.
- Записи «Зубрилы», «Камикадзе», «Нитро», «Долгого пути» (вопрос 7).
- Метка «пилотирование» у «удержать».

**Отклонено при сведении:**
- Заглушка `if: нет` у `launcher` (часть 9).
- Наследование кнопок `matrix_action` по позиции (часть 9).
- `magic_action` для `tm_sprite_compile`.
- Справочник `senses` и перенос строк чувств из `rolls` (часть 2).
- Колонка `attributes.spell_field` (часть 5).
- Колонка `focus_kinds.field` со слотом в два сегмента (часть 5).
- Атлетика, экзотическое оружие и колдовство духа тремя колонками да/нет (часть 5).
- Правки спрайта без условия по виду (часть 6).
- `soak` без условия (часть 8).
- Колонку `edge_ban_hands` «оставить на шаг 8» (часть 2).
- Метка «урон Матрицы» на `matrix_harm`.

**Не шаги 5–7:** E4 (`@стол.battle` → `@стол.бой`, 21 место, удаление `battle_start`/`battle_end`), раскладка блоков, справочники по рейтингу.
