import { useState } from 'react';
import { takeRestoreProblem, brokenDraft, forgetBrokenDraft } from '../store/world.ts';
import { Verdict, Button } from './primitives.tsx';

function download(text: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.download = 'vtt-черновик.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

export function RestoreNotice() {
  const [problem, setProblem] = useState<string | null>(() => takeRestoreProblem() ?? (brokenDraft() ? 'копия лежит с прошлого раза' : null));
  if (!problem) return null;
  const kept = brokenDraft();

  return (
    <Verdict
      tone="bad"
      action={
        <span className="inline inline--tight">
          {kept ? <Button size="sm" onClick={() => download(kept)}>Скачать копию</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => { forgetBrokenDraft(); setProblem(null); }}>Понятно</Button>
        </span>
      }
    >
      <span title={problem}>
        Черновик в этом браузере остался от старой версии конструктора и не открылся.
        Сохранённое на сервере цело — откройте систему через «сменить».
      </span>
    </Verdict>
  );
}
