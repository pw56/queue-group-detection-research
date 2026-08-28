import {
  acquireCanvasContext,
  releaseCanvasContext,
} from "./canvasManager";

/**
 * 画像を指定したサイズにリサイズして ImageBitmap として取得します。
 * (Canvasを経由せず createImageBitmap のオプションで直接リサイズ)
 */
export async function resizeImageAsImageBitmap(
  imageSource: ImageBitmapSource,
  targetWidth: number,
  targetHeight: number
): Promise<ImageBitmap> {
  return await createImageBitmap(imageSource, {
    resizeWidth: targetWidth,
    resizeHeight: targetHeight,
    resizeQuality: "high",
  });
}

/**
 * 画像の指定領域を切り取って ImageBitmap として取得します。
 * (Canvasを経由せず createImageBitmap の引数で直接切り取り)
 */
export async function cropImageAsImageBitmap(
  imageSource: ImageBitmapSource,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<ImageBitmap> {
  return await createImageBitmap(imageSource, x, y, width, height);
}

/**
 * 画像を指定したサイズにリサイズし、ImageData として取得します。
 * (resizeImageAsImageBitmap でリサイズ後にOffscreenCanvasを経由して抽出)
 */
export async function resizeImageAsImageData(
  imageSource: ImageBitmapSource,
  targetWidth: number,
  targetHeight: number
): Promise<ImageData> {
  // 1. createImageBitmap でリサイズ処理を実行
  const resizedBitmap = await resizeImageAsImageBitmap(
    imageSource,
    targetWidth,
    targetHeight
  );

  // 2. プールからキャンバスコンテキストを取得
  const ctx = acquireCanvasContext(targetWidth, targetHeight);

  try {
    // 3. 左上に描画
    ctx.drawImage(resizedBitmap, 0, 0);

    // 4. ImageData を抽出
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    return imageData;
  } finally {
    // 5. 使い終わった ImageBitmap をクローズし、キャンバスをプールに返却
    resizedBitmap.close();
    releaseCanvasContext(ctx);
  }
}
