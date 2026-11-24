// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { MAX_SCALE, MIN_SCALE, READABLE, clampScale, distance, fitView, middle, panBy, startView, stepScale, wheelScale, zoomAt } from './viewport.ts';

const BOX = { left: -300, top: -200, right: 300, bottom: 200 };

const screenOf = (view: { x: number; y: number; k: number }, point: { x: number; y: number }) => ({ x: point.x * view.k + view.x, y: point.y * view.k + view.y });

describe('панорама и масштаб', () => {
  it('масштаб держится в границах 0.3…2, а нечисло — единицей', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(9)).toBe(MAX_SCALE);
    expect(clampScale(1.3)).toBe(1.3);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it('вписать: большой эффект уменьшается, целиком лежит в области и стоит по центру', () => {
    const size = { w: 400, h: 300 };
    const view = fitView(BOX, size);
    expect(view.k).toBeLessThan(1);
    const corner = screenOf(view, { x: BOX.right, y: BOX.bottom });
    const origin = screenOf(view, { x: BOX.left, y: BOX.top });
    expect(origin.x).toBeGreaterThanOrEqual(0);
    expect(origin.y).toBeGreaterThanOrEqual(0);
    expect(corner.x).toBeLessThanOrEqual(size.w);
    expect(corner.y).toBeLessThanOrEqual(size.h);
    expect(screenOf(view, { x: 0, y: 0 })).toEqual({ x: size.w / 2, y: size.h / 2 });
  });

  it('вписать: маленький эффект не растёт крупнее 100%', () => {
    expect(fitView({ left: -50, top: -50, right: 50, bottom: 50 }, { w: 2000, h: 1500 }).k).toBe(1);
  });

  it('вписать: у области нулевого размера (как в jsdom) масштаб конечный', () => {
    const view = fitView(BOX, { w: 0, h: 0 });
    expect(Number.isFinite(view.k) && Number.isFinite(view.x) && Number.isFinite(view.y)).toBe(true);
    expect(view.k).toBe(1);
  });

  it('вписать: очень большой эффект не уходит ниже нижней границы', () => {
    expect(fitView({ left: -9000, top: -9000, right: 9000, bottom: 9000 }, { w: 400, h: 300 }).k).toBe(MIN_SCALE);
  });

  it('масштаб вокруг точки: точка под курсором остаётся на месте', () => {
    const view = { x: 40, y: -25, k: 0.8 };
    const at = { x: 210, y: 130 };
    const world = { x: (at.x - view.x) / view.k, y: (at.y - view.y) / view.k };
    const next = zoomAt(view, 1.6, at);
    expect(next.k).toBe(1.6);
    const back = screenOf(next, world);
    expect(back.x).toBeCloseTo(at.x, 9);
    expect(back.y).toBeCloseTo(at.y, 9);
  });

  it('масштаб вокруг точки ограничен, и при упоре в границу сдвиг не плывёт', () => {
    const view = { x: 10, y: 10, k: 2 };
    expect(zoomAt(view, 5, { x: 100, y: 100 })).toEqual(view);
  });

  it('сдвиг складывается; шаг кнопок и колесо идут в нужную сторону', () => {
    expect(panBy({ x: 1, y: 2, k: 1 }, 5, -3)).toEqual({ x: 6, y: -1, k: 1 });
    expect(stepScale(1, 1)).toBeGreaterThan(1);
    expect(stepScale(1, -1)).toBeLessThan(1);
    expect(stepScale(MAX_SCALE, 1)).toBe(MAX_SCALE);
    expect(wheelScale(1, -100)).toBeGreaterThan(1);
    expect(wheelScale(1, 100)).toBeLessThan(1);
    expect(wheelScale(MIN_SCALE, 10000)).toBe(MIN_SCALE);
  });

  it('щипок: расстояние и середина двух пальцев', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(middle({ x: 0, y: 2 }, { x: 4, y: 6 })).toEqual({ x: 2, y: 4 });
  });

  it('при открытии большой эффект не мельчится: масштаб читаемый, в середине — центр эффекта', () => {
    const big = { left: -900, top: -400, right: 600, bottom: 1400 };
    const size = { w: 800, h: 500 };
    expect(fitView(big, size).k).toBeLessThan(READABLE);
    expect(startView(big, size)).toEqual({ x: 400, y: 250, k: READABLE });
    const small = { left: -100, top: -100, right: 100, bottom: 100 };
    expect(startView(small, size)).toEqual(fitView(small, size));
  });
});
