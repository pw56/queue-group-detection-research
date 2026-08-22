import { Detection } from '@mediapipe/tasks-vision';

// BoundingBox型から 'angle' プロパティだけを除外した配列型にする
type Group = Omit<Detection['boundingBox'], 'angle'>[];
type Groups = Group[];

type GroupDetectionImageSource = HTMLImageElement;

export type { Group, Groups, GroupDetectionImageSource };
export { type Detection, type BoundingBox } from '@mediapipe/tasks-vision';

// 追加の内部型定義
export interface BoundingBoxRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface WorkerInitMessage {
  type: 'INIT';
  width: number;
  height: number;
}

export interface WorkerProcessMessage {
  type: 'PROCESS';
  id: number;
  imageBitmap: ImageBitmap;
  rect: BoundingBoxRect;
}

export type WorkerIncomingMessage = WorkerInitMessage | WorkerProcessMessage;

export interface WorkerResultMessage {
  id: number;
  isPerson: boolean;
  rect: BoundingBoxRect;
  error?: string;
}
