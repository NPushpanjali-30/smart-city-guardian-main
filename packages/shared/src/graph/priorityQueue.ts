/**
 * High-performance Binary Min-Heap Priority Queue
 * Guarantees O(log N) push/pop and O(1) peek operations for graph routing algorithms.
 */
export interface PriorityQueueNode<T> {
  item: T;
  element: T;
  priority: number;
}

export class PriorityQueue<T> {
  private heap: PriorityQueueNode<T>[] = [];

  public get size(): number {
    return this.heap.length;
  }

  public get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  public getSize(): number {
    return this.heap.length;
  }

  public sizeCount(): number {
    return this.heap.length;
  }

  public push(item: T, priority: number): void {
    const node: PriorityQueueNode<T> = { item, element: item, priority };
    this.heap.push(node);
    this.siftUp(this.heap.length - 1);
  }

  public pop(): PriorityQueueNode<T> | null {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop()!;

    const root = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.siftDown(0);
    return root;
  }

  public peek(): PriorityQueueNode<T> | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  public clear(): void {
    this.heap = [];
  }

  private siftUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.heap[current].priority < this.heap[parent].priority) {
        this.swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let current = index;
    const length = this.heap.length;

    while (true) {
      const leftChild = 2 * current + 1;
      const rightChild = 2 * current + 2;
      let smallest = current;

      if (leftChild < length && this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }

      if (rightChild < length && this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }

      if (smallest !== current) {
        this.swap(current, smallest);
        current = smallest;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}
