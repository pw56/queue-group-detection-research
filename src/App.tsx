import React, { useEffect, useRef, useState } from 'react';
import './global.css';
import Webcam from 'react-webcam';
import PairCountDisplay from './components/PairCountDisplay';
import countPairs from './utils/countPairs';

const App = () => {
  const [pairs, setPairs] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>("カメラを起動中...");
  const webcamRef = useRef<Webcam | null>(null);

  // カメラ設定
  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: "user"
  };

  // カメラが起動したときのイベントハンドラ
  const handleUserMedia = () => {
    setStatusText("AIモデルを準備中...");
  };

  // カメラ起動エラー時のイベントハンドラ
  const handleUserMediaError = (error: string | DOMException) => {
    console.error("Webcam error:", error);
    setStatusText("カメラエラー");
  };

  // 1秒ごとにスクショを撮影してグループ数検出メソッドに流すタイマー
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!webcamRef.current) return;

      // 1. react-webcamからBase64形式のスクショを取得
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) return;

      setStatusText(""); // 最初の一枚が撮れたらステータスを消す

      // 2. Base64文字列をMediaPipeが処理できる Image 要素に変換
      const img = new Image();
      img.src = imageSrc;
      img.onload = async () => {
        // 3. 検出メソッドを実行（countPairsの引数は HTMLImageElement で動きます）
        const pairCount = await countPairs(img);
        setPairs(pairCount);
      };
    }, 1000); // 1秒ごと

    return () => clearInterval(timer);
  }, []);

  return (
    /* 元のCSS設定（透明背景、中央配置、スクロールバー非表示、フォント） */
    <main className="flex h-screen w-screen items-center justify-center bg-transparent overflow-hidden font-sans">
      
      {/* 状態テキスト */}
      {statusText && (
        <p className="absolute top-10 text-gray-400 text-sm animate-pulse">{statusText}</p>
      )}

      {/* グループ数表示コンポーネント */}
      <PairCountDisplay count={pairs} />

      {/* 
        react-webcam コンポーネント 
        - hidden クラス（display: none）を適用すると video タグの影響でスクショが撮れない
      */}
      <Webcam
        audio={false}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        videoConstraints={videoConstraints}
        onUserMedia={handleUserMedia}
        onUserMediaError={handleUserMediaError}
        className="absolute top-0 left-0 opacity-1 pointer-events-none"
      />
    </main>
  );
}

export default App;
