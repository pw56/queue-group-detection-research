import { Float64RingBuffer } from '../../utils/ringBuffer';

/**
 - 2D（x, y, vx, vy）のカルマンフィルター実装
 - リングバッファを使用して内部配列のメモリ確保を最小化
 */
export class KalmanFilterForPeople {
  #x = 0;
  #y = 0;
  #vx = 0;
  #vy = 0;

  #p00 = 1000;
  #p01 = 0;
  #p02 = 0;
  #p03 = 0;

  #p10 = 0;
  #p11 = 1000;
  #p12 = 0;
  #p13 = 0;

  #p20 = 0;
  #p21 = 0;
  #p22 = 1000;
  #p23 = 0;

  #p30 = 0;
  #p31 = 0;
  #p32 = 0;
  #p33 = 1000;

  static readonly INITIAL_P = 1000;
  static readonly Q_POS = 1.0;
  static readonly Q_VEL = 10.0;
  static readonly R_MEAS = 5.0;
  static readonly HISTORY_CAPACITY = 30;

  #historyX = new Float64RingBuffer(KalmanFilterForPeople.HISTORY_CAPACITY);
  #historyY = new Float64RingBuffer(KalmanFilterForPeople.HISTORY_CAPACITY);

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
    const dt3 = dt2 * dt;
    const dt4 = dt2 * dt2;

    const qPos = KalmanFilterForPeople.Q_POS;
    const qVel = KalmanFilterForPeople.Q_VEL;

    const q00 = (dt4 / 4) * qPos;
    const q02 = (dt3 / 2) * qPos;
    const q11 = (dt4 / 4) * qPos;
    const q13 = (dt3 / 2) * qPos;
    const q20 = (dt3 / 2) * qPos;
    const q22 = dt2 * qVel;
    const q31 = (dt3 / 2) * qPos;
    const q33 = dt2 * qVel;

    const p00Old = this.#p00;
    const p01Old = this.#p01;
    const p02Old = this.#p02;
    const p03Old = this.#p03;

    const p10Old = this.#p10;
    const p11Old = this.#p11;
    const p12Old = this.#p12;
    const p13Old = this.#p13;

    const p20Old = this.#p20;
    const p21Old = this.#p21;
    const p22Old = this.#p22;
    const p23Old = this.#p23;

    const p30Old = this.#p30;
    const p31Old = this.#p31;
    const p32Old = this.#p32;
    const p33Old = this.#p33;

    this.#p00 = p00Old + dt * (p20Old + p02Old) + dt2 * p22Old + q00;
    this.#p01 = p01Old + dt * (p21Old + p03Old) + dt2 * p23Old;
    this.#p02 = p02Old + dt * p22Old + q02;
    this.#p03 = p03Old + dt * p23Old;

    this.#p10 = p10Old + dt * (p30Old + p12Old) + dt2 * p32Old;
    this.#p11 = p11Old + dt * (p31Old + p13Old) + dt2 * p33Old + q11;
    this.#p12 = p12Old + dt * p32Old;
    this.#p13 = p13Old + dt * p33Old + q13;

    this.#p20 = p20Old + dt * p22Old + q20;
    this.#p21 = p21Old + dt * p23Old;
    this.#p22 = p22Old + q22;
    this.#p23 = p23Old;

    this.#p30 = p30Old + dt * p32Old;
    this.#p31 = p31Old + dt * p33Old + q31;
    this.#p32 = p32Old;
    this.#p33 = p33Old + q33;

    return { x: this.#x, y: this.#y };
  }

  update(measX: number, measY: number): { x: number; y: number } {
    const rMeas = KalmanFilterForPeople.R_MEAS;

    const s00 = this.#p00 + rMeas;
    const s01 = this.#p01;
    const s10 = this.#p10;
    const s11 = this.#p11 + rMeas;

    const detS = s00 * s11 - s01 * s10;

    const invS00 = s11 / detS;
    const invS01 = -s01 / detS;
    const invS10 = -s10 / detS;
    const invS11 = s00 / detS;

    const k00 = this.#p00 * invS00 + this.#p01 * invS10;
    const k01 = this.#p00 * invS01 + this.#p01 * invS11;

    const k10 = this.#p10 * invS00 + this.#p11 * invS10;
    const k11 = this.#p10 * invS01 + this.#p11 * invS11;

    const k20 = this.#p20 * invS00 + this.#p21 * invS10;
    const k21 = this.#p20 * invS01 + this.#p21 * invS11;

    const k30 = this.#p30 * invS00 + this.#p31 * invS10;
    const k31 = this.#p30 * invS01 + this.#p31 * invS11;

    const yx = measX - this.#x;
    const yy = measY - this.#y;

    this.#x += k00 * yx + k01 * yy;
    this.#y += k10 * yx + k11 * yy;
    this.#vx += k20 * yx + k21 * yy;
    this.#vy += k30 * yx + k31 * yy;

    const p00Old = this.#p00;
    const p01Old = this.#p01;
    const p02Old = this.#p02;
    const p03Old = this.#p03;

    const p10Old = this.#p10;
    const p11Old = this.#p11;
    const p12Old = this.#p12;
    const p13Old = this.#p13;

    const p20Old = this.#p20;
    const p21Old = this.#p21;
    const p22Old = this.#p22;
    const p23Old = this.#p23;

    const p30Old = this.#p30;
    const p31Old = this.#p31;
    const p32Old = this.#p32;
    const p33Old = this.#p33;

    this.#p00 = p00Old - (k00 * p00Old + k01 * p10Old);
    this.#p01 = p01Old - (k00 * p01Old + k01 * p11Old);
    this.#p02 = p02Old - (k00 * p02Old + k01 * p12Old);
    this.#p03 = p03Old - (k00 * p03Old + k01 * p13Old);

    this.#p10 = p10Old - (k10 * p00Old + k11 * p10Old);
    this.#p11 = p11Old - (k10 * p01Old + k11 * p11Old);
    this.#p12 = p12Old - (k10 * p02Old + k11 * p12Old);
    this.#p13 = p13Old - (k10 * p03Old + k11 * p13Old);

    this.#p20 = p20Old - (k20 * p00Old + k21 * p10Old);
    this.#p21 = p21Old - (k20 * p01Old + k21 * p11Old);
    this.#p22 = p22Old - (k20 * p02Old + k21 * p12Old);
    this.#p23 = p23Old - (k20 * p03Old + k21 * p13Old);

    this.#p30 = p30Old - (k30 * p00Old + k31 * p10Old);
    this.#p31 = p31Old - (k30 * p01Old + k31 * p11Old);
    this.#p32 = p32Old - (k30 * p02Old + k31 * p12Old);
    this.#p33 = p33Old - (k30 * p03Old + k31 * p13Old);

    // 対称性を確保して数値誤差の蓄積を防止
    this.#p10 = this.#p01;
    this.#p20 = this.#p02;
    this.#p30 = this.#p03;
    this.#p21 = this.#p12;
    this.#p31 = this.#p13;
    this.#p32 = this.#p23;

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
