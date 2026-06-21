import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Docker bind mounts don't deliver inotify events into the container, so
    // Vite never sees file edits. Polling makes HMR reliable inside Docker.
    watch: { usePolling: true, interval: 200 },
  },
});
