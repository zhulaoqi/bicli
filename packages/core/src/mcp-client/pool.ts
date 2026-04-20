import { McpConnection } from "./connection.js";

export class McpConnectionPool {
  private connection: McpConnection | null = null;
  private refCount = 0;
  private connectCommand: string;
  private connectArgs: string[];
  private initializing: Promise<void> | null = null;

  constructor(command: string, args: string[] = []) {
    this.connectCommand = command;
    this.connectArgs = args;
  }

  async initialize(): Promise<void> {
    if (this.connection) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      this.connection = new McpConnection();
      await this.connection.connect(this.connectCommand, this.connectArgs);
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  acquire(): McpConnection {
    if (!this.connection) throw new Error("Pool not initialized");
    this.refCount++;
    return this.connection;
  }

  release(): void {
    if (this.refCount <= 0) return;
    this.refCount--;
  }

  getRefCount(): number {
    return this.refCount;
  }

  isInitialized(): boolean {
    return this.connection !== null;
  }

  async dispose(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
    this.refCount = 0;
  }
}
