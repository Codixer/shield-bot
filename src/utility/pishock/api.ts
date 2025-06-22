import axios from 'axios';

export type PiShockAuthOptions =
  | { username: string; apiKey: string }
  | { userId: string; token: string };

export type PiShockDevice = {
  clientId: number;
  name: string;
  userId: number;
  username: string;
  shockers: Array<{
    name: string;
    shockerId: number;
    isPaused: boolean;
  }>;
};

export type PiShockShareInfo = {
  shareId: number;
  clientId: number;
  shockerId: number;
  shockerName: string;
  isPaused: boolean;
  shareCode: string;
  [key: string]: any;
};

export type ShockPayload = {
  id: number;
  m: 's' | 'v' | 'b' | 'e';
  i: number;
  d: number;
  r: boolean;
  l: {
    u: number;
    ty: 'api' | 'sc';
    w: boolean;
    h: boolean;
    o: string;
  };
};

export class PiShockAPI {
  static async getUserId(options: { username: string; apiKey: string }): Promise<number> {
    const url = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(options.apiKey)}&username=${encodeURIComponent(options.username)}`;
    const res = await axios.get(url);
    return res.data.UserID;
  }

  static async getDevices(options: PiShockAuthOptions): Promise<PiShockDevice[]> {
    let userId: string, token: string;
    if ('apiKey' in options && 'username' in options) {
      const id = await PiShockAPI.getUserId(options);
      userId = String(id);
      token = options.apiKey;
    } else {
      userId = options.userId;
      token = options.token;
    }
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?UserId=${userId}&Token=${token}&api=true`;
    const res = await axios.get(url);
    return res.data;
  }

  static async getShareIds(options: PiShockAuthOptions): Promise<Record<string, number[]>> {
    let userId: string, token: string;
    if ('apiKey' in options && 'username' in options) {
      userId = String(await PiShockAPI.getUserId(options));
      token = options.apiKey;
    } else {
      userId = options.userId;
      token = options.token;
    }
    const url = `https://ps.pishock.com/PiShock/GetShareCodesByOwner?UserId=${userId}&Token=${token}&api=true`;
    const res = await axios.get(url);
    return res.data;
  }

  static async getSharedShockers(options: PiShockAuthOptions, shareIds: number[]): Promise<Record<string, PiShockShareInfo[]>> {
    let userId: string, token: string;
    if ('apiKey' in options && 'username' in options) {
      userId = String(await PiShockAPI.getUserId(options));
      token = options.apiKey;
    } else {
      userId = options.userId;
      token = options.token;
    }
    const params = shareIds.map(id => `shareIds=${id}`).join('&');
    const url = `https://ps.pishock.com/PiShock/GetShockersByShareIds?UserId=${userId}&Token=${token}&api=true&${params}`;
    const res = await axios.get(url);
    return res.data;
  }

  /**
   * Send a shock/vibrate/beep command to a device (own or shared)
   * @param ws PiShockWebSocket instance
   * @param payload ShockPayload
   * @param opts: { shareCode?: string } - if shareCode is provided, will use shared channel
   */
  static sendShock(ws: any, payload: ShockPayload, opts?: { clientId: number; shareCode?: string }) {
    let channel: string;
    if (opts?.shareCode) {
      channel = `c${opts.clientId}-sops-${opts.shareCode}`;
      payload.l.ty = 'sc';
    } else {
      channel = `c${opts?.clientId}-ops`;
      payload.l.ty = 'api';
    }
    ws.send({
      Operation: 'PUBLISH',
      PublishCommands: [
        {
          Target: channel,
          Body: payload,
        },
      ],
    });
  }
}
