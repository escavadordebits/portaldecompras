import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { app } from './serverApp';
import { config } from './config';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  function listenWithFallback(port: number) {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${port}`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} in use, trying ${port + 1}...`);
        listenWithFallback(port + 1);
      } else {
        console.error('Server error:', err);
      }
    });
  }

  listenWithFallback(PORT);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
