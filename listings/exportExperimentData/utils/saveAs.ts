/**
 * データをファイルとしてダウンロード保存する
 */
export function saveAs(blob: Blob | File, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}