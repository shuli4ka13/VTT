import ru from './ru/play.json';
import en from './en/play.json';
import { register } from './index.ts';

register('ru', 'play', ru);
register('en', 'play', en);

export { useT, t, Trans, langName, i18n, UI_LANGS } from './index.ts';
