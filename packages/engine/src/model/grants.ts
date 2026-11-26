import type { ItemGrant } from './types.ts';

export type GrantArgs = Record<string, { expr: string } | string | number | boolean | null>;
export interface Grant { effect: string; args?: GrantArgs }

export const grantOf = (grant: ItemGrant): Grant =>
  typeof grant === 'string' ? { effect: grant } : { effect: grant.effect, args: grant.args as GrantArgs };

export const grantIds = (list: readonly ItemGrant[] | undefined): string[] =>
  (list ?? []).map(grant => (typeof grant === 'string' ? grant : grant.effect));

export const plainGrants = (list: readonly ItemGrant[] | undefined): string[] =>
  (list ?? []).filter((grant): grant is string => typeof grant === 'string');

export const argGrants = (list: readonly ItemGrant[] | undefined): Grant[] =>
  (list ?? []).filter(grant => typeof grant !== 'string').map(grantOf);

export function mergeGrants(base: readonly ItemGrant[] | undefined, own: readonly ItemGrant[] | undefined): ItemGrant[] {
  const out: ItemGrant[] = [];
  for (const grant of [...(base ?? []), ...(own ?? [])]) {
    if (typeof grant === 'string') {
      if (!out.includes(grant)) out.push(grant);
      continue;
    }
    const at = out.findIndex(was => typeof was !== 'string' && was.effect === grant.effect);
    if (at < 0) out.push({ ...grant, args: { ...grant.args } });
    else {
      const was = out[at] as Exclude<ItemGrant, string>;
      out[at] = { ...was, args: { ...was.args, ...grant.args } };
    }
  }
  return out;
}
