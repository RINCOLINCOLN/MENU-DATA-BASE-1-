import { WebSocketServer } from 'ws';

// Map of screen_slug -> Set of WebSocket connections
const screenClients = new Map();

// Map of screen_slug -> screen_id for broadcasting
const slugToScreenId = new Map();

/**
 * Initialize the WebSocket server on the HTTP server
 */
export function initWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');

    let connectedSlug = null;

    // Send a welcome message
    ws.send(JSON.stringify({ type: 'connected', message: 'Welcome to Menuvo WebSocket' }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'join' && msg.screen_slug) {
          // Leave any previous screen
          if (connectedSlug) {
            const clients = screenClients.get(connectedSlug);
            if (clients) {
              clients.delete(ws);
              if (clients.size === 0) screenClients.delete(connectedSlug);
            }
          }

          connectedSlug = msg.screen_slug;
          if (!screenClients.has(connectedSlug)) {
            screenClients.set(connectedSlug, new Set());
          }
          screenClients.get(connectedSlug).add(ws);

          slugToScreenId.set(connectedSlug, msg.screen_id || connectedSlug);

          ws.send(JSON.stringify({ type: 'joined', screen_slug: connectedSlug }));
          console.log(`Client joined screen: ${connectedSlug}`);
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      if (connectedSlug) {
        const clients = screenClients.get(connectedSlug);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) screenClients.delete(connectedSlug);
        }
      }
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });

    // Ping/pong keep-alive
    const interval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on('close', () => clearInterval(interval));
  });

  console.log('WebSocket server initialized on /ws');
  return wss;
}

/**
 * Broadcast an update to all clients connected to a specific screen
 */
export function broadcastScreenUpdate(screenIdOrSlug, data) {
  // Try both direct lookup and via slug map
  const clients = screenClients.get(screenIdOrSlug);
  if (clients) {
    const message = JSON.stringify({ type: 'update', ...data });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    }
  }
}
