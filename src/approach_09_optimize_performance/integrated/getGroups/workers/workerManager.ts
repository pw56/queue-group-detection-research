import { WorkerIncomingMessage, WorkerResultMessage, BoundingBoxRect } from '../types';

interface Task {
  id: number;
  imageBitmap: ImageBitmap;
  rect: BoundingBoxRect;
  resolve: (result: WorkerResultMessage) => void;
  reject: (reason: unknown) => void;
}

export class WorkerPoolManager {
  #poolSize: number;
  #workers: Worker[] = [];
  #idleWorkers: Worker[] = [];
  #taskQueue: Task[] = [];
  #activeTasks: Map<number, Task> = new Map();
  #isInitialized = false;

  constructor(poolSize = 4) {
    this.#poolSize = poolSize;
  }

  async #ensureInitialized(width: number, height: number): Promise<void> {
    if (!this.#isInitialized) {
      for (let i = 0; i < this.#poolSize; i++) {
        const worker = new Worker(new URL('./poseWorker.ts', import.meta.url), {
          type: 'module'
        });
        this.#workers.push(worker);
        this.#idleWorkers.push(worker);
      }
      this.#isInitialized = true;

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

    const cleanupListeners = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };

    const cleanup = () => {
      cleanupListeners();
      this.#activeTasks.delete(task.id);
      task.imageBitmap.close();
    };

    const onMessage = (event: MessageEvent<WorkerResultMessage>) => {
      if (event.data.id === task.id) {
        cleanup();
        this.#idleWorkers.push(worker);

        task.resolve(event.data);
        this.#dispatch();
      }
    };

    const onError = (error: ErrorEvent) => {
      cleanup();
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

    try {
      // 所有権移転（Transferable）でデータ転送を最適化
      worker.postMessage(message, [task.imageBitmap]);
    } catch (postErr) {
      cleanup();
      this.#idleWorkers.push(worker);
      task.reject(postErr);
      this.#dispatch();
    }
  }

  public destroy(): void {
    for (let i = 0; i < this.#taskQueue.length; i++) {
      this.#taskQueue[i].imageBitmap.close();
    }
    this.#taskQueue = [];

    for (const task of this.#activeTasks.values()) {
      task.imageBitmap.close();
    }
    this.#activeTasks.clear();

    this.#workers.forEach(w => w.terminate());
    this.#workers = [];
    this.#idleWorkers = [];
    this.#isInitialized = false;
  }
}

export const workerPoolManager = new WorkerPoolManager(4);
