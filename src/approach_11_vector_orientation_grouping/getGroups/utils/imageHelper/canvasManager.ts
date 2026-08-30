interface CanvasItem {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

// キャンバスとその使用中フラグを管理するMap
const canvasPool = new Map<CanvasItem, boolean>();

/**
 * 空いているキャンバスコンテキストを取得します。
 * 空きがない場合は新しいOffscreenCanvasを作成してプールに追加します。
 * 取得時に指定サイズよりキャンバスが小さい場合のみリサイズを行います。
 */
export function acquireCanvasContext(
  width: number,
  height: number
): OffscreenCanvasRenderingContext2D {
  let targetItem: CanvasItem | null = null;

  // 空いているキャンバスを探索
  for (const [item, isInUse] of canvasPool.entries()) {
    if (!isInUse) {
      targetItem = item;
      break;
    }
  }

  // 空きがない場合は新規作成
  if (!targetItem) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context from OffscreenCanvas");
    }
    targetItem = { canvas, ctx };
    canvasPool.set(targetItem, true);
    return ctx;
  }

  // 使用中フラグをオンに設定
  canvasPool.set(targetItem, true);

  // 処理対象の画像サイズが現在のキャンバスより大きい場合のみリサイズ
  if (targetItem.canvas.width < width || targetItem.canvas.height < height) {
    targetItem.canvas.width = Math.max(targetItem.canvas.width, width);
    targetItem.canvas.height = Math.max(targetItem.canvas.height, height);
  } else {
    // リサイズしない場合は前回の描画内容をクリア
    targetItem.ctx.clearRect(0, 0, targetItem.canvas.width, targetItem.canvas.height);
  }

  return targetItem.ctx;
}

/**
 * 使用が終わったキャンバスコンテキストを返却（解放）します。
 */
export function releaseCanvasContext(
  ctx: OffscreenCanvasRenderingContext2D
): void {
  for (const [item] of canvasPool.entries()) {
    if (item.ctx === ctx) {
      // 次回使用時のために描画をクリアしてフラグを解除
      item.ctx.clearRect(0, 0, item.canvas.width, item.canvas.height);
      canvasPool.set(item, false);
      return;
    }
  }
}
