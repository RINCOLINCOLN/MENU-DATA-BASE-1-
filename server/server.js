import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { getDb } from './db/database.js';
import { initWebSocket } from './routes/websocket.js';

// Route imports
import authRoutes from './routes/auth.js';
import restaurantRoutes from './routes/restaurants.js';
import screenRoutes from './routes/screens.js';
import templateRoutes from './routes/templates.js';
import menuItemRoutes from './routes/menuItems.js';
import scheduleRoutes from './routes/schedules.js';
import tvDisplayRoutes from './routes/tvDisplay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files (videos, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve TV Display PWA static files
const tvDisplayPath = path.join(__dirname, '..', 'tv-display');
app.use(express.static(tvDisplayPath));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Mount API routes — tvDisplay (public) must come before screen routes (auth-protected)
app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/screens', tvDisplayRoutes);
app.use('/api/screens', screenRoutes);
app.use('/api', menuItemRoutes);   // routes are /screens/:id/menu-items -> /api/screens/:id/menu-items
app.use('/api', scheduleRoutes);   // routes are /screens/:id/schedules -> /api/screens/:id/schedules
app.use('/api/templates', templateRoutes);

// Fallback: serve index.html for TV display SPA
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(tvDisplayPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP server and initialize WebSocket
const server = http.createServer(app);
initWebSocket(server);

// Initialize database on startup
getDb();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Menuvo Server running on http://0.0.0.0:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/`);
  console.log(`TV Display: http://localhost:${PORT}/`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});

export default app;
