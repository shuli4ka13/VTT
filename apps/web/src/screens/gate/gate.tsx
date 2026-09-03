import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../../store/session.ts';
import { Button, Input, Verdict } from '../../ui/primitives.tsx';

export function GateScreen() {
  const name = useSession(s => s.name);
  const signed = useSession(s => s.signed);
  const enter = useSession(s => s.enter);
  const leave = useSession(s => s.leave);
  const navigate = useNavigate();

  const [draft, setDraft] = useState(name);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setTrouble(null);
    try {
      await enter(draft);
    } catch (err) {
      setTrouble((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="roles">
      <h1 className="roles__title"><em>VTT</em> — конструктор систем и стол</h1>

      {signed ? (
        <>
          <p className="roles__lead">
            Вы вошли как <b>{name}</b>. Автор собирает мир, партия за ним играет.
          </p>

          <div className="roles__grid">
            <button type="button" className="role" onClick={() => navigate('/author/start')}>
              <span className="role__name">Собираю систему</span>
              <span className="role__hint">
                Поля листа, кости, эффекты — механика мира. Своя система, свои правила.
              </span>
            </button>

            <button type="button" className="role" onClick={() => navigate('/book/start')}>
              <span className="role__name">Собираю компендиум</span>
              <span className="role__hint">
                Вещи для готовой системы: оружие, заклинания, доспехи. Система может быть чужой.
              </span>
            </button>

            <button type="button" className="role" onClick={() => navigate('/play/table')}>
              <span className="role__name">Мы играем</span>
              <span className="role__hint">Открыть опубликованный мир, вести персонажа, ходить за столом.</span>
            </button>
          </div>

          <Button size="sm" variant="ghost" onClick={leave}>войти под другим именем</Button>
        </>
      ) : (
        <>
          <p className="roles__lead">
            Представьтесь — имя видят соседи по столу, и им подписаны опубликованные миры.
          </p>

          {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}

          <div className="gate__form">
            <Input
              value={draft}
              onChange={setDraft}
              placeholder="ваше имя"
              onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
            />
            <Button variant="primary" onClick={() => void submit()} disabled={busy}>
              {busy ? 'входим…' : 'Войти'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
