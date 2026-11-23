const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export const latinOf = (text: string): string => [...text.toLowerCase()].map(ch => TRANSLIT[ch] ?? ch).join('');

export const keyFrom = (label: string): string => {
  const slug = latinOf(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug && !/^[a-z]/.test(slug) ? `k_${slug}` : slug;
};
