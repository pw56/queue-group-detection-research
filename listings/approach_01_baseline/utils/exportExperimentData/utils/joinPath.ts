export function joinPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/(^\/+|\/+$)/g, '')) // 先頭と末尾のスラッシュを削除
    .filter((part) => part.length > 0)               // 空文字を除外
    .join('/');                                      // '/' で結合
}