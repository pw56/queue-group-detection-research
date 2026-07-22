import { useEffect, useRef } from 'react';
import { Groups } from '../getGroups';
import { createParentBoundingBox } from './createParentBoundingBox';

export const MediaCanvas = ({
  mediaSource,
  groups,
  className
}: {
  mediaSource: CanvasImageSource | null;
  groups: Groups;
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

    // 3. bboxを合成
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    groups.forEach((group) => {

      // グループのbboxを描画
      if (group.every((person) => person.boundingBox)) {
        const groupBbox = createParentBoundingBox(group)!; // if文合格したなら大丈夫
        const { originX, originY, width: w, height: h } = groupBbox;
        const offsetX = ctx.lineWidth,
              offsetY = ctx.lineWidth;
        ctx.strokeStyle = 'red';
        ctx.strokeRect(
          originX - offsetX,
          originY - offsetY,
          w + offsetX * 2,
          h + offsetY * 2
        );
      }

      // グループに含まれる人物のbboxを描画
      group.forEach((person) => {
        if (person.boundingBox) {
          const { originX, originY, width: w, height: h } = person.boundingBox;
          ctx.strokeStyle = 'green';
          ctx.strokeRect(originX, originY, w, h);
        }
      });

    });
  }, [mediaSource, groups]);

  return <canvas ref={canvasRef} className={className} />;
};
