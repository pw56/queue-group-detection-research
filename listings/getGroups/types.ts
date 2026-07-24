import { Detection } from '@mediapipe/tasks-vision';

type Group = Detection[];
type Groups = Group[];

type GroupDetectionImageSource =
  HTMLImageElement  |
  HTMLVideoElement  |
  HTMLCanvasElement |
  OffscreenCanvas   |
  VideoFrame;

export type { Group, Groups, GroupDetectionImageSource };
export { type Detection, type BoundingBox } from '@mediapipe/tasks-vision';