import { Detection } from '@mediapipe/tasks-vision';
import { BoundingBoxRect } from '../types';

// 領域の重なり具合（IoU / Intersection over Union）を算出する関数
function calculateIoU(boxA: BoundingBoxRect, boxB: BoundingBoxRect): number {
  const x1 = Math.max(boxA.originX, boxB.originX);
  const y1 = Math.max(boxA.originY, boxB.originY);
  const x2 = Math.min(boxA.originX + boxA.width, boxB.originX + boxB.width);
  const y2 = Math.min(boxA.originY + boxA.height, boxB.originY + boxB.height);

  const intersectionWidth = Math.max(0, x2 - x1);
  const intersectionHeight = Math.max(0, y2 - y1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  if (intersectionArea === 0) return 0;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;

  // 小さい方の領域に対する被りの割合（包含判定用）
  const minArea = Math.min(areaA, areaB);
  const overlapRatio = intersectionArea / minArea;

  const unionArea = areaA + areaB - intersectionArea;
  const iou = intersectionArea / unionArea;

  return Math.max(iou, overlapRatio);
}

// 2つのバウンディングボックスのうち面積が大きい方の判定
function getLargerBox(boxA: BoundingBoxRect, boxB: BoundingBoxRect): BoundingBoxRect {
  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  return areaA >= areaB ? boxA : boxB;
}

// X軸（横方向）の重なり率を算出する関数（Intersection / Union および Intersection / MinWidth の最大値）
function calculateHorizontalOverlapRatio(boxA: BoundingBoxRect, boxB: BoundingBoxRect): number {
  const x1 = Math.max(boxA.originX, boxB.originX);
  const x2 = Math.min(boxA.originX + boxA.width, boxB.originX + boxB.width);
  const intersectionWidth = Math.max(0, x2 - x1);

  if (intersectionWidth === 0) return 0;

  const minWidth = Math.min(boxA.width, boxB.width);
  const unionWidth = Math.max(boxA.originX + boxA.width, boxB.originX + boxB.width) - Math.min(boxA.originX, boxB.originX);

  const overlapRatio = intersectionWidth / minWidth;
  const iouX = intersectionWidth / unionWidth;

  return Math.max(iouX, overlapRatio);
}

// 2つの Detection オブジェクトのバウンディングボックスを統合し、オブジェクト再生成を抑える関数
function mergeDetectionInPlace(target: Detection, source: Detection): void {
  const boxA = target.boundingBox!;
  const boxB = source.boundingBox!;

  const originX = Math.min(boxA.originX, boxB.originX);
  const originY = Math.min(boxA.originY, boxB.originY);
  const maxX = Math.max(boxA.originX + boxA.width, boxB.originX + boxB.width);
  const maxY = Math.max(boxA.originY + boxA.height, boxB.originY + boxB.height);

  boxA.originX = originX;
  boxA.originY = originY;
  boxA.width = maxX - originX;
  boxA.height = maxY - originY;
}

// 重複除去の閾値（同じ人物で重なり合っている場合は「大きい方」を残す）
const OVERLAP_THRESHOLD = 0.4;
// 横方向（X軸）の重なり判定用閾値
const HORIZONTAL_OVERLAP_THRESHOLD = 0.5;

export function deduplicateDetections(
  filteredDetectionsBuffer: Detection[],
  evaluatedDetectionsBuffer: Detection[],
  sortedDetectionsBuffer: Detection[],
  finalDetectionsBuffer: Detection[]
): void {
  for (let i = 0; i < filteredDetectionsBuffer.length; i++) {
    const current = filteredDetectionsBuffer[i];
    if (!current || !current.boundingBox) continue;

    let currentBox: BoundingBoxRect = {
      originX: current.boundingBox.originX,
      originY: current.boundingBox.originY,
      width: current.boundingBox.width,
      height: current.boundingBox.height
    };

    let isSuppressed = false;

    for (let j = 0; j < evaluatedDetectionsBuffer.length; j++) {
      const existing = evaluatedDetectionsBuffer[j];
      if (!existing || !existing.boundingBox) continue;

      const existingBox: BoundingBoxRect = {
        originX: existing.boundingBox.originX,
        originY: existing.boundingBox.originY,
        width: existing.boundingBox.width,
        height: existing.boundingBox.height
      };

      const overlap = calculateIoU(currentBox, existingBox);

      if (overlap > OVERLAP_THRESHOLD) {
        // 被り率が高い同一判定人物の場合、より大きいバウンディングボックスを残す
        const larger = getLargerBox(currentBox, existingBox);
        if (larger === currentBox) {
          // 現在の候補の方が大きいため、既存のものを入れ替える
          evaluatedDetectionsBuffer[j] = current;
        }
        isSuppressed = true;
        break;
      }
    }

    if (!isSuppressed) {
      evaluatedDetectionsBuffer.push(current);
    }
  }

  // --- 縦方向の乱立対策（X軸方向の重なり判定のみで結合） ---
  // 1. 横方向（originX）座標の昇順で並び替える
  for (let i = 0; i < evaluatedDetectionsBuffer.length; i++) {
    sortedDetectionsBuffer.push(evaluatedDetectionsBuffer[i]);
  }
  sortedDetectionsBuffer.sort((a, b) => a.boundingBox!.originX - b.boundingBox!.originX);

  // 2. 横方向（X軸）の重なりが閾値（50%以上）を満たしている場合に結合する
  for (let i = 0; i < sortedDetectionsBuffer.length; i++) {
    let current = sortedDetectionsBuffer[i];
    if (!current || !current.boundingBox) continue;

    let isMerged = false;

    for (let j = 0; j < finalDetectionsBuffer.length; j++) {
      const existing = finalDetectionsBuffer[j];
      if (!existing || !existing.boundingBox) continue;

      const hOverlap = calculateHorizontalOverlapRatio(current.boundingBox, existing.boundingBox);

      if (hOverlap >= HORIZONTAL_OVERLAP_THRESHOLD) {
        // X軸の重なりが基準を超えている場合、既存オブジェクトに領域を上書き統合
        mergeDetectionInPlace(existing, current);
        isMerged = true;
        break;
      }
    }

    if (!isMerged) {
      finalDetectionsBuffer.push(current);
    }
  }
}
