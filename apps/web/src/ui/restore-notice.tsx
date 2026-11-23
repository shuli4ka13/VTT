import { useState } from 'react';
import { takeRestoreProblem, brokenDraft, forgetBrokenDraft } from '../store/world.ts';
import { Verdict, Button } from './primitives.tsx';
import { t, useT } from '../i18n/index.ts';

function download(text: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.download = t('ui:restore.file');
  link.click();
  URL.revokeObjectURL(link.href);
}

export function RestoreNotice() {
  const t = useT('ui');
  const [problem, setProblem] = useState<string | null>(() => takeRestoreProblem() ?? (brokenDraft() ? t('restore.kept') : null));
  if (!problem) return null;
  const kept = brokenDraft();

  return (
    <Verdict
      tone="bad"
      action={
        <span className="inline inline--tight">
          {kept ? <Button size="sm" onClick={() => download(kept)}>{t('restore.download')}</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => { forgetBrokenDraft(); setProblem(null); }}>{t('restore.ok')}</Button>
        </span>
      }
    >
      <span title={problem}>
        {t('restore.text')}
      </span>
    </Verdict>
  );
}
