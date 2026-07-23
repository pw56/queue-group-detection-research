// 共通の描画・検証処理を行う内部関数
function drawVideoToCanvas(video: HTMLVideoElement): HTMLCanvasElement | null {
  // 動画が未読み込みの場合は即座にnullを返す
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  // キャンバスに描画
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  return canvas;
}

export function videoToImageAsync(
  video: HTMLVideoElement,
  mime: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality?: number // qualityは 0.0 から 1.0 の間で指定（例: 0.8）
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const canvas = drawVideoToCanvas(video);
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
    const canvas = drawVideoToCanvas(video);
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
