import { Socket } from 'node:net';

export class SocketChannel {
  private readonly buffers: Buffer[] = [];
  private bufferedLength = 0;
  private ended = false;
  private pendingRead?:
    | {
        length: number;
        resolve: (value: Buffer) => void;
        reject: (reason?: unknown) => void;
      }
    | undefined;

  constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.buffers.push(chunk);
      this.bufferedLength += chunk.length;
      this.flushPendingRead();
    });
    socket.on('end', () => {
      this.ended = true;
      this.flushPendingRead();
    });
    socket.on('close', () => {
      this.ended = true;
      this.flushPendingRead();
    });
    socket.on('error', (error) => {
      this.pendingRead?.reject(error);
      this.pendingRead = undefined;
    });
  }

  async readExactly(length: number): Promise<Buffer> {
    if (this.bufferedLength >= length) {
      return this.consume(length);
    }

    if (this.ended) {
      throw new Error(`Socket closed before ${length} bytes were available.`);
    }

    return await new Promise<Buffer>((resolve, reject) => {
      this.pendingRead = { length, resolve, reject };
    });
  }

  async write(buffer: Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.write(buffer, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private flushPendingRead(): void {
    if (!this.pendingRead) {
      return;
    }

    if (this.bufferedLength >= this.pendingRead.length) {
      const pendingRead = this.pendingRead;
      this.pendingRead = undefined;
      pendingRead.resolve(this.consume(pendingRead.length));
      return;
    }

    if (this.ended) {
      const pendingRead = this.pendingRead;
      this.pendingRead = undefined;
      pendingRead.reject(new Error(`Socket closed before ${pendingRead.length} bytes were available.`));
    }
  }

  private consume(length: number): Buffer {
    const result = Buffer.alloc(length);
    let offset = 0;

    while (offset < length) {
      const chunk = this.buffers[0];
      const take = Math.min(chunk.length, length - offset);
      chunk.copy(result, offset, 0, take);
      offset += take;

      if (take === chunk.length) {
        this.buffers.shift();
      } else {
        this.buffers[0] = chunk.subarray(take);
      }
    }

    this.bufferedLength -= length;

    return result;
  }
}
