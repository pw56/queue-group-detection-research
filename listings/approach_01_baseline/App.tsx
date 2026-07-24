import React, { useEffect, useRef, useState } from 'react';
import './global.css';
import { getGroups, Groups } from './getGroups';
import { MediaCanvas } from './components/MediaCanvas';
import { imageToBlobAsync, videoToImageAsync, canvasToBlob } from './utils/toImage';
import {
  addInputMediaFile,
  addExtractedFrameAsPng,
  addAnnotatedImageAsPng,
  addObjectAsJson,
  downloadZip
} from './utils/exportExperimentData';

// 動画用のグローバルなタイムスタンプ
// 動画のEffect内の変数だとバウンディングボックスの方で使えないのでグローバル
let videoTimestamp: number = -1;
const imageTimestamp: number = 0; // 画像のタイムスタンプは固定

const App = () => {
  // アップロードされたメディアの管理用
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  
  // ループ処理で参照するためのRef
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  // Canvas生成完了を通知するコールバック
  const resolveCanvasRef = useRef<(() => void) | null>(null);
  
  // 合成結果表示用
  const [mediaFrame, setMediaFrame] = useState<CanvasImageSource | null>(null);
  const [groups, setGroups] = useState<Groups>([]);

  // ダウンロードボタン制御用
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  
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

    // ここで実験結果として入力された画像・動画をZipに投げる
    addInputMediaFile(file);

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

  // 画像用の1回限りの処理
  useEffect(() => {
    if (mediaType === 'image' && imageRef.current) {
      const processImage = async () => {
        const detectedGroups = await getGroups(imageRef.current!);
        
        setMediaFrame(imageRef.current);
        addExtractedFrameAsPng(await imageToBlobAsync(imageRef.current!, 'image/png') as Blob, imageTimestamp);
        setGroups(detectedGroups);
        addObjectAsJson(detectedGroups, imageTimestamp);
      };
      
      // 画像の読み込み完了を待って処理、または既に読み込み済みの場合は即時実行
      if (imageRef.current.complete) {
        processImage();
      } else {
        imageRef.current.onload = processImage;
      }
    }
  }, [mediaType, mediaSrc]);

  // 1秒ごとにメディアからデータを取得してグループ数検出メソッドに流すタイマー
  useEffect(() => {
    if (mediaType !== 'video' || !videoRef.current) return;

    const video = videoRef.current;

    const handleTimeUpdate = async () => {
      // 動画の現在の再生時間を秒単位（整数）で取得
      const currentTimeFloor = Math.floor(video.currentTime);

      // 前回の処理から動画の尺が1秒進んだか判定
      if (currentTimeFloor > videoTimestamp) {
        videoTimestamp = currentTimeFloor;

        // 動画が読み込まれている場合
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA 以上
          const img = await videoToImageAsync(video); // 実験結果出力に含める
          const detectedGroups = await getGroups(img!);
          setMediaFrame(img);
          addExtractedFrameAsPng(await imageToBlobAsync(img!, 'image/png') as Blob, videoTimestamp);
          setGroups(detectedGroups);
          addObjectAsJson(detectedGroups, videoTimestamp);
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [mediaType, mediaSrc]);

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
            onCanvasGenerated={(canvas) => {
              (async () => {
                await addAnnotatedImageAsPng(
                  await canvasToBlob(canvas, 'image/png') as Blob,
                  mediaType === 'image' ? imageTimestamp : videoTimestamp
                );
                // 画像のプッシュ完了をダウンロード処理に通知
                if (resolveCanvasRef.current) {
                  resolveCanvasRef.current();
                  resolveCanvasRef.current = null;
                }
              })();
            }}
            className="w-2/3 h-full object-contain"
          />
          
          {/* flex-col を追加して中の要素を強制的に改行 */}
          {/* navの横幅を画面の半分にし、境界が中央にくるように調整 */}
          <nav className="flex flex-col w-1/3 items-center justify-center">
            
            {/* グループ数表示 */}
            <span>検出されたグループ数: {groups.length}</span>

            {/* 実験結果のダウンロード */}
            <button
              disabled={isDownloading}
              onClick={async () => {
                setIsDownloading(true);
                try {
                  // 最新フレームの描画完了（非同期）を待機するPromiseを作成
                  await new Promise<void>((resolve) => {
                    resolveCanvasRef.current = resolve;
                    // 万が一Canvasが再描画されない場合の安全対策（1秒でタイムアウトしてDLを実行）
                    setTimeout(resolve, 1000);
                  });
                  await downloadZip('experimental_results.zip');
                } finally {
                  setIsDownloading(false);
                }
              }}
              className="bg-blue-500 hover:bg-blue-700 active:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              {isDownloading ? 'ダウンロード中...' : '実験結果をダウンロード'}
            </button>

          </nav>

        </>
      )}
    </main>
  );
}

export default App;
