import type { RoomState, Sheet } from '@vtt/schema';
import { expiryWords } from './clock-words.ts';
import { useT } from '../../i18n/play.ts';

type Worn = NonNullable<Sheet['effects']>[number];

export function hangingOf(room: RoomState, sheet: Sheet): { key: string; entry: Worn; label: string; left: string | null }[] {
  return (sheet.effects ?? []).map((entry, index) => ({
    key: `${entry.effectId}|${entry.inst ?? ''}|${index}`,
    entry,
    label: room.system.effects?.[entry.effectId]?.label ?? entry.effectId,
    left: expiryWords(entry, room.clock),
  }));
}

export function Hanging({ room, sheet, compact, onRemove }: {
  room: RoomState;
  sheet: Sheet;
  compact?: boolean;
  onRemove?: (entry: Worn) => void;
}) {
  const t = useT('play');
  const list = hangingOf(room, sheet);
  if (!list.length) return compact ? null : <span className="faint">{t('hanging.none')}</span>;
  if (compact) {
    return (
      <span className="hang hang--compact">
        {list.map(one => (
          <span key={one.key} className="hang__badge" title={one.left ? `${one.label} — ${one.left}` : one.label}>
            <span className="hang__name">{one.label}</span>
            {one.left ? <span className="hang__left">{one.left}</span> : null}
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="hang">
      {list.map(one => (
        <div key={one.key} className="hang__row">
          <span className="hang__name">{one.label}</span>
          <span className="hang__left">{one.left ?? t('hanging.forever')}</span>
          {onRemove ? (
            <button type="button" className="hang__x" title={t('hanging.remove')} aria-label={t('hanging.removeNamed', { name: one.label })} onClick={() => onRemove(one.entry)}>×</button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
