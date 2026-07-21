import type { TestId } from "../types";
import type {
  ClientAction, CompleteMessage, ErrorMessage, InitAction, ReadyMessage,
  ServerMessage, StartAction, StopEarlyAction, UpdateMessage,
} from "./wireTypes";

export interface CVServiceCallbacks {
  onReady:    (msg: ReadyMessage)    => void;
  onUpdate:   (msg: UpdateMessage)   => void;
  onComplete: (msg: CompleteMessage) => void;
  onError:    (msg: ErrorMessage | { message: string }) => void;
}

export class CVServiceClient {
  private ws: WebSocket | null = null;
  private waitingForResponse = false;
  private closed = false;
  private finished = false;

  constructor(
    private readonly baseUrl: string,
    private readonly callbacks: CVServiceCallbacks,
  ) {}

  connect(testId: TestId): Promise<void> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/ws/test/${testId}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    return new Promise<void>((resolve, reject) => {
      const ws = this.ws!;
      ws.addEventListener("open",    () => resolve());
      ws.addEventListener("error",   () => reject(new Error("CV service WebSocket failed to open.")));
      ws.addEventListener("message", (e) => this.handleMessage(e));
      ws.addEventListener("close",   () => {
        if (!this.closed && !this.finished) this.callbacks.onError({ message: "CV service connection closed." });
      });
    });
  }

  init(token: string): void {
    const payload: InitAction = { action: "init", token };
    this.sendJson(payload);
  }

  start(): void {
    const payload: StartAction = { action: "start" };
    this.sendJson(payload);
  }

  stopEarly(): void {
    const payload: StopEarlyAction = { action: "stop_early" };
    this.sendJson(payload);
  }


  get readyForFrame(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && !this.waitingForResponse && !this.finished;
  }

  /** Returns true if a frame was actually sent (false = skipped due to backpressure). */
  async sendFrame(blob: Blob): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    if (this.waitingForResponse) return false;
    this.waitingForResponse = true;
    try {
      const buf = await blob.arrayBuffer();
      this.ws.send(buf);
      return true;
    } catch {
      this.waitingForResponse = false;
      return false;
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  // ---- private ---------------------------------------------------

  private sendJson(payload: ClientAction): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private handleMessage(event: MessageEvent): void {
    this.waitingForResponse = false;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      this.callbacks.onError({ message: "Malformed message from CV service." });
      return;
    }
    switch (msg.type) {
      case "ready":    this.callbacks.onReady(msg); break;
      case "update":   this.callbacks.onUpdate(msg); break;
      case "complete": this.finished = true; this.callbacks.onComplete(msg); break;
      case "error":    this.finished = true; this.callbacks.onError(msg); break;
    }
  }
}
