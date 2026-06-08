import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { fileURLToPath, URL } from 'node:url'

const projectEnvDir = fileURLToPath(new URL('..', import.meta.url))
const viteCacheDir = fileURLToPath(new URL('../.tmp/vite-cache', import.meta.url))
const officialEnvKeys = [
  'VITE_XIAOHONGSHU_OFFICIAL_URL',
  'VITE_DOUYIN_OFFICIAL_URL',
]

export default defineConfig(({ mode }) => {
  const projectEnv = loadEnv(mode, projectEnvDir, 'VITE_')
  const officialEnv = Object.fromEntries(
    officialEnvKeys.map((key) => [
      `import.meta.env.${key}`,
      JSON.stringify(projectEnv[key] || process.env[key] || ''),
    ])
  )

  return {
    cacheDir: viteCacheDir,
    define: officialEnv,
    plugins: [
      vue(),
      Components({ resolvers: [VantResolver()] }),
    ],
    server: {
      proxy: {
        '/api': 'http://localhost:3000'
      }
    }
  }
})
