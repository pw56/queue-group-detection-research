import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  return {
    base: mode === 'production' ? '/queue-group-detection-research/src/approach_10_change_detection_model/dist/' : './',
    plugins: [
      tailwindcss(),
    ]
  };
});
