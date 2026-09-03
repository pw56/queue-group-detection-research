import { Float64RingBuffer } from './ringBuffer';

/**
 * 2D（x, y, vx, vy）のカルマンフィルター実装
 * リングバッファを使用して内部配列のメモリ確保を最小化
 */
export class KalmanFilter {
  #x = 0;
  #y = 0;
  #vx = 0;
  #vy = 0;

  #p00 = 1000;
  #p11 = 1000;
  #p22 = 1000;
  #p33 = 1000;

  #qPos = 1.0;
  #qVel = 10.0;
  #rMeas = 5.0;

  #historyX = new Float64RingBuffer(30);
  #historyY = new Float64RingBuffer(30);

  constructor(initialX: number, initialY: number) {
    this.#x = initialX;
    this.#y = initialY;
    this.#historyX.push(initialX);
    this.#historyY.push(initialY);
  }

  predict(dt: number): { x: number; y: number } {
    this.#x += this.#vx * dt;
    this.#y += this.#vy * dt;

    const dt2 = dt * dt;
    this.#p00 += this.#p22 * dt2 + this.#qPos * dt;
    this.#p11 += this.#p33 * dt2 + this.#qPos * dt;
    this.#p22 += this.#qVel * dt;
    this.#p33 += this.#qVel * dt;

    return { x: this.#x, y: this.#y };
  }

  update(measX: number, measY: number): { x: number; y: number } {
    const k0 = this.#p00 / (this.#p00 + this.#rMeas);
    const k1 = this.#p11 / (this.#p11 + this.#rMeas);

    const yx = measX - this.#x;
    const yy = measY - this.#y;

    this.#x += k0 * yx;
    this.#y += k1 * yy;

    const kvx = k0 * 0.1;
    const kvy = k1 * 0.1;

    this.#vx += kvx * yx;
    this.#vy += kvy * yy;

    this.#p00 *= (1 - k0);
    this.#p11 *= (1 - k1);
    this.#p22 *= (1 - k0);
    this.#p33 *= (1 - k1);

    this.#historyX.push(this.#x);
    this.#historyY.push(this.#y);

    return { x: this.#x, y: this.#y };
  }

  get state(): { x: number; y: number; vx: number; vy: number } {
    return { x: this.#x, y: this.#y, vx: this.#vx, vy: this.#vy };
  }

  get historyX(): Float64RingBuffer {
    return this.#historyX;
  }

  get historyY(): Float64RingBuffer {
    return this.#historyY;
  }
}
