import React, { useEffect, useRef, useState } from 'react';
import './global.css';
import { getGroups, Groups } from './getGroups';
import { MediaCanvas } from './MediaCanvas';
import { videoToImageAsync } from './videoToImageAsync';

const App = () => {
  // アップロードされたメディアの管理用
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  
  // ループ処理で参照するためのRef
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  // 合成結果表示用
  const [mediaFrame, setMediaFrame] = useState<CanvasImageSource | null>(null);
  const [groups, setGroups] = useState<Groups>([]);
  
  // ファイル選択時のハンドラ
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 動画の長さチェック(ガード節)
    if (file.type.startsWith('video/')) {
      const isTooLong = await new Promise<boolean>((resolve) => {
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';
        videoElement.src = URL.createObjectURL(file);
        
        videoElement.onloadedmetadata = () => {
          URL.revokeObjectURL(videoElement.src); // 一時URLの即時解放
          resolve(videoElement.duration > 999);
        };

        // エラーハンドリング（破損ファイルなど）
        videoElement.onerror = () => {
          URL.revokeObjectURL(videoElement.src);
          resolve(true); // 安全のためエラー時も弾く
        };
      });

      if (isTooLong) {
        alert('999秒を超える動画はアップロードできません。');
        e.target.value = ''; // 選択されたファイルをリセット
        return; // 処理を中断
      }
    }
    
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

  // メモリリーク対策：アンマウント時にオブジェクトURLを解放
  useEffect(() => {
    return () => {
      if (mediaSrc) URL.revokeObjectURL(mediaSrc);
    };
  }, [mediaSrc]);

  // 1秒ごとにメディアからデータを取得してグループ数検出メソッドに流すタイマー
  useEffect(() => {
    const timer = setInterval(async () => {
      // 画像が読み込まれている場合
      if (mediaType === 'image' && imageRef.current) {
        const detectedGroups = await getGroups(imageRef.current);
        setMediaFrame(imageRef.current);
        setGroups(detectedGroups);
      }
      
      // 動画が読み込まれている場合
      if (mediaType === 'video' && videoRef.current) {
        // メモリ上のcanvasを作成して動画の現在のフレームを描画し、Imageオブジェクトに変換して渡す
        const video = videoRef.current;
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA 以上
          const img = await videoToImageAsync(video); // 実験結果出力に含める
          const detectedGroups = await getGroups(img!);
          setMediaFrame(img);
          setGroups(detectedGroups);
        }
      }
    }, 1000); // 1秒ごと

    return () => clearInterval(timer);
  }, [mediaType]);

  return (
    /* 元のCSS設定（透明背景、中央配置、スクロールバー非表示、フォント） */
    <main className="flex h-screen w-screen items-center justify-center bg-transparent overflow-hidden font-sans">
      
      {/* ファイル入力 */}
      {!mediaSrc && (
        <>
          <input 
            id="file-upload"
            type="file" 
            accept="image/*,video/*" 
            onChange={handleFileChange}
            className="hidden"
          />
          <label 
            htmlFor="file-upload" 
            className="absolute inset-0 m-auto h-fit w-fit cursor-pointer select-none border border-gray-400 bg-white px-4 py-2 rounded shadow hover:bg-gray-50 text-gray-700"
          >
            ファイルを選択
          </label>
        </>
      )}

      {mediaSrc && (
        <>

          {/* 入力データ(画像) */}
          {mediaType === 'image' && (
            <img
              ref={imageRef}
              src={mediaSrc}
              alt="uploaded"
              className="absolute top-0 left-0 opacity-1 pointer-events-none"
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
              className="absolute top-0 left-0 opacity-1 pointer-events-none"
            />
          )}

          {/* 合成表示用のCanvasコンポーネント（DRY原則に基づき共通化） */}
          <MediaCanvas 
            mediaSource={mediaFrame} 
            groups={groups}
            className="w-2/3 h-full object-contain"
          />
          
          {/* flex-col を追加して中の要素を強制的に改行 */}
          {/* navの横幅を画面の半分にし、境界が中央にくるように調整 */}
          <nav className="flex flex-col w-1/3 items-center justify-center">
            
            {/* グループ数表示 */}
            <span>検出されたグループ数: {groups.length}</span>
          </nav>

        </>
      )}
    </main>
  );
}

export default App;
