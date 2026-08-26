// MediaPipeのリフレッシュ閾値（定数管理）
export const REFRESH_CONFIG = {
  // 一定フレーム数（例: 7200フレーム）
  STABILITY_CHECK_FRAME_THRESHOLD: 7200,
  // 直近の判定対象フレーム数（例: 60フレーム）
  RECENT_WINDOW_SIZE: 60,
  // 変化が少ないとみなすグループ数の最大差分（例: 1以下）
  MAX_GROUP_CHANGE_DELTA: 1,
  // 上限フレーム数（例: 14400フレーム）
  FORCE_REFRESH_FRAME_THRESHOLD: 14400,
} as const;

export class RefreshEvaluator {
  #totalFrameCount = 0;
  #recentGroupCounts: number[] = [];

  // フレーム数を増やす
  public incrementFrame(): void {
    this.#totalFrameCount++;
  }

  // 現在のトータルフレーム数を取得
  public get totalFrameCount(): number {
    return this.#totalFrameCount;
  }

  // 直近の検出グループ数を記録・管理
  public recordGroupCount(count: number): void {
    this.#recentGroupCounts.push(count);
    if (this.#recentGroupCounts.length > REFRESH_CONFIG.RECENT_WINDOW_SIZE) {
      this.#recentGroupCounts.shift();
    }
  }

  // リフレッシュが必要かどうかの判定ロジック
  public shouldRefresh(): boolean {
    // 1. 上限のフレーム数以上の場合は強制リフレッシュ
    if (this.#totalFrameCount >= REFRESH_CONFIG.FORCE_REFRESH_FRAME_THRESHOLD) {
      return true;
    }

    // 2. 一定フレーム数以上かつ直近での変化が少ない場合
    if (this.#totalFrameCount >= REFRESH_CONFIG.STABILITY_CHECK_FRAME_THRESHOLD) {
      if (this.#recentGroupCounts.length >= REFRESH_CONFIG.RECENT_WINDOW_SIZE) {
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < this.#recentGroupCounts.length; i++) {
          const c = this.#recentGroupCounts[i];
          if (c < min) min = c;
          if (c > max) max = c;
        }

        const delta = max - min;
        if (delta <= REFRESH_CONFIG.MAX_GROUP_CHANGE_DELTA) {
          return true;
        }
      }
    }

    return false;
  }

  // 内部状態（フレーム数および履歴）のリセット
  public reset(): void {
    this.#totalFrameCount = 0;
    this.#recentGroupCounts.length = 0;
  }
}
