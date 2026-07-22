import { Detection } from '@mediapipe/tasks-vision';

type Group = Detection[];
type Groups = Group[];

export type { Group, Groups };
export { Detection, BoundingBox } from '@mediapipe/tasks-vision';