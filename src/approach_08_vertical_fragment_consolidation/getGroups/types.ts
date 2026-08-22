import { Detection } from '@mediapipe/tasks-vision';

// BoundingBox型から 'angle' プロパティだけを除外した配列型にする
type Group = Omit<Detection['boundingBox'], 'angle'>[];
type Groups = Group[];

type GroupDetectionImageSource = HTMLImageElement;

export type { Group, Groups, GroupDetectionImageSource };
export type { Detection, BoundingBox } from '@mediapipe/tasks-vision';

// グループ検出内部で使用される型定義

// バウンディングボックス
export interface BoundingBoxRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

// ワーカー向け
interface WorkerInitMessage {
  type: 'INIT';
  width: number;
  height: number;
}

interface WorkerProcessMessage {
  type: 'PROCESS';
  id: number;
  imageBitmap: ImageBitmap;
  rect: BoundingBoxRect;
}

type WorkerIncomingMessage = WorkerInitMessage | WorkerProcessMessage;

interface WorkerResultMessage {
  id: number;
  isPerson: boolean;
  rect: BoundingBoxRect;
  refinedRect?: BoundingBoxRect;
  error?: string;
}

export type { WorkerInitMessage, WorkerIncomingMessage, WorkerResultMessage };
