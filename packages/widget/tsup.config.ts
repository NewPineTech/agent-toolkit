import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'hooks/useAgentChat': 'src/hooks/useAgentChat.ts',
      'embed-loader': 'src/embed-loader.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    clean: false,
    external: ['react', 'react-dom'],
  },
  {
    entry: { 'embed': 'src/embed-loader.ts' },
    format: ['iife'],
    globalName: 'AgentToolkitEmbed',
    clean: false,
  },
  {
    entry: { 'standalone': 'src/standalone.tsx' },
    format: ['iife'],
    globalName: 'AgentToolkitWidget',
    noExternal: [/.*/],
    platform: 'browser',
    clean: false,
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  },
]);
