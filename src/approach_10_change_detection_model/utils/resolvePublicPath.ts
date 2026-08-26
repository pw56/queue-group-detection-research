/**
 * publicフォルダ内のアセットへの正しい本番パスを解決します。
 * @param path public直下からのアセットパス (例: '/images/logo.png' または 'images/logo.png')
 * @returns 本番環境のサブディレクトリを考慮した絶対パス (例: '/a/b/images/logo.png')
 */
export function resolvePublicPath(path: string): string {
  // ViteのBASE_URL（例: '/a/b/'）を取得
  const base = import.meta.env.BASE_URL;
  
  // baseの末尾のスラッシュを除去、pathの先頭のスラッシュを除去して、1つの本物のスラッシュで繋ぐ
  const cleanBase = base.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  
  return `${cleanBase}/${cleanPath}`;
}
