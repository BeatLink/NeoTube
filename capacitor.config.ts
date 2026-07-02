import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.neotube.app',
  appName: 'NeoTube',
  webDir: 'dist',
  // Server URL for live reload during mobile development:
  // server: { url: 'http://192.168.x.x:5173', cleartext: true },
  plugins: {
    NodeJS: {
      // Node.js backend files are built to public/nodejs/ and end up in dist/nodejs/
      nodeDir: 'nodejs',
    },
  },
}

export default config
