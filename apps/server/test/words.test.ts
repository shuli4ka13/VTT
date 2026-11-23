import { describe, it, expect } from 'vitest';
import { EN } from '../src/common/words.en.ts';
import { inLang, langNow, langOf, say, sayIn, errorsCount } from '../src/common/words.ts';
import { scan, places } from './words.scan.ts';

const found = scan();
const wanted = new Set(found.phrases);

describe('слова сервера: русская фраза в коде, английская — по ней', () => {
  it('каждый русский литерал сервера помечен (кроме засева, запуска и журнала консоли)', () => {
    expect(found.unmarked).toEqual([]);
  });

  it('у каждой фразы есть английская, лишних нет, места подстановки те же, русских букв в английской нет', () => {
    expect([...wanted].filter(id => !EN[id]?.trim())).toEqual([]);
    expect(Object.keys(EN).filter(id => !wanted.has(id))).toEqual([]);
    expect(Object.entries(EN).filter(([id, text]) => places(id).join() !== places(text).join()).map(([id]) => id)).toEqual([]);
    expect(Object.entries(EN).filter(([, text]) => /[Ѐ-ӿ]/u.test(text)).map(([id]) => id)).toEqual([]);
  });

  it('язык запроса — из заголовка; вне запроса — русский', () => {
    expect(langOf('en-US,en;q=0.9,ru;q=0.8')).toBe('en');
    expect(langOf('ru')).toBe('ru');
    expect(langOf(undefined)).toBe('ru');
    expect(langOf('de')).toBe('en');
    expect(langNow()).toBe('ru');
    expect(say`клетка занята`).toBe('клетка занята');
  });

  it('фраза говорится на языке запроса и не утекает в соседний запрос', async () => {
    const slow = inLang('en', async () => { await new Promise(resolve => setTimeout(resolve, 5)); return say`комнаты «${'r1'}» нет`; });
    const fast = inLang('ru', async () => say`комнаты «${'r1'}» нет`);
    expect(await fast).toBe('комнаты «r1» нет');
    expect(await slow).toBe('there is no room “r1”');
    expect(langNow()).toBe('ru');
  });

  it('текст для всех за столом говорится на названном языке, какой бы ни был язык запроса', () => {
    expect(inLang('en', () => sayIn('ru')`Ведущий бросает втайне`)).toBe('Ведущий бросает втайне');
    expect(inLang('ru', () => sayIn('en')`Ведущий бросает втайне`)).toBe('The game master rolls in secret');
  });

  it('счёт ошибок: по-русски три формы, по-английски две', () => {
    expect([1, 2, 5, 11, 21].map(n => errorsCount(n))).toEqual(['1 ошибка', '2 ошибки', '5 ошибок', '11 ошибок', '21 ошибка']);
    expect(inLang('en', () => [1, 2, 21].map(n => errorsCount(n)))).toEqual(['1 error', '2 errors', '21 errors']);
  });
});
