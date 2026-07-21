import React, { useEffect, useRef, useState } from 'react';
import './global.css';
import PairCountDisplay from './components/PairCountDisplay';
import countPairs from './utils/countPairs';

const App = () => {
  const [pairs, setPairs] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>("ファイルをアップロードしてください");
  
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
      setStatusText("画像を解析中...");
    } else if (file.type.startsWith('video/')) {
      setMediaType('video');
      setStatusText("動画を解析中...");
    } else {
      setMediaType(null);
      setStatusText("対応していないファイル形式です");
    }
  };

  // 1秒ごとにメディアからデータを取得してグループ数検出メソッドに流すタイマー
  useEffect(() => {
    const timer = setInterval(async () => {
      // 画像が読み込まれている場合
      if (mediaType === 'image' && imageRef.current) {
        setStatusText("");
        const pairCount = await countPairs(imageRef.current);
        setPairs(pairCount);
      }
      
      // 動画が読み込まれている場合
      if (mediaType === 'video' && videoRef.current) {
        // メモリ上のcanvasを作成して動画の現在のフレームを描画し、Imageオブジェクトに変換して渡す
        const video = videoRef.current;
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA 以上
          setStatusText("");
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
      
      {/* 状態テキスト */}
      {statusText && (
        <p className="absolute top-10 text-gray-400 text-sm animate-pulse">{statusText}</p>
      )}

      {/* ファイル入力（画面上部に配置） */}
      <div className="absolute top-20 z-10">
        <input 
          type="file" 
          accept="image/*,video/*" 
          onChange={handleFileChange} 
          className="text-sm text-gray-400"
        />
      </div>

      {/* グループ数表示コンポーネント */}
      <PairCountDisplay count={pairs} />

      {/* 画像要素の隠しレンダリング */}
      {mediaType === 'image' && mediaSrc && (
        <img
          ref={imageRef}
          src={mediaSrc}
          alt="uploaded"
          className="absolute top-0 left-0 opacity-1 pointer-events-none"
        />
      )}

      {/* 動画要素の隠しレンダリング */}
      {mediaType === 'video' && mediaSrc && (
        <video
          ref={videoRef}
          src={mediaSrc}
          muted
          autoPlay
          playsInline
          className="absolute top-0 left-0 opacity-1 pointer-events-none"
        />
      )}
    </main>
  );
}

export default App;
