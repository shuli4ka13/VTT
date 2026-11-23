import { useLocation, useNavigate } from 'react-router';
import { useRoom } from '../../store/room.ts';
import { useSession } from '../../store/session.ts';
import { mayAnswer } from '../../engine/rights.ts';
import { Button } from '../../ui/primitives.tsx';
import { Trans, useT } from '../../i18n/play.ts';

export const QUESTION_ID = 'room-question';

export function PendingBar() {
  const room = useRoom(s => s.room);
  const userId = useSession(s => s.userId);
  const navigate = useNavigate();
  const t = useT('play');
  const { pathname } = useLocation();
  const pending = room?.pending;
  if (!room || !pending) return null;

  const holder = room.members.find(m => m.sheetId === pending.sheetId);
  const gm = room.members.some(m => m.userId === userId && m.role === 'gm');
  const mine = mayAnswer(room, userId, pending.sheetId) && (holder ? holder.userId === userId : gm);
  const go = () => {
    const show = () => document.getElementById(QUESTION_ID)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    if (pathname.endsWith('/play/table')) show();
    else { navigate('/play/table'); window.setTimeout(show, 50); }
  };

  return (
    <div className={`asked${mine ? ' asked--mine' : ''}`} role="status">
      <span className="asked__mark" aria-hidden>?</span>
      <span className="asked__text">
        {mine
          ? <Trans i18nKey="play:pending.mine" values={{ question: pending.question }} components={{ b: <b /> }} />
          : t('pending.other', { question: pending.question })}
      </span>
      <Button size="sm" variant={mine ? 'primary' : 'ghost'} onClick={go}>{t('pending.go')}</Button>
    </div>
  );
}
