import { Float64RingBuffer } from '../../utils/ringBuffer';

/**
 * 2D（x, y, vx, vy）のカルマンフィルター実装
 * リングバッファを使用して内部配列のメモリ確保を最小化
 */
export class KalmanFilterForPeople {
  #x = 0;
  #y = 0;
  #vx = 0;
  #vy = 0;

  #p00 = 1000;
  #p02 = 0;
  #p11 = 1000;
  #p13 = 0;
  #p20 = 0;
  #p22 = 1000;
  #p31 = 0;
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
    const qPosDt = this.#qPos * dt;
    const qVelDt = this.#qVel * dt;

    this.#p00 += (this.#p20 + this.#p02) * dt + this.#p22 * dt2 + qPosDt;
    this.#p02 += this.#p22 * dt;
    this.#p20 += this.#p22 * dt;
    this.#p22 += qVelDt;

    this.#p11 += (this.#p31 + this.#p13) * dt + this.#p33 * dt2 + qPosDt;
    this.#p13 += this.#p33 * dt;
    this.#p31 += this.#p33 * dt;
    this.#p33 += qVelDt;

    return { x: this.#x, y: this.#y };
  }

  update(measX: number, measY: number): { x: number; y: number } {
    const S0 = this.#p00 + this.#rMeas;
    const S1 = this.#p11 + this.#rMeas;

    const k00 = this.#p00 / S0;
    const k20 = this.#p20 / S0;

    const k11 = this.#p11 / S1;
    const k31 = this.#p31 / S1;

    const yx = measX - this.#x;
    const yy = measY - this.#y;

    this.#x += k00 * yx;
    this.#vx += k20 * yx;

    this.#y += k11 * yy;
    this.#vy += k31 * yy;

    const p00Old = this.#p00;
    const p02Old = this.#p02;
    const p11Old = this.#p11;
    const p13Old = this.#p13;

    this.#p00 = (1 - k00) * p00Old;
    this.#p02 = (1 - k00) * p02Old;
    this.#p20 = this.#p20 - k20 * p00Old;
    this.#p22 = this.#p22 - k20 * p02Old;

    this.#p11 = (1 - k11) * p11Old;
    this.#p13 = (1 - k11) * p13Old;
    this.#p31 = this.#p31 - k31 * p11Old;
    this.#p33 = this.#p33 - k31 * p13Old;

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
