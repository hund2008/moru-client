import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'MORU_')

  return {
    main: {
      define: {
        __MORU_MICROSOFT_CLIENT_ID__: JSON.stringify(
          process.env.MORU_MICROSOFT_CLIENT_ID ||
          env.MORU_MICROSOFT_CLIENT_ID ||
          ''
        )
      }
    },
    preload: {},
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [react()]
    }
  }
})