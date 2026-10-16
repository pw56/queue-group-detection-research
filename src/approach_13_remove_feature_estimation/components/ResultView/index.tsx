import { useEffect, useRef } from 'react';
import { Groups } from '../../getGroups';
import { createParentBoundingBox } from './createParentBoundingBox';
import { CroppedBoundingBox } from '../../ImageCropper/types';

// ポーズ検出の一般的な骨格接続ペア（MoveNet/COCOフォーマットのインデックスペア）
const POSE_CONNECTIONS: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4],     // 顔 (鼻-目-耳)
  [5, 6],                             // 両肩
  [5, 7], [7, 9],                     // 左腕 (肩-肘-手首)
  [6, 8], [8, 10],                    // 右腕 (肩-肘-手首)
  [5, 11], [6, 12],                   // 胴体 (肩-腰)
  [11, 12],                           // 腰
  [11, 13], [13, 15],                 // 左脚 (腰-膝-足首)
  [12, 14], [14, 16]                  // 右脚 (腰-膝-足首)
];

const MIN_KEYPOINT_ALPHA = 0.1;
const MAX_ID_LENGTH = 8;

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
          const boxColor = 'green';
          ctx.strokeStyle = boxColor;
          ctx.strokeRect(originX + offsetX, originY + offsetY, w, h);

          // 人物IDの描画（バウンディングボックスの内側左上）
          if (person.id !== undefined && person.id !== null) {
            const rawId = String(person.id);
            const displayId = rawId.length > MAX_ID_LENGTH
              ? `${rawId.slice(0, MAX_ID_LENGTH)}...`
              : rawId;

            ctx.save();
            ctx.font = '12px sans-serif';
            ctx.textBaseline = 'top';

            const textMetrics = ctx.measureText(displayId);
            const paddingX = 4;
            const paddingY = 2;
            const bgWidth = textMetrics.width + paddingX * 2;
            const bgHeight = 12 + paddingY * 2;

            const labelX = originX + offsetX;
            const labelY = originY + offsetY;

            // IDラベルの背景（バウンディングボックス枠線色と同じ）
            ctx.fillStyle = boxColor;
            ctx.fillRect(labelX, labelY, bgWidth, bgHeight);

            // 文字描画（縁描画が先で、後に塗りつぶし）
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.fillStyle = 'white';
            ctx.strokeText(displayId, labelX + paddingX, labelY + paddingY);
            ctx.fillText(displayId, labelX + paddingX, labelY + paddingY);

            ctx.restore();
          }

          // 人物ごとにポーズ検出の骨格を描画
          if (person.keypoints) {
            const keypoints = person.keypoints;

            // 骨格の線を描画
            POSE_CONNECTIONS.forEach(([i, j]) => {
              const kp1 = keypoints[i];
              const kp2 = keypoints[j];

              if (kp1 && kp2) {
                const score1 = kp1.score ?? 1;
                const score2 = kp2.score ?? 1;

                // キーポイントを結ぶ線を描画
                const avgScore = (score1 + score2) / 2;
                ctx.beginPath();
                ctx.moveTo(kp1.x + offsetX, kp1.y + offsetY);
                ctx.lineTo(kp2.x + offsetX, kp2.y + offsetY);
                ctx.strokeStyle = `rgba(0, 255, 255, ${avgScore})`;
                ctx.lineWidth = 2;
                ctx.stroke();
              }
            });

            // 骨格の点（キーポイント）を描画
            keypoints.forEach((kp) => {
              const score = kp.score ?? 1;
              const kpX = kp.x + offsetX;
              const kpY = kp.y + offsetY;

              ctx.save();
              ctx.globalAlpha = Math.max(score, MIN_KEYPOINT_ALPHA); // 信頼度を透明度に設定

              // 黒の輪郭
              ctx.beginPath();
              ctx.arc(kpX, kpY, 4, 0, 2 * Math.PI);
              ctx.fillStyle = 'black';
              ctx.fill();

              // 中心の白
              ctx.beginPath();
              ctx.arc(kpX, kpY, 2, 0, 2 * Math.PI);
              ctx.fillStyle = 'white';
              ctx.fill();

              ctx.restore();
            });
          }
        }
      });

    });

    // 受け取りハンドラが指定されていたら、合成された画像のキャンバスを転送
    if(onCanvasGenerated) onCanvasGenerated(canvas);

  }, [mediaSource, groups, croppedBoundingBox]);

  return <canvas ref={canvasRef} className={className} />;
};
