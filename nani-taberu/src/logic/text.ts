/** ひらがなをカタカナにそろえる（文字数は変わらない） */
export function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 全角／半角をそろえ、英字を小文字にし、前後の空白を除く */
export function normalizeWidth(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim();
}

/** 照合用の正規化：全角／半角・大小文字・ひらがな／カタカナをそろえる */
export function normalize(s: string): string {
  return toKatakana(normalizeWidth(s));
}

export const isKana = (s: string) => /^[ぁ-ゖァ-ヺー]+$/.test(s);
export const isHiragana = (c: string) => /^[ぁ-ゖ]$/.test(c);
