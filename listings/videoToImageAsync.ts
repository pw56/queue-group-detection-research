export function videoToImageAsync({
  video,
  mime = 'image/png',
  quality // qualityは 0.0 から 1.0 の間で指定（例: 0.8）
}: {
  video: HTMLVideoElement,
  mime?: 'image/png' | 'image/jpeg' | 'image/webp',
  quality?: number
}): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    // 動画が未読み込みの場合は即座にnullを返す
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return resolve(null);
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return resolve(null);
    }

    // キャンバスに描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const img = new Image();
    
    // 画像の読み込みが完了したらresolveする
    img.onload = () => resolve(img);
    // 読み込みエラー時のハンドリング
    img.onerror = () => resolve(null);
    
    // データURLを代入して読み込みを開始させる
    img.src = canvas.toDataURL(mime, quality);
  });
}
