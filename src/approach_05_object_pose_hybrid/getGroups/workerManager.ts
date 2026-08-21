import { CropJob, WorkerResultMessage, WorkerInMessage } from './types';

interface QueuedTask {
  id: number;
  job: CropJob;
  resolve: (result: WorkerResultMessage) => void;
  reject: (reason: any) => void;
}

export class WorkerManager {
  #workers: Worker[] = [];
  #idleWorkers: Worker[] = [];
  #taskQueue: QueuedTask[] = [];
  #callbacks = new Map<number, { resolve: (result: WorkerResultMessage) => void; reject: (reason: any) => void }>();
  #nextJobId = 0;
  #poolSize: number;
  #isInitialized = false;

  constructor(poolSize = 4) {
    this.#poolSize = poolSize;
  }

  async initialize(width: number, height: number): Promise<void> {
    if (this.#isInitialized) return;

    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.#poolSize; i++) {
      // Vite などのモジュールバンドラ対応のWorker作成
      const worker = new Worker(new URL('./poseWorker.ts', import.meta.url), { type: 'module' });

      // INIT 完了を待つPromiseを作成
      const initPromise = new Promise<void>((resolve, reject) => {
        const handleInit = (event: MessageEvent) => {
          if (event.data?.type === 'INIT_COMPLETE') {
            worker.removeEventListener('message', handleInit);
            this.#idleWorkers.push(worker);
            resolve();
          } else if (event.data?.error) {
            worker.removeEventListener('message', handleInit);
            reject(new Error(event.data.error));
          }
        };
        worker.addEventListener('message', handleInit);
      });

      initPromises.push(initPromise);

      worker.onmessage = (event: MessageEvent<WorkerResultMessage>) => {
        this.#handleWorkerMessage(worker, event.data);
      };

      worker.onerror = (error) => {
        console.error("Worker error:", error);
      };

      this.#workers.push(worker);

      const initMsg: WorkerInMessage = { type: 'INIT', width, height };
      worker.postMessage(initMsg);
    }

    await Promise.all(initPromises);
    this.#isInitialized = true;
  }

  #handleWorkerMessage(worker: Worker, result: WorkerResultMessage): void {
    const callback = this.#callbacks.get(result.id);
    if (callback) {
      this.#callbacks.delete(result.id);
      if (result.error) {
        callback.reject(new Error(result.error));
      } else {
        callback.resolve(result);
      }
    }

    this.#idleWorkers.push(worker);
    this.#processNextTask();
  }

  #processNextTask(): void {
    if (this.#taskQueue.length === 0 || this.#idleWorkers.length === 0) {
      return;
    }

    const worker = this.#idleWorkers.pop()!;
    const task = this.#taskQueue.shift()!;

    this.#callbacks.set(task.id, { resolve: task.resolve, reject: task.reject });

    const message: WorkerInMessage = {
      type: 'PROCESS',
      id: task.id,
      imageBitmap: task.job.imageBitmap,
      boundingBox: task.job.boundingBox
    };

    // 所有権移転（Transferable）を利用して ImageBitmap を Worker へ送信
    worker.postMessage(message, [task.job.imageBitmap]);
  }

  processJob(job: CropJob): Promise<WorkerResultMessage> {
    return new Promise((resolve, reject) => {
      const id = this.#nextJobId++;
      this.#taskQueue.push({ id, job, resolve, reject });
      this.#processNextTask();
    });
  }

  terminate(): void {
    for (const worker of this.#workers) {
      worker.terminate();
    }
    this.#workers = [];
    this.#idleWorkers = [];
    this.#taskQueue = [];
    this.#callbacks.clear();
    this.#isInitialized = false;
  }
}
