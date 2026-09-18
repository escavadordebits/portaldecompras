import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { app } from './serverApp';
import { config } from './config';

const PORT = 3000;

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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('Server error:', err);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
