// 共通の描画・検証処理を行う内部関数
function drawMediaToCanvas(media: HTMLImageElement | HTMLVideoElement): HTMLCanvasElement | null {
  let width = 0;
  let height = 0;

  if (media instanceof HTMLVideoElement) {
    // ビデオ要素の場合の処理
    if (media.videoWidth === 0 || media.videoHeight === 0) {
      return null;
    }
    width = media.videoWidth;
    height = media.videoHeight;
  } else if (media instanceof HTMLImageElement) {
    // 画像要素の場合の処理（読み込み未完了、またはサイズが0の場合はnullを返す）
    if (!media.complete || media.naturalWidth === 0 || media.naturalHeight === 0) {
      return null;
    }
    width = media.naturalWidth;
    height = media.naturalHeight;
  } else {
    // 想定外の型が渡された場合のセーフティ
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  // キャンバスに描画
  ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
  
  return canvas;
}

export function videoToImageAsync(
  video: HTMLVideoElement,
  mime: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality?: number // qualityは 0.0 から 1.0 の間で指定（例: 0.8）
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const canvas = drawMediaToCanvas(video);
    if (!canvas) {
      return resolve(null);
    }
    
    const img = new Image();
    
    // 画像の読み込みが完了したらresolveする
    img.onload = () => resolve(img);
    // 読み込みエラー時のハンドリング
    img.onerror = () => resolve(null);
    
    // データURLを代入して読み込みを開始させる
    img.src = canvas.toDataURL(mime, quality);
  });
}

export function videoToImageAsBlobAsync(
  // `videoToImageAsync()` と同じ引数
  video: HTMLVideoElement,
  mime: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = drawMediaToCanvas(video);
    if (!canvas) {
      return resolve(null);
    }

    // CanvasからBlobを生成して返す
    canvas.toBlob(
      (blob) => resolve(blob),
      mime,
      quality
    );
  });
}

export function imageToBlobAsync(
  image: HTMLImageElement,
  mime: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = drawMediaToCanvas(image);
    if (!canvas) {
      return resolve(null);
    }

    // CanvasからBlobを生成して返す
    canvas.toBlob(
      (blob) => resolve(blob),
      mime,
      quality
    );
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      mime,
      quality
    );
  });
}
