// PiShock WebSocket API connection manager
// Supports V2 API (recommended)

export type PiShockConnectionOptions =
  | { version: 'v2'; username: string; apiKey: string }
  | { version: 'v2'; userId: string; token: string };

export type PiShockWebSocketEvent =
  | { type: 'open' }
  | { type: 'close'; code: number; reason: string }
  | { type: 'error'; error: any }
  | { type: 'message'; data: any };

export class PiShockWebSocket {
  private ws?: WebSocket;
  private options: PiShockConnectionOptions;
  private listeners: ((event: PiShockWebSocketEvent) => void)[] = [];

  constructor(options: PiShockConnectionOptions) {
    this.options = options;
  }

  connect() {
    let url: string;
    if ('username' in this.options) {
      url = `wss://broker.pishock.com/v2?Username=${encodeURIComponent(this.options.username)}&ApiKey=${encodeURIComponent(this.options.apiKey)}`;
    } else {
      url = `wss://broker.pishock.com/v2?UserId=${encodeURIComponent(this.options.userId)}&Token=${encodeURIComponent(this.options.token)}`;
    }
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.emit({ type: 'open' });
    this.ws.onclose = (e) => {
      this.emit({ type: 'close', code: e.code, reason: e.reason });
      // Auto-reconnect unless explicitly disconnected by user
      if (this.ws) {
        setTimeout(() => this.connect(), 1000); // 1s backoff
      }
    };
    this.ws.onerror = (e) => this.emit({ type: 'error', error: e });
    this.ws.onmessage = (e) => {
      let data = e.data;
      try {
        data = JSON.parse(e.data);
      } catch {}
      this.emit({ type: 'message', data });
    };
  }

  /**
   * Explicitly disconnect and prevent auto-reconnect
   */
  disconnect() {
    if (this.ws) {
      const ws = this.ws;
      this.ws = undefined;
      ws.close();
    }
  }

  send(data: object) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket not open');
    this.ws.send(JSON.stringify(data));
  }

  on(listener: (event: PiShockWebSocketEvent) => void) {
    this.listeners.push(listener);
  }

  off(listener: (event: PiShockWebSocketEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  private emit(event: PiShockWebSocketEvent) {
    for (const l of this.listeners) l(event);
  }
}
