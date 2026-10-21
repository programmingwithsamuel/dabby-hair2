import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        shop: 'shop.html',
        admin: 'admin.html',
      },
    },
  },
});
