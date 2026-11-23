// @vitest-environment jsdom
import { beforeEach, afterEach } from 'vitest';
import { roundTrip } from '../../testing/round-trip.tsx';
import { useLocale } from '../../store/locale.ts';

beforeEach(() => { useLocale.getState().setLang('en'); });
afterEach(() => { useLocale.getState().setLang('ru'); });

roundTrip('13th Age');
roundTrip('Blades in the Dark');
