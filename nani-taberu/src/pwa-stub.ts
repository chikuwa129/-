// 単一HTML版（Artifact 等のプレビュー用）では Service Worker を登録しない
export function registerSW(_opts?: unknown) {
  return () => Promise.resolve();
}
