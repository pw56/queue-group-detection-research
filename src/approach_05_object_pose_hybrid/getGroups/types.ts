import { Detection } from '@mediapipe/tasks-vision';

// BoundingBox型から 'angle' プロパティだけを除外した配列型にする
type Group = Omit<Detection['boundingBox'], 'angle'>[];
type Groups = Group[];

type GroupDetectionImageSource = HTMLImageElement;

export type { Group, Groups, GroupDetectionImageSource };
export { type Detection, type BoundingBox } from '@mediapipe/tasks-vision';

export interface CropJob {
  imageBitmap: ImageBitmap;
  boundingBox: Omit<Detection['boundingBox'], 'angle'>;
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
  boundingBox: Omit<Detection['boundingBox'], 'angle'>;
}

export type WorkerInMessage = WorkerInitMessage | WorkerProcessMessage;

export interface WorkerResultMessage {
  id: number;
  isValidPerson: boolean;
  boundingBox: Omit<Detection['boundingBox'], 'angle'>;
  error?: string;
}
