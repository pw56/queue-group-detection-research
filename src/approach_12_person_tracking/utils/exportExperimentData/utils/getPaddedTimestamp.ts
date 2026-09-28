/**
 * 指定した桁数で0埋めされたタイムスタンプ文字列を取得するメソッド
 * @param digits 0埋めした後の全体の桁数（デフォルトは5桁）
 * @returns 0埋めされた文字列（例: "00042"）
 */
export function getPaddedTimestamp(timestamp: number, digits: number = 5): string {
  // 数値を文字列に変換し、指定の桁数まで左側を '0' で埋める
  return String(timestamp).padStart(digits, '0');
}
