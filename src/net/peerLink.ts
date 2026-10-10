import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

// A phone-to-phone link for the two-phone modes. The PeerJS cloud server
// only introduces the two phones (who's "4821"?); after that, messages go
// directly between them over a WebRTC data channel. PeerJS is loaded on
// demand, so solo play never downloads it.
//
// One host and one guest (hostLink), or one host and several guests
// (hostGroup). The host's peer id is a short code a child can
// type; a code someone else is using is simply re-rolled.

export type LinkStatus = 'connecting' | 'waiting' | 'connected' | 'lost' | 'error';
/** bad-code: nobody is hosting that code; network: couldn't reach the server or the other phone */
export type LinkError = 'bad-code' | 'network';

export interface LinkHandlers {
  onMessage: (msg: unknown) => void;
  onStatus: (status: LinkStatus, error?: LinkError) => void;
  /** a (re)connected other phone is ready for messages */
  onConnect?: () => void;
}

export interface Link {
  send: (msg: unknown) => void;
  close: () => void;
}

/** each kind of game has its own codes, so a code can't join the wrong game */
export type LinkGame = 'sky' | 'sun';
const idPrefix = (game: LinkGame) => `mult-rocket-${game}-`;
const CODE_TRIES = 6;
/** giving up on reaching the other phone (e.g. the Wi-Fi keeps phones apart) */
const CONNECT_TIMEOUT_MS = 15000;

export function randomCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

async function loadPeer(): Promise<typeof Peer> {
  return (await import('peerjs')).default;
}

function errorType(err: unknown): string {
  return (err as { type?: string })?.type ?? '';
}

// Opens a peer under the given id, or rejects with the PeerJS error type.
function openPeer(PeerClass: typeof Peer, id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new PeerClass(id) : new PeerClass();
    const fail = (err: unknown) => {
      peer.destroy();
      reject(err);
    };
    peer.once('open', () => {
      peer.off('error', fail);
      resolve(peer);
    });
    peer.once('error', fail);
  });
}

// Lost contact with the introduction server (not with the other phone):
// get back on it under the same id, so a dropped guest can find us again.
function stayReachable(peer: Peer) {
  peer.on('disconnected', () => {
    if (!peer.destroyed) peer.reconnect();
  });
}

function wire(conn: DataConnection, handlers: LinkHandlers, onClose: () => void) {
  conn.on('data', (data) => handlers.onMessage(data));
  conn.on('close', onClose);
  conn.on('error', onClose);
}

// Opens the host's peer under a free code (re-rolled if someone else has it).
async function openHost(game: LinkGame, onStatus: LinkHandlers['onStatus']): Promise<{ code: string; peer: Peer }> {
  onStatus('connecting');
  const PeerClass = await loadPeer();
  let peer: Peer | null = null;
  let code = '';
  for (let i = 0; i < CODE_TRIES && !peer; i++) {
    code = randomCode();
    try {
      peer = await openPeer(PeerClass, idPrefix(game) + code);
    } catch (err) {
      if (errorType(err) !== 'unavailable-id') {
        onStatus('error', 'network');
        throw err;
      }
    }
  }
  if (!peer) {
    onStatus('error', 'network');
    throw new Error('no free code');
  }
  stayReachable(peer);
  onStatus('waiting');
  return { code, peer };
}

/** host a game: resolves with the code to show once the server has given us one */
export async function hostLink(handlers: LinkHandlers): Promise<{ code: string; link: Link }> {
  const { code, peer } = await openHost('sky', handlers.onStatus);

  let guest: DataConnection | null = null;
  peer.on('connection', (conn) => {
    // One other phone at a time, and the newest wins: a phone that slept or
    // lost Wi-Fi often leaves its old connection looking open for a while,
    // and it must still be able to come back. (Joining needs the code shown
    // on this screen, so in practice the newcomer is that same phone.)
    const old = guest;
    guest = conn;
    old?.close();
    conn.on('open', () => {
      handlers.onStatus('connected');
      handlers.onConnect?.();
    });
    wire(conn, handlers, () => {
      if (guest !== conn) return;
      guest = null;
      handlers.onStatus('lost');
    });
  });

  return {
    code,
    link: {
      send: (msg) => {
        if (guest?.open) guest.send(msg);
      },
      close: () => peer.destroy(),
    },
  };
}

export interface GroupHandlers {
  onStatus: LinkHandlers['onStatus'];
  /** a message from one of the phones, by its connection */
  onMessage: (from: string, msg: unknown) => void;
  onJoin: (conn: string) => void;
  onLeave: (conn: string) => void;
}

export interface Group {
  send: (conn: string, msg: unknown) => void;
  broadcast: (msg: unknown) => void;
  close: () => void;
}

/** host a game for several phones: each guest is told apart by its connection id */
export async function hostGroup(game: LinkGame, handlers: GroupHandlers): Promise<{ code: string; group: Group }> {
  const { code, peer } = await openHost(game, handlers.onStatus);
  const guests = new Map<string, DataConnection>();

  peer.on('connection', (conn) => {
    const id = conn.connectionId;
    conn.on('open', () => {
      guests.set(id, conn);
      handlers.onJoin(id);
    });
    conn.on('data', (data) => handlers.onMessage(id, data));
    const gone = () => {
      if (!guests.delete(id)) return;
      handlers.onLeave(id);
    };
    conn.on('close', gone);
    conn.on('error', gone);
  });

  return {
    code,
    group: {
      send: (id, msg) => {
        const conn = guests.get(id);
        if (conn?.open) conn.send(msg);
      },
      broadcast: (msg) => {
        for (const conn of guests.values()) if (conn.open) conn.send(msg);
      },
      close: () => peer.destroy(),
    },
  };
}

/** join the game hosted under a code */
export async function joinLink(code: string, handlers: LinkHandlers, game: LinkGame = 'sky'): Promise<Link> {
  handlers.onStatus('connecting');
  const PeerClass = await loadPeer();
  let peer: Peer;
  try {
    peer = await openPeer(PeerClass);
  } catch (err) {
    handlers.onStatus('error', 'network');
    throw err;
  }
  stayReachable(peer);
  const conn = peer.connect(idPrefix(game) + code, { reliable: true, serialization: 'json' });
  let settled = false;
  const timer = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    handlers.onStatus('error', 'network');
    peer.destroy();
  }, CONNECT_TIMEOUT_MS);

  peer.on('error', (err) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    handlers.onStatus('error', errorType(err) === 'peer-unavailable' ? 'bad-code' : 'network');
    peer.destroy();
  });
  conn.on('open', () => {
    settled = true;
    window.clearTimeout(timer);
    handlers.onStatus('connected');
    handlers.onConnect?.();
  });
  wire(conn, handlers, () => {
    if (!settled) return;
    handlers.onStatus('lost');
    peer.destroy();
  });

  return {
    send: (msg) => {
      if (conn.open) conn.send(msg);
    },
    close: () => {
      settled = true;
      window.clearTimeout(timer);
      peer.destroy();
    },
  };
}
