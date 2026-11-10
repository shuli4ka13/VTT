export const meta = {
  name: 'sr6-audit',
  description: 'Внимательный разбор образца Shadowrun: что перевести в таблицы, типы, функции, метки — по каждому эффекту и таблице, с проверкой',
  whenToUse: 'args: { root: путь к репо, dump: папка выгрузки docs/sr6-audit/dump.py, mode: all | verify, only: [ключи частей] }',
  phases: [
    { title: 'Разбор', detail: 'по кластеру эффектов / таблиц — находки с целевым устройством' },
    { title: 'Проверка', detail: 'две независимые проверки каждой находки: правила по выпискам и выразимость в движке' },
    { title: 'Сводка', detail: 'полнота, единая таксономия меток, недостающее в движке' },
  ],
}

const A = args || {}
if (!A.root) throw new Error('нужен args.root — полный путь к репозиторию')
const ROOT = A.root
const D = A.dump || '/tmp/sr6-audit'
const MODE = A.mode || 'verify'
const ONLY = Array.isArray(A.only) ? A.only : null
const RESULTS = `${ROOT}/docs/sr6-audit/results`

const CLUSTERS = [
  { key: '1-ataka', title: 'Атака, защита, взрывы', files: ['dump-1-ataka.txt'] },
  { key: '2-deistviya-preimushestvo', title: 'Действия, Преимущество, бой', files: ['dump-2-deistviya-preimushestvo.txt'] },
  { key: '3-sostoyaniya', title: 'Состояния и здоровье', files: ['dump-3-sostoyaniya.txt'] },
  { key: '4-matrica', title: 'Матрица и лёд', files: ['dump-4-matrica.txt'] },
  { key: '5-magiya', title: 'Магия, духи, ритуалы', files: ['dump-5-magiya.txt'] },
  { key: '6-tehnomant', title: 'Техномант: формы и спрайты', files: ['dump-6-tehnomant.txt'] },
  { key: '7-transport-toksiny-suschestva', title: 'Транспорт, токсины, наркотики, существа', files: ['dump-7-transport-toksiny-suschestva.txt'] },
  { key: '8-tablicy', title: 'Таблицы: колонки-формулы, клетки-формулы, умолчания', files: ['dump-tables.txt', 'dump-blocks-initiative-grants.txt'] },
  { key: '9-tipy-listov-zapisi', title: 'Типы листов и записи книги', files: ['dump-sheet-types.txt', 'dump-records.txt'] },
]

const PRINCIPLES = `
Контекст. Репозиторий ${ROOT} — конструктор ролевых систем; движок по сути маленький язык программирования под НРИ:
таблица-справочник = перечисление с данными у каждого варианта; колонка-формула справочника или типа записи = метод/вычисляемое
свойство (клетка справочника с формулой видит имена эффекта и лист хозяина — packages/engine/src/engine/cells.ts: readCell; колонка
типа записи считается у экземпляра, @вещь); тип записи с extends = класс; тип листа (system.sheets) с правками = класс с вычисляемыми
полями; эффект с входами и итогами (returns) = функция; «Плата» (effect.cost) = предусловие (стоп там — действие не состоялось);
метка эффекта + договор метки (system.tags) = интерфейс; подписки on: before:X/after:X/done:X (X — id, метка или *), seen, rolled,
moment:*, gained:<id>, lost:<id>, field:<тег> = события; «switch» = блок «По «…»» — это те же плоские branch/orElse/end с условиями
«@x == "строка таблицы"», конструктор рисует их ветками по строкам выбора (apps/web/src/screens/constructor/effects/chain.tsx).
Правила владельца (CLAUDE.md): «всё, что можно типами, — в таблицу»; «и метками триггерными — всё, что может через это работать»;
«кривое место сносить и пересобирать по правилу»; «не собирается данными — дописать движок, данные под дыру движка не подгонять»;
хранимое ≠ вычисляемое (не копировать строку справочника на лист кнопкой — вид выбирается, числа считает тип листа); одно понятие —
одно место (копии шагов → функция; готовая функция уже есть — звать её); правила игры не менять — только как они записаны; правила
Shadowrun — по выпискам ${ROOT}/docs/shadowrun6.md, ${ROOT}/docs/sr6-compendium.md, ${ROOT}/docs/sr6-attack-v2.md;
не выводится из выписок — не выдумывать, а вопрос владельцу.
Как решать «switch или колонка»: ветки делают РАЗНЫЕ действия (разные шаги, вызовы) — switch уместен; ветки отличаются только
ДАННЫМИ (числа, формулы, какой эффект наложить, какой урон) — это колонка справочника/типа, а ветвления нет. Лесенка «если(x == "а", …,
если(x == "б", …))» внутри формулы и сравнения «@x == "a" или @x == "b" или …» (принадлежность множеству) — всегда колонка
(число / да-нет / формула на строку / эффект). Проверка «есть(@roll.tags, "…")» в условии подписки — кандидат в структурный фильтр меток у
подписки (в движке его ещё нет: schema packages/schema/src/world.ts: handler — только on/if/confirm/cost/steps; у правки броска такой фильтр
есть: tags/anyTags/notTags). Подписки gained:/lost: по одному id на каждый эффект одного рода — кандидат в «появилось/ушло по метке» (в
движке нет: core/run.ts ключ gained:<effectId>). «или 0» / «или нет» / «+ 0» — следы пустых клеток: умолчание колонки (default).
Предыдущий разбор (верхнего уровня, проверь и углуби, не повторяй вслепую): ${ROOT}/docs/sr6-review.md и ${ROOT}/docs/samples-dry.md.
Образец-эталон, как надо: samples/dnd5e.world.json («Атака» strike — 10 шагов: бросок атаки — функция с итогом-выбором из таблицы
«Исход атаки», урон — функция с этапами, числа оружия — колонки оружия).
Данные Shadowrun: ${ROOT}/samples/shadowrun.world.json (большой; используй python для выборок). Читаемые выгрузки — в ${D}/:
dump-<кластер>.txt (эффекты: входы, итоги, плата, шаги словами, подписки, правки), dump-tables.txt, dump-sheet-types.txt,
dump-records.txt, dump-blocks-initiative-grants.txt. Скрипт выгрузки эффектов: python3 ${ROOT}/docs/sr6-audit/dump.py (уже выполнен)
СТРОГО только чтение: не правь и не создавай файлы в ${ROOT}, никакого git. Отвечай по-русски.`

const KINDS = ['ladder-in-steps', 'ladder-in-formula', 'string-membership', 'table-data-copied-into-steps', 'copy-of-effect', 'inline-copy-of-existing-function', 'type-dispatch-by-string', 'missing-column-default', 'tag-candidate', 'handler-tag-filter-candidate', 'gained-lost-by-tag-candidate', 'guards-should-be-plata', 'stored-should-be-computed', 'switch-correct-keep', 'other']
const MECH = ['column-of-reference-table', 'method-column-of-record-type', 'sheet-type-modifier', 'record-of-book-type', 'shared-function', 'switch-block', 'handler-tag-filter', 'gained-lost-by-tag', 'effect-tag', 'tag-contract', 'column-default', 'merge-copies', 'plata', 'keep-as-is', 'other']

const AUDIT = {
  type: 'object',
  properties: {
    cluster: { type: 'string' },
    items: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, label: { type: 'string' },
      verdict: { type: 'string', enum: ['ok', 'rework'] },
      problems: { type: 'array', items: { type: 'object', properties: {
        kind: { type: 'string', enum: KINDS },
        where: { type: 'string', description: 'шаг/формула/колонка — точный адрес' },
        evidence: { type: 'string', description: 'цитата из данных' },
        mechanism: { type: 'string', enum: MECH },
        target: { type: 'string', description: 'как должно быть: конкретные таблицы, новые колонки (ключ, подпись, вид, значения/формулы по строкам), функции (входы, итоги), метки — так, чтобы исполнитель мог сделать без догадок' },
        rule_source: { type: 'string', description: 'выписка/страница книги, на которую опирается правило, или «вопрос владельцу»' },
        engine_gap: { type: 'string', description: 'чего не хватает движку, если без этого не собирается; пусто — если хватает (со ссылкой на код, где проверено)' },
      }, required: ['kind', 'where', 'evidence', 'mechanism', 'target', 'rule_source', 'engine_gap'] } },
    }, required: ['id', 'label', 'verdict', 'problems'] } },
    tags_proposed: { type: 'array', items: { type: 'object', properties: { tag: { type: 'string' }, meaning: { type: 'string' }, effects: { type: 'array', items: { type: 'string' } }, who_listens: { type: 'string' } }, required: ['tag', 'meaning', 'effects', 'who_listens'] } },
    engine_gaps: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, why: { type: 'string' }, where: { type: 'string' } }, required: ['what', 'why', 'where'] } },
    questions_for_owner: { type: 'array', items: { type: 'string' } },
  },
  required: ['cluster', 'items', 'tags_proposed', 'engine_gaps', 'questions_for_owner'],
}

const VERDICTS = {
  type: 'object',
  properties: {
    checks: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, where: { type: 'string' },
      status: { type: 'string', enum: ['keep', 'fix', 'drop'] },
      reason: { type: 'string' },
      corrected_target: { type: 'string', description: 'при fix — исправленное целевое устройство' },
    }, required: ['id', 'where', 'status', 'reason', 'corrected_target'] } },
    missed: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, where: { type: 'string' }, problem: { type: 'string' }, target: { type: 'string' } }, required: ['id', 'where', 'problem', 'target'] }, description: 'что разбор пропустил в этом кластере' },
  },
  required: ['checks', 'missed'],
}

const LENSES = [
  { key: 'pravila', text: 'Линза ПРАВИЛ: сохраняет ли целевое устройство правило игры один в один (числа, пороги, порядок бросков, кто бросает, когда снимается, что накладывается)? Сверяй с выписками docs/shadowrun6.md, docs/sr6-compendium.md, docs/sr6-attack-v2.md и с текущими данными. Если цель меняет поведение или опирается на правило, которого нет в выписках, — fix или drop с объяснением. Будь скептиком: по умолчанию ищи, где цель ломает правило.' },
  { key: 'dvizhok', text: 'Линза ДВИЖКА И ЯЗЫКА: собирается ли цель на текущем движке (проверь в коде packages/engine/src: cells.ts readCell и scope, refs.ts, model/sheet-columns.ts itemExpr, шаг status с формулой эффекта, emit с формулой эффекта, each rows, правки типа листа system.sheets[].modifiers, events/happenings.ts, core/run.ts moment/hooked, model/flow.ts), и правильный ли выбран механизм по принципам (switch только когда ветки делают разные действия; данные — в колонки; хранимое ≠ вычисляемое; функция вместо копий; метки и договоры меток)? Если без дописывания движка не собирается — укажи точно, что дописать, а не обход данными. Будь скептиком: по умолчанию считай, что цель не собирается, пока не нашёл в коде, что собирается.' },
]

const auditPrompt = c => `${PRINCIPLES}

Задача: внимательный разбор кластера «${c.title}». Прочитай целиком: ${c.files.map(f => `${D}/${f}`).join(', ')}. Для таблиц/записей пользуйся также python по samples/shadowrun.world.json.
Пройди КАЖДЫЙ ${c.key.startsWith('8') ? 'справочник и тип записи (колонки-формулы, клетки-формулы, отсутствующие умолчания, лесенки и сравнения со строками в формулах; столбцы, которых не хватает, чтобы эффекты перестали ветвиться по строкам — смотри, где таблица используется в эффектах через grep по JSON)' : c.key.startsWith('9') ? 'тип листа (правки, выдачи, подсказки — что вписано числами, что должно считаться от вида; формулы полей) и тип записи книги с записями (клетки-формулы, аргументы кнопок, дубли записей, записи, которые должны быть строками справочника, и наоборот)' : 'эффект кластера (плата, шаги, подписки, правки, срок)'} — ни одного не пропускай; для «ok» тоже дай элемент с verdict ok и пустыми problems.
Для каждой проблемы — точное целевое устройство, такое, чтобы исполнитель сделал без догадок: какая таблица, какие новые колонки (ключ, подпись по-русски, вид, значения по строкам или формула), какая функция (входы, итоги), какая метка, что удалить. Если правило берёшь из данных, а не из выписок, так и напиши. Предлагай метки рода для эффектов кластера (что слушают подписки, кто слушает) и договоры меток.
Отдельно: недостающее в движке (с точным местом в коде) и вопросы владельцу.`

const verifyPrompt = (c, audit, lens) => `${PRINCIPLES}

Задача: независимая проверка разбора кластера «${c.title}». Исходные данные: ${c.files.map(f => `${D}/${f}`).join(', ')}.
${lens.text}
Разбор (JSON) для проверки: ${audit ? JSON.stringify(audit) : `прочитай файл ${RESULTS}/${c.key}.json`}

Для КАЖДОЙ проблемы с verdict rework верни запись в checks (id и where — как в разборе): keep — цель верна; fix — цель надо поправить (дай corrected_target целиком); drop — проблемы нет или цель вредна (reason). Для элементов ok проверь, правда ли ok; пропущенное разбором — в missed.`

const todo = ONLY ? CLUSTERS.filter(c => ONLY.includes(c.key)) : CLUSTERS
phase('Разбор')
const results = await pipeline(
  todo,
  c => (MODE === 'all' ? agent(auditPrompt(c), { label: `разбор:${c.key}`, phase: 'Разбор', schema: AUDIT }) : Promise.resolve({ fromFile: `${RESULTS}/${c.key}.json` })),
  (audit, c) => {
    if (!audit) return null
    const given = audit.fromFile ? null : audit
    return parallel(LENSES.map(lens => () => agent(verifyPrompt(c, given, lens), { label: `проверка:${c.key}:${lens.key}`, phase: 'Проверка', schema: VERDICTS })))
      .then(v => ({ cluster: c.key, title: c.title, audit: given || audit, verdicts: v.map((x, i) => (x ? { lens: LENSES[i].key, ...x } : null)).filter(Boolean) }))
  },
)

const done = results.filter(Boolean)
log(`разобрано кластеров: ${done.length} из ${CLUSTERS.length}`)

phase('Сводка')
const synth = await agent(`${PRINCIPLES}

Задача: сводка и критик полноты по итогам разбора образца Shadowrun по кластерам. Ниже — две независимые проверки (правила; движок и язык) по каждому кластеру; разбор кластера — в поле audit или в файле fromFile (прочитай его).
${JSON.stringify(done)}

Сделай:
1. Полнота: перечисли эффекты (system.effects), справочники и типы записей (system.tables), типы листов (system.sheets), не покрытые ни одним разбором (проверь python по ${ROOT}/samples/shadowrun.world.json), и что разборы упустили по сути (сквозные вещи: одинаковые проверки в разных кластерах, общие функции, которые надо завести один раз для всех — например «Может ли колдовать», «Потратить действие», общее ядро атаки, общее ядро действия Матрицы/«Сотворить»).
2. Согласование: где кластеры предлагают разное для одного и того же (разные имена колонок у одного справочника, разные функции для одной цели, противоречия) — дай одно решение.
3. Единая таксономия меток рода эффектов и договоров меток (метка, смысл, какие эффекты, кто слушает, входы/итоги договора).
4. Недостающее в движке — единым списком без повторов, с точным местом в коде и как проверить, что сделано.
5. Порядок работ по шагам так, чтобы после каждого шага исходы не менялись и его можно было проверить отдельно (тесты samples.shadowrun-*, сверка с книжным калькулятором); для каждого шага — какие эффекты и таблицы он трогает.
6. Вопросы владельцу без повторов.
Ответ — markdown по-русски, плотный, с ключами эффектов и таблиц.`, { label: 'сводка', phase: 'Сводка' })

return { clusters: done, synthesis: synth }
