import { Person } from '../../types';
import { KalmanFilterForPeople } from './KalmanFilterForPeople';
import { PersonBodyFeatures, extractFeatures, compareHSV } from './extractFeatures';
import { getFps } from './measureFps';

const QUEUE_STATIONARY_TIME_THRESHOLD_MS = 2000;
const MAX_MISSING_TIME_MS = 1500;

export class TrackedPerson {
  #id: string;
  #kalmanFilter: KalmanFilterForPeople | null = null;
  #latestPerson?: Person;
  #features?: PersonBodyFeatures;
  #lastSeenTimestamp: number;
  #firstSeenTimestamp: number;
  #missingDurationMs = 0;
  #isInQueue = false;

  constructor(initialPerson: Person, timestamp: number) {
    this.#id = crypto.randomUUID();
    this.#lastSeenTimestamp = timestamp;
    this.#firstSeenTimestamp = timestamp;

    if (initialPerson.boundingBox) {
      const centerX = initialPerson.boundingBox.originX + initialPerson.boundingBox.width / 2;
      const centerY = initialPerson.boundingBox.originY + initialPerson.boundingBox.height / 2;
      this.#kalmanFilter = new KalmanFilterForPeople(centerX, centerY);
    }

    this.#updateState(initialPerson, timestamp);
  }

  get id(): string {
    return this.#id;
  }

  get latestPerson(): Person | undefined {
    return this.#latestPerson;
  }

  get features(): PersonBodyFeatures | undefined {
    return this.#features;
  }

  isQueueMember(): boolean {
    return this.#isInQueue;
  }

  shouldBeRemoved(): boolean {
    return this.#missingDurationMs > MAX_MISSING_TIME_MS;
  }

  getPersonWithId(): Person | undefined {
    if (!this.#latestPerson) return undefined;
    return {
      ...this.#latestPerson,
      id: this.#id,
    };
  }

  async updateFrame(
    imageSource: CanvasImageSource,
    matchedPerson: Person | undefined,
    timestamp: number,
    imgWidth: number,
    imgHeight: number
  ): Promise<void> {
    const dt = (timestamp - this.#lastSeenTimestamp) / 1000;

    if (this.#kalmanFilter && dt > 0) {
      this.#kalmanFilter.predict(dt);
    }

    if (matchedPerson) {
      this.#missingDurationMs = 0;
      this.#lastSeenTimestamp = timestamp;
      this.#latestPerson = matchedPerson;

      if (matchedPerson.boundingBox && this.#kalmanFilter) {
        const cx = matchedPerson.boundingBox.originX + matchedPerson.boundingBox.width / 2;
        const cy = matchedPerson.boundingBox.originY + matchedPerson.boundingBox.height / 2;
        this.#kalmanFilter.update(cx, cy);
      }

      const newFeatures = await extractFeatures(imageSource, matchedPerson, imgWidth, imgHeight);
      this.#mergeFeatures(newFeatures);
    } else {
      this.#missingDurationMs += (timestamp - this.#lastSeenTimestamp);
      this.#latestPerson = undefined;
    }

    this.#evaluateQueueStatus(timestamp);
  }

  #mergeFeatures(newFeatures: PersonBodyFeatures): void {
    if (!this.#features) {
      this.#features = newFeatures;
      return;
    }

    if (newFeatures.leftShoulder) this.#features.leftShoulder = newFeatures.leftShoulder;
    if (newFeatures.rightShoulder) this.#features.rightShoulder = newFeatures.rightShoulder;
    if (newFeatures.leftHip) this.#features.leftHip = newFeatures.leftHip;
    if (newFeatures.rightHip) this.#features.rightHip = newFeatures.rightHip;
    if (newFeatures.faceForward) this.#features.faceForward = newFeatures.faceForward;
    if (newFeatures.faceBackward) this.#features.faceBackward = newFeatures.faceBackward;
  }

  #evaluateQueueStatus(timestamp: number): void {
    const fps = getFps();
    const durationInViewMs = timestamp - this.#firstSeenTimestamp;

    if (durationInViewMs < QUEUE_STATIONARY_TIME_THRESHOLD_MS) {
      this.#isInQueue = false;
      return;
    }

    if (this.#kalmanFilter) {
      const state = this.#kalmanFilter.state;
      const speed = Math.hypot(state.vx, state.vy);

      const bboxSize = this.#latestPerson?.boundingBox
        ? Math.min(this.#latestPerson.boundingBox.width, this.#latestPerson.boundingBox.height)
        : 50;

      const maxAllowedSpeed = (bboxSize * 0.1) * (fps / 30);

      this.#isInQueue = speed < maxAllowedSpeed;
    } else {
      this.#isInQueue = true;
    }
  }

  calculateColorMatchScore(features: PersonBodyFeatures): number {
    if (!this.#features) return 0.5;

    const scores: number[] = [];
    if (features.leftShoulder && this.#features.leftShoulder) {
      scores.push(compareHSV(features.leftShoulder, this.#features.leftShoulder));
    }
    if (features.rightShoulder && this.#features.rightShoulder) {
      scores.push(compareHSV(features.rightShoulder, this.#features.rightShoulder));
    }
    if (features.leftHip && this.#features.leftHip) {
      scores.push(compareHSV(features.leftHip, this.#features.leftHip));
    }
    if (features.rightHip && this.#features.rightHip) {
      scores.push(compareHSV(features.rightHip, this.#features.rightHip));
    }
    if (features.faceForward && this.#features.faceForward) {
      scores.push(compareHSV(features.faceForward, this.#features.faceForward));
    }
    if (features.faceBackward && this.#features.faceBackward) {
      scores.push(compareHSV(features.faceBackward, this.#features.faceBackward));
    }

    if (scores.length === 0) return 0.5;

    const avgDist = scores.reduce((a, b) => a + b, 0) / scores.length;
    return avgDist;
  }

  #updateState(person: Person, timestamp: number): void {
    this.#latestPerson = person;
    this.#lastSeenTimestamp = timestamp;
  }
}
