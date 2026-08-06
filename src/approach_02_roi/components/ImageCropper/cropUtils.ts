import { ImageLayout } from './types';

/**
 * 手書きパスに基づいて画像を切り抜くユーティリティ関数
 */
export const cropImage = (
  imageElement: HTMLImageElement,
  points: number[],
  imageLayout: ImageLayout
): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    if (points.length < 6) {
      reject(new Error('有効な切り取り輪郭が描画されていません。'));
      return;
    }

    const origWidth = imageElement.naturalWidth;
    const origHeight = imageElement.naturalHeight;

    // メモリ内にピュアCanvasを生成
    const canvas = document.createElement('canvas');
    canvas.width = origWidth;
    canvas.height = origHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvasコンテキストの取得に失敗しました。'));
      return;
    }

    // 画面表示サイズから元画像の解像度へのスケール比率 (アスペクト比を維持した画像サイズを基準に計算)
    const scaleX = origWidth / imageLayout.width;
    const scaleY = origHeight / imageLayout.height;

    // 座標を高解像度スケールに逆算 (画像のオフセット座標 x, y を差し引いて計算)
    const scaledPoints = points.map((val, index) =>
      index % 2 === 0
        ? (val - imageLayout.x) * scaleX
        : (val - imageLayout.y) * scaleY
    );

    // 1. 手書きパスでクリッピング領域（マスク）を作成
    ctx.beginPath();
    ctx.moveTo(scaledPoints[0], scaledPoints[1]);
    for (let i = 2; i < scaledPoints.length; i += 2) {
      ctx.lineTo(scaledPoints[i], scaledPoints[i + 1]);
    }
    ctx.closePath();
    ctx.clip();

    // 2. マスク内に等倍解像度で画像を描画
    ctx.drawImage(imageElement, 0, 0, origWidth, origHeight);

    // 3. 高解像度の HTMLImageElement を生成して返却
    const clippedImage = new Image();
    clippedImage.onload = () => resolve(clippedImage);
    clippedImage.onerror = () => reject(new Error('HTMLImageElementの生成に失敗しました。'));
    clippedImage.src = canvas.toDataURL('image/png');
  });
};
