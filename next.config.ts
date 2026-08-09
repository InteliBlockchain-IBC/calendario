import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      // Padrão restritivo em todo o site...
      {
        source: '/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      // ...menos no embed, cuja razão de existir é ser colocado em iframe
      // por outro domínio. Sem esta exceção o embed quebra em silêncio.
      {
        source: '/embed/:path*',
        headers: [
          { key: 'X-Frame-Options', value: '' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ]
  },
}

export default nextConfig
