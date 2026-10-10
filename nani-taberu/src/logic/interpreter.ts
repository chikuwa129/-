import type { ParsedInput } from './freeText';
import { parseFreeText } from './freeText';
import keywords from '../data/keywords.json';

/**
 * フリー入力の解釈器。今は辞書ベースだけだが、将来 LLM API で
 * 入力文を属性タグに変換する実装を同じインターフェースで差し込めるようにしている。
 * 入力文はどこにも保存しない。
 */
export interface FreeTextInterpreter {
  interpret(text: string): Promise<ParsedInput>;
}

export const dictionaryInterpreter: FreeTextInterpreter = {
  async interpret(text) {
    return parseFreeText(text, keywords);
  },
};
