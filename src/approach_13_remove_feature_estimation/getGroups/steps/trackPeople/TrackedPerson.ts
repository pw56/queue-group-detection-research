import { Person } from '../../types';
import { KalmanFilterForPeople } from './KalmanFilterForPeople';
import { getFps } from './measureFps';

const QUEUE_STATIONARY_TIME_THRESHOLD_MS = 2000;
const MAX_MISSING_TIME_SEC = 2;

export class TrackedPerson {
  #id: string;
  #kalmanFilter: KalmanFilterForPeople | null = null;
  #latestPerson?: Person;
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

  isQueueMember(): boolean {
    return this.#isInQueue;
  }

  shouldBeRemoved(): boolean {
    const fps = getFps();
    const allowedMissingFrames = Math.ceil(MAX_MISSING_TIME_SEC * fps);
    const missingFrames = (this.#missingDurationMs / 1000) * fps;
    return missingFrames > allowedMissingFrames;
  }

  getPersonWithId(): Person | undefined {
    if (!this.#latestPerson) return undefined;
    return {
      ...this.#latestPerson,
      id: this.#id,
    };
  }

  async updateFrame(
    matchedPerson: Person | undefined,
    timestamp: number
  ): Promise<void> {
    const dt = (timestamp - this.#lastSeenTimestamp) / 1000;

    let predictedPos = { x: 0, y: 0 };
    if (this.#kalmanFilter && dt > 0) {
      predictedPos = this.#kalmanFilter.predict(dt);
    }

    if (matchedPerson) {
      this.#missingDurationMs = 0;
      
      let correctedPos = predictedPos;
      if (matchedPerson.boundingBox && this.#kalmanFilter) {
        const cx = matchedPerson.boundingBox.originX + matchedPerson.boundingBox.width / 2;
        const cy = matchedPerson.boundingBox.originY + matchedPerson.boundingBox.height / 2;
        correctedPos = this.#kalmanFilter.update(cx, cy);
      }

      // カルマンフィルターの補正座標を Person オブジェクトに反映
      const updatedPerson = { ...matchedPerson };
      if (updatedPerson.boundingBox) {
        updatedPerson.boundingBox = {
          ...updatedPerson.boundingBox,
          originX: correctedPos.x - updatedPerson.boundingBox.width / 2,
          originY: correctedPos.y - updatedPerson.boundingBox.height / 2,
        };
      }
      this.#latestPerson = updatedPerson;
    } else {
      this.#missingDurationMs += (timestamp - this.#lastSeenTimestamp);
      this.#latestPerson = undefined;
    }

    // タイムスタンプを常に最新に更新（dtの膨張を抑止）
    this.#lastSeenTimestamp = timestamp;

    this.#evaluateQueueStatus(timestamp);
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

  #updateState(person: Person, timestamp: number): void {
    this.#latestPerson = person;
    this.#lastSeenTimestamp = timestamp;
  }
}
