export function getExtensionFromFile(file: File): string | undefined {
  // ファイル名を取得（例: "image.png"）
  const fileName = file.name;
  
  // ドット（.）で分割して、最後の要素を取得し、小文字に統一
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  return extension;
}