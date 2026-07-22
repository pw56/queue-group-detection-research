import React, { useEffect, useRef } from 'react';
import { Detection } from '@mediapipe/tasks-vision';

export const MediaCanvas = ({
  mediaSource,
  detections,
  className
}: {
  mediaSource: CanvasImageSource | null;
  detections: Detection[];
  className: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!mediaSource) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. メディアの実際のサイズを取得してCanvasをリサイズ
    // (Image, Video, Canvas それぞれの幅・高さのプロパティに対応)
    const width = (mediaSource as HTMLVideoElement).videoWidth || (mediaSource as HTMLImageElement).naturalWidth || (mediaSource as HTMLCanvasElement).width || 0;
    const height = (mediaSource as HTMLVideoElement).videoHeight || (mediaSource as HTMLImageElement).naturalHeight || (mediaSource as HTMLCanvasElement).height || 0;

    if (width === 0 || height === 0) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 2. メディアを直接描画
    ctx.drawImage(mediaSource, 0, 0);

    // 3. 赤色のbboxを合成
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    detections.forEach((det) => {
      if (det.boundingBox) {
        const { originX, originY, width: w, height: h } = det.boundingBox;
        ctx.strokeRect(originX, originY, w, h);
      }
    });
  }, [mediaSource, detections]);

  return <canvas ref={canvasRef} className={className} />;
};
