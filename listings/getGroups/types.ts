import { Detection } from '@mediapipe/tasks-vision';

type Group = Detection[];
type Groups = Group[];

export type { Group, Groups };
export { type Detection, type BoundingBox } from '@mediapipe/tasks-vision';