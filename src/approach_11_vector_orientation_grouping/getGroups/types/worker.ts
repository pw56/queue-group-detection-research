import { Person, BoundingBoxRect, Keypoint2D } from "./person";

interface WorkerInitMessage {
  type: 'INIT';
  width: number;
  height: number;
}

interface WorkerPoseMessage {
  type: 'PROCESS_POSE';
  id: number;
  imageBitmap: ImageBitmap;
  rect: BoundingBoxRect;
}

interface WorkerPeopleMessage {
  type: 'PROCESS_PEOPLE';
  id: number;
  imageBitmap: ImageBitmap;
  imgWidth: number;
  imgHeight: number;
}

type WorkerIncomingMessage = WorkerInitMessage | WorkerPoseMessage | WorkerPeopleMessage;

interface WorkerPoseResultMessage {
  type: 'POSE_RESULT';
  id: number;
  keypoints: Keypoint2D[];
  error?: string;
}

interface WorkerPeopleResultMessage {
  type: 'PEOPLE_RESULT';
  id: number;
  people: Person[];
  error?: string;
}

type WorkerResultMessage = WorkerPoseResultMessage | WorkerPeopleResultMessage;

export type {
  WorkerInitMessage,
  WorkerIncomingMessage,
  WorkerPoseResultMessage,
  WorkerPeopleResultMessage,
  WorkerResultMessage
};
