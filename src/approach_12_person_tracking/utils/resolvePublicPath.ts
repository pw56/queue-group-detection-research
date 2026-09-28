export function resolvePublicPath(path: string): string {
  // ViteのBASE_URL（例: '/a/b/' または '/'）を取得
  const base = import.meta.env.BASE_URL;
  
  // baseの末尾のスラッシュを除去
  let cleanBase = base.replace(/\/$/, '');
  
  // baseが '/' だった場合、cleanBaseが空文字になるのを防ぐ（ルート絶対パスを維持）
  if (cleanBase === '') {
    cleanBase = '';
  }
  
  // pathの先頭のスラッシュを除去
  const cleanPath = path.replace(/^\//, '');
  
  // cleanBaseが空の場合は、先頭に必ずスラッシュを付与して返す
  return cleanBase ? `${cleanBase}/${cleanPath}` : `/${cleanPath}`;
}
