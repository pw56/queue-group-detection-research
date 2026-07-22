import React, { useEffect, useRef } from 'react';
import { Detection } from '@mediapipe/tasks-vision';

interface MediaCanvasProps {
  mediaSrc: string;
  mediaType: 'image' | 'video';
  detections: Detection[];
}

export const MediaCanvas: React.FC<MediaCanvasProps> = ({ mediaSrc, mediaType, detections }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 共通の描画処理（DRY）
  const draw = (mediaElement: HTMLImageElement | HTMLVideoElement, width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. メディアを描画
    ctx.drawImage(mediaElement, 0, 0);

    // 2. 赤色のbboxを合成
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    detections.forEach((det) => {
      if (det.boundingBox) {
        const { originX, originY, width: w, height: h } = det.boundingBox;
        ctx.strokeRect(originX, originY, w, h);
      }
    });
  };

  // 検出結果(detections)やメディアの変更を検知して再描画
  useEffect(() => {
    if (mediaType === 'image' && imageRef.current) {
      const img = imageRef.current;
      if (img.complete) {
        draw(img, img.naturalWidth, img.naturalHeight);
      } else {
        img.onload = () => draw(img, img.naturalWidth, img.naturalHeight);
      }
    }
  }, [detections, mediaSrc, mediaType]);

  // 動画の場合は常時（再生中）描画を更新するためのループ
  useEffect(() => {
    if (mediaType !== 'video' || !videoRef.current) return;

    let animationFrameId: number;
    const video = videoRef.current;

    const renderLoop = () => {
      if (video.readyState >= 2) {
        draw(video, video.videoWidth, video.videoHeight);
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [detections, mediaSrc, mediaType]);

  return (
    <>
      {mediaType === 'image' && (
        <img ref={imageRef} src={mediaSrc} alt="source" className="hidden" />
      )}
      {mediaType === 'video' && (
        <video ref={videoRef} src={mediaSrc} muted autoPlay playsInline loop className="hidden" />
      )}
      {/* 元のメディアと同じスタイルを適用 */}
      <canvas ref={canvasRef} className="w-2/3 h-full object-contain" />
    </>
  );
};
