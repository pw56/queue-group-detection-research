/**
 * メモリ再利用が可能な Union-Find (Disjoint Set Union) クラス
 */
export class UnionFind {
  #parent: number[];

  constructor(size: number) {
    this.#parent = new Array(size);
    this.reset(size);
  }

  /**
   * 指定サイズで親配列を初期化（配列長の拡張・初期化を最適化）
   */
  reset(size: number): void {
    if (this.#parent.length < size) {
      this.#parent = new Array(size);
    }
    for (let i = 0; i < size; i++) {
      this.#parent[i] = i;
    }
  }

  /**
   * 根（代表元）を検索（経路圧縮付き）
   */
  find(i: number): number {
    let root = i;
    while (root !== this.#parent[root]) {
      root = this.#parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const nxt = this.#parent[curr];
      this.#parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  /**
   * 2つの要素が属する集合を統合
   */
  union(i: number, j: number): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.#parent[rootI] = rootJ;
    }
  }

  /**
   * メモリ解放用処理（参照クリア）
   */
  release(): void {
    this.#parent = [];
  }
}
