/**
 * Float32Array または Float64Array を内部バッファとして使い回し、
 * メモリ再確保を防ぐリングバッファクラス
 */
class RingBuffer<T extends Float32Array | Float64Array> {
  #buffer: T;
  #capacity: number;
  #head = 0;
  #tail = 0;
  #size = 0;

  constructor(ctor: { new (length: number): T }, capacity: number) {
    this.#capacity = capacity;
    this.#buffer = new ctor(capacity);
  }

  get capacity(): number {
    return this.#capacity;
  }

  get size(): number {
    return this.#size;
  }

  push(value: number): void {
    this.#buffer[this.#head] = value;
    this.#head = (this.#head + 1) % this.#capacity;
    if (this.#size < this.#capacity) {
      this.#size++;
    } else {
      this.#tail = (this.#tail + 1) % this.#capacity;
    }
  }

  get(index: number): number {
    if (index < 0 || index >= this.#size) {
      throw new RangeError("Index out of bounds");
    }
    const actualIndex = (this.#tail + index) % this.#capacity;
    return this.#buffer[actualIndex];
  }

  at(index: number): number {
    return this.get(index);
  }

  first(): number | undefined {
    if (this.#size === 0) return undefined;
    return this.#buffer[this.#tail];
  }

  last(): number | undefined {
    if (this.#size === 0) return undefined;
    const lastIndex = (this.#head - 1 + this.#capacity) % this.#capacity;
    return this.#buffer[lastIndex];
  }

  clear(): void {
    this.#head = 0;
    this.#tail = 0;
    this.#size = 0;
  }
}

export class Float64RingBuffer extends RingBuffer<Float64Array> {
  constructor(capacity: number) {
    super(Float64Array, capacity);
  }
}

export class Float32RingBuffer extends RingBuffer<Float32Array> {
  constructor(capacity: number) {
    super(Float32Array, capacity);
  }
}
