import React, { useEffect, useRef, useState } from 'react';
import './global.css';
import countPairs from './utils/countPairs';

const App = () => {
  const [pairs, setPairs] = useState<number>(0);
  
  // アップロードされたメディアの管理用
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  
  // ループ処理で参照するためのRef
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ファイル選択時のハンドラ
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setMediaSrc(url);

    if (file.type.startsWith('image/')) {
      setMediaType('image');
    } else if (file.type.startsWith('video/')) {
      setMediaType('video');
    } else {
      setMediaType(null);
    }
  };

  // 1秒ごとにメディアからデータを取得してグループ数検出メソッドに流すタイマー
  useEffect(() => {
    const timer = setInterval(async () => {
      // 画像が読み込まれている場合
      if (mediaType === 'image' && imageRef.current) {
        const pairCount = await countPairs(imageRef.current);
        setPairs(pairCount);
      }
      
      // 動画が読み込まれている場合
      if (mediaType === 'video' && videoRef.current) {
        // メモリ上のcanvasを作成して動画の現在のフレームを描画し、Imageオブジェクトに変換して渡す
        const video = videoRef.current;
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA 以上
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = new Image();
            img.src = canvas.toDataURL('image/jpeg');
            img.onload = async () => {
              const pairCount = await countPairs(img);
              setPairs(pairCount);
            };
          }
        }
      }
    }, 1000); // 1秒ごと

    return () => clearInterval(timer);
  }, [mediaType]);

  return (
    /* 元のCSS設定（透明背景、中央配置、スクロールバー非表示、フォント） */
    <main className="flex h-screen w-screen items-center justify-center bg-transparent overflow-hidden font-sans">
      
      {mediaSrc && (
        <>

          {/* 入力データ(画像) */}
          {mediaType === 'image' && (
            <img
              ref={imageRef}
              src={mediaSrc}
              alt="uploaded"
              className="w-1/2 h-full object-contain"
            />
          )}

          {/* 入力データ(動画) */}
          {mediaType === 'video' && (
            <video
              ref={videoRef}
              src={mediaSrc}
              muted
              autoPlay
              playsInline
              className="w-1/2 h-full object-contain"
            />
          )}
          
        </>
      )}

      {/* flex-col を追加して中の要素を強制的に改行 */}
      {/* navの横幅を画面の半分にし、境界が中央にくるように調整 */}
      <nav className="flex flex-col w-1/2 items-center justify-center">
        
        {/* ファイル入力（画面上部に配置） */}
        <input 
          type="file" 
          accept="image/*,video/*" 
          onChange={handleFileChange}
        />
        
        {/* グループ数表示コンポーネント */}
        <span>検出されたグループ数: {pairs}</span>

      </nav>
    </main>
  );
}

export default App;
