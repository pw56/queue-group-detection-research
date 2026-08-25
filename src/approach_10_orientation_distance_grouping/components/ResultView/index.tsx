import { useEffect, useRef } from 'react';
import { Groups } from '../../getGroups';
import { createParentBoundingBox } from './createParentBoundingBox';
import { CroppedBoundingBox } from '../../ImageCropper/types';

export const ResultView = ({
  mediaSource,
  groups,
  croppedBoundingBox,
  onCanvasGenerated,
  className
}: {
  mediaSource: HTMLImageElement | null;
  groups: Groups;
  croppedBoundingBox?: CroppedBoundingBox;
  onCanvasGenerated?: (canvas: HTMLCanvasElement) => void;
  className?: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!mediaSource) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. メディアの実際のサイズを取得してCanvasをリサイズ
    // (Image, Video, Canvas それぞれの幅・高さのプロパティに対応)
    const width = mediaSource.naturalWidth || 0;
    const height = mediaSource.naturalHeight || 0;

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
      if (group.every((person) => person)) {
        const groupBbox = createParentBoundingBox(group)!; // if文合格したなら大丈夫
        const { originX, originY, width: w, height: h } = groupBbox;
        
        // croppedBoundingBox が存在する場合にオフセット座標を計算
        const offsetX = croppedBoundingBox ? croppedBoundingBox.x : 0;
        const offsetY = croppedBoundingBox ? croppedBoundingBox.y : 0;
        const lineOffset = ctx.lineWidth;
        ctx.strokeStyle = 'red';
        ctx.strokeRect(
          originX + offsetX - lineOffset,
          originY + offsetY - lineOffset,
          w + lineOffset * 2,
          h + lineOffset * 2
        );
      }

      // グループに含まれる人物のbboxを描画
      group.forEach((person) => {
        if (person) {
          const { originX, originY, width: w, height: h } = person.boundingBox!;
          // croppedBoundingBox が存在する場合にオフセット座標を計算
          const offsetX = croppedBoundingBox ? croppedBoundingBox.x : 0;
          const offsetY = croppedBoundingBox ? croppedBoundingBox.y : 0;
          ctx.strokeStyle = 'green';
          ctx.strokeRect(originX + offsetX, originY + offsetY, w, h);
        }
      });

    });

    // 受け取りハンドラが指定されていたら、合成された画像のキャンバスを転送
    if(onCanvasGenerated) onCanvasGenerated(canvas);

  }, [mediaSource, groups, croppedBoundingBox]);

  return <canvas ref={canvasRef} className={className} />;
};
