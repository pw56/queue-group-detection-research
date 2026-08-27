import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({}) => {
  return {
    base: './',
    plugins: [
      tailwindcss(),
    ]
  };
});
