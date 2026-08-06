import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Line } from 'react-konva';
import Konva from 'konva';
import { ImageCropperProps, ImageCropperRef, ImageLayout } from './types';
import { cropImage } from './cropUtils';

export type { ImageCropperProps, ImageCropperRef } from './types';

export const ImageCropper = forwardRef<ImageCropperRef, ImageCropperProps>(
  ({ imageElement, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lineRef = useRef<Konva.Line>(null); // パフォーマンス対策：Lineノードを直接参照
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    // アスペクト比を維持した画像の配置情報
    const [imageLayout, setImageLayout] = useState<ImageLayout>({ width: 0, height: 0, x: 0, y: 0 });
    
    // パフォーマンス対策：描画中の全座標をRefで保持（再レンダリングをゼロにする）
    const pointsRef = useRef<number[]>([]);
    const isDrawing = useRef(false);

    // 【安全対策】画像要素の読み込み完了を待ってからサイズを計算する関数
    useEffect(() => {
      const updateDimensions = () => {
        if (!containerRef.current) return;
        const { width, height } = containerRef.current.getBoundingClientRect();
        if (width === 0 || height === 0) return;

        setDimensions({ width, height });

        // 元画像の解像度
        const origW = imageElement.naturalWidth;
        const origH = imageElement.naturalHeight;

        // アスペクト比を維持する縮小率の計算 (object-fit: contain の再現)
        const scale = Math.min(width / origW, height / origH);
        const imageW = origW * scale;
        const imageH = origH * scale;

        // 中央配置のためのオフセット座標
        const offsetX = (width - imageW) / 2;
        const offsetY = (height - imageH) / 2;

        setImageLayout({
          width: imageW,
          height: imageH,
          x: offsetX,
          y: offsetY,
        });
      };

      if (imageElement.complete) {
        updateDimensions();
      } else {
        imageElement.onload = updateDimensions;
      }
    }, [className, imageElement]);

    // 【画像変更時の仕様】Propsの画像が変わっても、描いた線はリセットせず画面に残す
    useEffect(() => {
      if (lineRef.current && pointsRef.current.length > 0) {
        lineRef.current.points(pointsRef.current);
      }
    }, [imageElement, imageLayout]); // 正確な画像レイアウトの変更を監視

    // 描き始め（マウス / タッチ共通）
    const handleStart = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // スマホ対策：画面スクロールやピンチズームの暴発を防ぐ
      if (e.evt.cancelable) {
        e.evt.preventDefault();
      }

      isDrawing.current = true;
      const stage = e.target.getStage();
      if (!stage) return;
      
      const pos = stage.getPointerPosition();
      if (!pos) return;

      // 仕様：新しい手書き入力があったら、過去の範囲を上書きクリア
      pointsRef.current = [pos.x, pos.y];

      if (lineRef.current) {
        lineRef.current.points(pointsRef.current);
      }
    };

    // 描画中（高頻度で呼ばれるが、Stateを使わないため超軽量）
    const handleMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isDrawing.current) return;
      
      // スマホ対策：描画中の画面スクロールを完全にブロック
      if (e.evt.cancelable) {
        e.evt.preventDefault();
      }

      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      pointsRef.current.push(pos.x, pos.y);

      // Lineノードの座標リストを直接更新して再描画（Reactの再レンダリングは発生しない）
      if (lineRef.current) {
        lineRef.current.points(pointsRef.current);
        lineRef.current.getLayer()?.batchDraw();
      }
    };

    // 描き終わり
    const handleEnd = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      
      const currentPoints = pointsRef.current;
      if (currentPoints.length < 4) return;

      // パスを閉じるため、始点の座標[0],[1]を終点として結合
      currentPoints.push(currentPoints[0], currentPoints[1]);

      if (lineRef.current) {
        lineRef.current.points(currentPoints);
        lineRef.current.getLayer()?.batchDraw();
      }
    };

    // 親コンポーネントへ公開するメソッド（ロジックはピュアCanvasで高速処理）
    useImperativeHandle(ref, () => ({
      getClippedImage: (): Promise<HTMLImageElement> => {
        return cropImage(imageElement, pointsRef.current, imageLayout);
      }
    }));

    return (
      <div 
        ref={containerRef} 
        className={className} 
        style={{ 
          position: 'relative', 
          overflow: 'hidden',
          touchAction: 'none' // CSSレイヤーでもスマホのデフォルトスクロール挙動を抑制
        }}
      >
        {dimensions.width > 0 && dimensions.height > 0 && (
          <Stage
            width={dimensions.width}
            height={dimensions.height}
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          >
            <Layer>
              {/* 背景画像（アスペクト比を維持し、中央に配置。プレビューなし） */}
              <KonvaImage
                image={imageElement}
                width={imageLayout.width}
                height={imageLayout.height}
                x={imageLayout.x}
                y={imageLayout.y}
              />
              {/* 手書き線（Ref制御。初期化時は空の配列） */}
              <Line
                ref={lineRef}
                points={[]}
                stroke="#df4b26"
                strokeWidth={3}
                tension={0.1} // パフォーマンス向上のためテンションを少し浅めに調整
                lineCap="round"
                lineJoin="round"
              />
            </Layer>
          </Stage>
        )}
      </div>
    );
  }
);

ImageCropper.displayName = 'ImageCropper';
