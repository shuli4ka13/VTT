// Ошибки движка. Отдельно от ошибок формул: там «строка не разбирается»,
// здесь «система и чарник не сходятся».

export class EngineError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

// Запрошен тег, которого система не объявляет.
export class UnknownTagError extends EngineError {
  constructor(tag, fromTag) {
    super(fromTag
      ? `система не объявляет тег «${tag}» — на него ссылается поле «${fromTag}»`
      : `система не объявляет тег «${tag}»`);
    this.tag = tag;
    this.fromTag = fromTag ?? null;
  }
}

// Формулы замкнулись в кольцо. Внятная ошибка вместо зависания — критерий приёмки №7.
export class CycleError extends EngineError {
  constructor(path) {
    super(`циклическая зависимость формул: ${path.join(' → ')}`);
    this.path = path;
  }
}

// Таблица не найдена или аргумент не попал ни в один диапазон.
export class TableError extends EngineError {}
