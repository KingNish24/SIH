import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';

// In local Bun dev mode, use node standalone adapter to avoid Windows Miniflare WebSocket incompatibilities.
// When building for Cloudflare deployment, use the official @astrojs/cloudflare adapter.
const isCloudflareBuild = process.env.BUILD_CF === 'true' || process.env.CF_PAGES === '1';

export default defineConfig({
  output: 'server',
  adapter: isCloudflareBuild
    ? cloudflare({
        imageService: 'passthrough',
      })
    : node({
        mode: 'standalone',
      }),
  integrations: [
    tailwind({
      applyBaseStyles: true,
    }),
  ],
});
