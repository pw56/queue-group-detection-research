import { Detection } from '@mediapipe/tasks-vision';

// BoundingBox型から 'angle' プロパティだけを除外した配列型にする
type Group = Omit<Detection['boundingBox'], 'angle'>[];
type Groups = Group[];

type GroupDetectionImageSource =
  HTMLImageElement  |
  HTMLVideoElement  |
  HTMLCanvasElement |
  OffscreenCanvas   |
  VideoFrame;

export type { Group, Groups, GroupDetectionImageSource };
export { type Detection, type BoundingBox } from '@mediapipe/tasks-vision';