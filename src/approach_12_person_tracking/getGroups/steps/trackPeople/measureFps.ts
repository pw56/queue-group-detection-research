import { Float64RingBuffer } from '../../utils/ringBuffer';

const MAX_TIMESTAMP_SAMPLES = 10;
const timestampBuffer = new Float64RingBuffer(MAX_TIMESTAMP_SAMPLES);
let defaultFps = 0;

export function updateFps(timestamp: number): void {
  timestampBuffer.push(timestamp);
}

export function getFps(): number {
  const size = timestampBuffer.size;
  if (size < 2) {
    return defaultFps;
  }

  const first = timestampBuffer.first()!;
  const last = timestampBuffer.last()!;
  const diffMs = last - first;

  if (diffMs <= 0) {
    return defaultFps;
  }

  const avgIntervalSec = (diffMs / (size - 1)) / 1000;
  if (avgIntervalSec <= 0) {
    return defaultFps;
  }

  const calculatedFps = 1 / avgIntervalSec;
  return Math.min(Math.max(calculatedFps, 1), 120);
}
