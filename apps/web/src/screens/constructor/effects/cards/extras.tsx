import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../../../ui/primitives.tsx';
import { useT } from '../../../../i18n/author.ts';

export interface Extra {
  key: string;
  label: string;
  on: boolean;
  node: ReactNode;
  add: () => void;
  drop?: () => void;
}

export function Extras({ items }: { items: Extra[] }) {
  const t = useT('stepCards');
  const [opened, setOpened] = useState<string[]>([]);
  const shown = items.filter(item => item.on || opened.includes(item.key));
  const rest = items.filter(item => !shown.includes(item));

  const hide = (item: Extra) => {
    setOpened(opened.filter(key => key !== item.key));
    item.drop?.();
  };

  return (
    <div className="stack stack--tight">
      {shown.map(item => (
        <div className="extra" key={item.key}>
          {item.node}
          {item.drop || opened.includes(item.key) ? (
            <button
              type="button" className="extra__x"
              title={t('extras.remove', { name: item.label })} aria-label={t('extras.remove', { name: item.label })}
              onClick={() => hide(item)}
            >×</button>
          ) : null}
        </div>
      ))}

      {rest.length ? (
        <div className="inline inline--tight">
          {rest.map(item => (
            <Button
              key={item.key} size="sm" variant="ghost"
              onClick={() => { setOpened([...opened, item.key]); item.add(); }}
            >
              + {item.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
