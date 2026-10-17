/** Fixed-size line buffer used for the main process log tail shown in the Control Center. */
export class RingBuffer {
  private lines: string[] = [];

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("RingBuffer capacity must be a positive integer");
  }

  push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.capacity) this.lines.splice(0, this.lines.length - this.capacity);
  }

  tail(n: number): string[] {
    return n >= this.lines.length ? [...this.lines] : this.lines.slice(this.lines.length - n);
  }

  get size(): number {
    return this.lines.length;
  }

  clear(): void {
    this.lines = [];
  }
}
