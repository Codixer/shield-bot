import { PiShockWebSocket, PiShockConnectionOptions } from './websocket.js';

// Connection manager for multiple users
export class PiShockConnectionManager {
  private connections: Map<string, PiShockWebSocket> = new Map();

  /**
   * Get or create a persistent connection for a user.
   * @param userKey Unique key for the user (e.g., userId, username, or Discord ID)
   * @param options Connection options for PiShock
   */
  getConnection(userKey: string, options: PiShockConnectionOptions): PiShockWebSocket {
    let conn = this.connections.get(userKey);
    if (!conn) {
      conn = new PiShockWebSocket(options);
      conn.connect();
      this.connections.set(userKey, conn);
    }
    return conn;
  }

  /**
   * Close and remove a user's connection
   */
  closeConnection(userKey: string) {
    const conn = this.connections.get(userKey);
    if (conn) {
      conn.disconnect();
      this.connections.delete(userKey);
    }
  }

  /**
   * Get all active user keys
   */
  getActiveUsers(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Close all connections (e.g., on shutdown)
   */
  closeAll() {
    for (const conn of this.connections.values()) {
      conn.disconnect();
    }
    this.connections.clear();
  }
}
