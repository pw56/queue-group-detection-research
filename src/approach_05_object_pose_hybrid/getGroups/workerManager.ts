import { WorkerIncomingMessage, WorkerResultMessage, BoundingBoxRect } from './types';

interface Task {
  id: number;
  imageBitmap: ImageBitmap;
  rect: BoundingBoxRect;
  resolve: (result: WorkerResultMessage) => void;
  reject: (reason: any) => void;
}

export class WorkerPoolManager {
  #poolSize: number;
  #workers: Worker[] = [];
  #idleWorkers: Worker[] = [];
  #taskQueue: Task[] = [];
  #activeTasks: Map<number, Task> = new Map();
  #isInitialized = false;
  #currentWidth = 0;
  #currentHeight = 0;

  constructor(poolSize = 4) {
    this.#poolSize = poolSize;
  }

  async #ensureInitialized(width: number, height: number): Promise<void> {
    if (!this.#isInitialized) {
      for (let i = 0; i < this.#poolSize; i++) {
        // Vite / Webpack 5 互換の Worker 生成
        const worker = new Worker(new URL('./poseWorker.ts', import.meta.url), {
          type: 'module'
        });
        this.#workers.push(worker);
        this.#idleWorkers.push(worker);
      }
      this.#isInitialized = true;
    }

    if (this.#currentWidth !== width || this.#currentHeight !== height) {
      this.#currentWidth = width;
      this.#currentHeight = height;
      const initMsg: WorkerIncomingMessage = { type: 'INIT', width, height };
      this.#workers.forEach(worker => worker.postMessage(initMsg));
    }
  }

  public async processCandidate(
    imageBitmap: ImageBitmap,
    rect: BoundingBoxRect,
    id: number,
    imgWidth: number,
    imgHeight: number
  ): Promise<WorkerResultMessage> {
    await this.#ensureInitialized(imgWidth, imgHeight);

    return new Promise((resolve, reject) => {
      const task: Task = { id, imageBitmap, rect, resolve, reject };
      this.#taskQueue.push(task);
      this.#dispatch();
    });
  }

  #dispatch(): void {
    if (this.#taskQueue.length === 0 || this.#idleWorkers.length === 0) {
      return;
    }

    const worker = this.#idleWorkers.pop()!;
    const task = this.#taskQueue.shift()!;

    this.#activeTasks.set(task.id, task);

    const onMessage = (event: MessageEvent<WorkerResultMessage>) => {
      if (event.data.id === task.id) {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);

        this.#activeTasks.delete(task.id);
        this.#idleWorkers.push(worker);

        task.resolve(event.data);
        this.#dispatch();
      }
    };

    const onError = (error: ErrorEvent) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);

      this.#activeTasks.delete(task.id);
      this.#idleWorkers.push(worker);

      task.reject(error);
      this.#dispatch();
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const message: WorkerIncomingMessage = {
      type: 'PROCESS',
      id: task.id,
      imageBitmap: task.imageBitmap,
      rect: task.rect
    };

    // 所有権移転（Transferable）で無駄を削減
    worker.postMessage(message, [task.imageBitmap]);
  }

  public destroy(): void {
    this.#workers.forEach(w => w.terminate());
    this.#workers = [];
    this.#idleWorkers = [];
    this.#taskQueue = [];
    this.#activeTasks.clear();
    this.#isInitialized = false;
  }
}

export const workerPoolManager = new WorkerPoolManager(4);
