// バウンディングボックス
export interface BoundingBoxRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

// 2Dポイント（骨格の座標）
export interface Keypoint2D {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

// 向きのベクトル表現
export interface DirectionVector {
  x: number;
  y: number;
  z?: number;
}

// 人物情報型（全てのプロパティが任意）
export interface Person {
  boundingBox?: BoundingBoxRect;
  keypoints?: Keypoint2D[];
  direction?: DirectionVector;
}

// Group型およびGroups型をPersonベースに変更
type Group = Person[];
type Groups = Group[];

type GroupDetectionImageSource = HTMLImageElement;

export type { Group, Groups, GroupDetectionImageSource };

// ワーカー向け
interface WorkerInitMessage {
  type: 'INIT';
  width: number;
  height: number;
}

interface WorkerCandidateMessage {
  type: 'PROCESS_CANDIDATE';
  id: number;
  imageBitmap: ImageBitmap;
  rect: BoundingBoxRect;
}

interface WorkerPoseMessage {
  type: 'PROCESS_POSE';
  id: number;
  imageBitmap: ImageBitmap;
  rect: BoundingBoxRect;
}

type WorkerIncomingMessage = WorkerInitMessage | WorkerCandidateMessage | WorkerPoseMessage;

interface WorkerCandidateResultMessage {
  type: 'CANDIDATE_RESULT';
  id: number;
  isPerson: boolean;
  rect: BoundingBoxRect;
  refinedRect?: BoundingBoxRect;
  error?: string;
}

interface WorkerPoseResultMessage {
  type: 'POSE_RESULT';
  id: number;
  keypoints: Keypoint2D[];
  error?: string;
}

type WorkerResultMessage = WorkerCandidateResultMessage | WorkerPoseResultMessage;

export type {
  WorkerInitMessage,
  WorkerCandidateMessage,
  WorkerPoseMessage,
  WorkerIncomingMessage,
  WorkerCandidateResultMessage,
  WorkerPoseResultMessage,
  WorkerResultMessage
};
