// キャンバス切り抜き情報を管理する型
export interface CropInfo {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/**
 * キャンバスから透明でない領域の範囲を検出
 * @param canvas - 切り抜き対象のキャンバス
 * @returns 透明でない領域の座標・サイズ情報、検出できない場合はnull
 */
export function detectNonTransparentBounds(canvas: HTMLCanvasElement): CropInfo | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  // アルファチャネルをチェックして透明でない領域を検出
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) { // アルファ値が0より大きい
      const pixelIndex = (i / 4);
      const y = Math.floor(pixelIndex / canvas.width);
      const x = pixelIndex % canvas.width;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // 透明でない領域が検出されない場合
  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    offsetX: minX,
    offsetY: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

/**
 * キャンバスから透明でない部分だけを切り抜く
 * @param canvas - 切り抜き対象のキャンバス
 * @returns 切り抜かれたキャンバス、または検出失敗時はnull
 */
export function cropCanvasToBounds(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const bounds = detectNonTransparentBounds(canvas);
  if (!bounds) return null;

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = bounds.width;
  croppedCanvas.height = bounds.height;

  const ctx = croppedCanvas.getContext('2d');
  if (!ctx) return null;

  // 切り抜き範囲の画像データをコピー
  const sourceCtx = canvas.getContext('2d');
  if (!sourceCtx) return null;

  const imageData = sourceCtx.getImageData(bounds.offsetX, bounds.offsetY, bounds.width, bounds.height);
  ctx.putImageData(imageData, 0, 0);

  return croppedCanvas;
}
