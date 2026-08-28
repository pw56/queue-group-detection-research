import {
  WorkerIncomingMessage,
  WorkerResultMessage,
  WorkerPoseResultMessage,
  WorkerPeopleResultMessage,
  BoundingBoxRect,
  Person
} from '../types';

interface Task {
  id: number;
  type: 'PEOPLE' | 'POSE';
  imageBitmap: ImageBitmap;
  rect?: BoundingBoxRect;
  imgWidth?: number;
  imgHeight?: number;
  resolve: (result: any) => void;
  reject: (reason: unknown) => void;
}

interface WorkerPoolOptions {
  posePoolSize?: number;
  peoplePoolSize?: number;
}

export class WorkerPoolManager {
  #posePoolSize: number;
  #peoplePoolSize: number;
  #poseWorkers: Worker[] = [];
  #idlePoseWorkers: Worker[] = [];
  #peopleWorkers: Worker[] = [];
  #idlePeopleWorkers: Worker[] = [];

  #taskQueue: Task[] = [];
  #activeTasks: Map<number, Task> = new Map();
  #isInitialized = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.#posePoolSize = options.posePoolSize ?? 4;
    this.#peoplePoolSize = options.peoplePoolSize ?? 1;
  }

  async #ensureInitialized(width: number, height: number): Promise<void> {
    if (!this.#isInitialized) {
      for (let i = 0; i < this.#peoplePoolSize; i++) {
        const worker = new Worker(
          new URL('./peopleDetectionWorker.ts', import.meta.url),
          { type: 'module' }
        );
        this.#peopleWorkers.push(worker);
        this.#idlePeopleWorkers.push(worker);
      }

      for (let i = 0; i < this.#posePoolSize; i++) {
        const worker = new Worker(new URL('./poseWorker.ts', import.meta.url), {
          type: 'module'
        });
        this.#poseWorkers.push(worker);
        this.#idlePoseWorkers.push(worker);
      }

      this.#isInitialized = true;

      const initMsg: WorkerIncomingMessage = { type: 'INIT', width, height };
      this.#peopleWorkers.forEach(worker => worker.postMessage(initMsg));
      this.#poseWorkers.forEach(worker => worker.postMessage(initMsg));
    }
  }

  public async processPeopleDetection(
    imageBitmap: ImageBitmap,
    imgWidth: number,
    imgHeight: number
  ): Promise<Person[]> {
    await this.#ensureInitialized(imgWidth, imgHeight);

    return new Promise((resolve, reject) => {
      const task: Task = {
        id: Date.now() + Math.random(),
        type: 'PEOPLE',
        imageBitmap,
        imgWidth,
        imgHeight,
        resolve,
        reject
      };
      this.#taskQueue.push(task);
      this.#dispatch();
    });
  }

  public async processPose(
    imageBitmap: ImageBitmap,
    rect: BoundingBoxRect,
    id: number,
    imgWidth: number,
    imgHeight: number
  ): Promise<WorkerPoseResultMessage> {
    await this.#ensureInitialized(imgWidth, imgHeight);

    return new Promise((resolve, reject) => {
      const task: Task = { id, type: 'POSE', imageBitmap, rect, resolve, reject };
      this.#taskQueue.push(task);
      this.#dispatch();
    });
  }

  #dispatch(): void {
    if (this.#taskQueue.length === 0) return;

    for (let i = 0; i < this.#taskQueue.length; i++) {
      const task = this.#taskQueue[i];

      if (task.type === 'PEOPLE' && this.#idlePeopleWorkers.length > 0) {
        this.#taskQueue.splice(i, 1);
        const worker = this.#idlePeopleWorkers.pop()!;
        this.#executePeopleTask(worker, task);
        break;
      } else if (task.type === 'POSE' && this.#idlePoseWorkers.length > 0) {
        this.#taskQueue.splice(i, 1);
        const worker = this.#idlePoseWorkers.pop()!;
        this.#executePoseTask(worker, task);
        break;
      }
    }
  }

  #executePeopleTask(worker: Worker, task: Task): void {
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
      if (event.data.id === task.id && event.data.type === 'PEOPLE_RESULT') {
        cleanup();
        this.#idlePeopleWorkers.push(worker);
        const res = event.data as WorkerPeopleResultMessage;
        task.resolve(res.people);
        this.#dispatch();
      }
    };

    const onError = (error: ErrorEvent) => {
      cleanup();
      this.#idlePeopleWorkers.push(worker);
      task.reject(error);
      this.#dispatch();
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const message: WorkerIncomingMessage = {
      type: 'PROCESS_PEOPLE',
      id: task.id,
      imageBitmap: task.imageBitmap,
      imgWidth: task.imgWidth!,
      imgHeight: task.imgHeight!
    };

    try {
      // 所有権移転（Transferable）でデータ転送を最適化
      worker.postMessage(message, [task.imageBitmap]);
    } catch (postErr) {
      cleanup();
      this.#idlePeopleWorkers.push(worker);
      task.reject(postErr);
      this.#dispatch();
    }
  }

  #executePoseTask(worker: Worker, task: Task): void {
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
        this.#idlePoseWorkers.push(worker);
        task.resolve(event.data);
        this.#dispatch();
      }
    };

    const onError = (error: ErrorEvent) => {
      cleanup();
      this.#idlePoseWorkers.push(worker);
      task.reject(error);
      this.#dispatch();
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const message: WorkerIncomingMessage = {
      type: 'PROCESS_POSE',
      id: task.id,
      imageBitmap: task.imageBitmap,
      rect: task.rect!
    };

    try {
      // 所有権移転（Transferable）でデータ転送を最適化
      worker.postMessage(message, [task.imageBitmap]);
    } catch (postErr) {
      cleanup();
      this.#idlePoseWorkers.push(worker);
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

    this.#peopleWorkers.forEach(w => w.terminate());
    this.#peopleWorkers = [];
    this.#idlePeopleWorkers = [];

    this.#poseWorkers.forEach(w => w.terminate());
    this.#poseWorkers = [];
    this.#idlePoseWorkers = [];
    this.#isInitialized = false;
  }
}
