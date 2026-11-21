import type { NextConfig } from "next"

// Politique de securite du contenu. 'unsafe-inline' reste necessaire pour les scripts et styles injectes par
// Next.js (hydratation, script de theme avant affichage) : un nonce imposerait un rendu dynamique de toutes les pages.
// Le reste est verrouille : pas de plugins, pas de <base> detourne, formulaires et connexions limites a l'origine.
const dev = process.env.NODE_ENV === "development"
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (dev ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Active uniquement pendant le build Docker : image finale reduite. Le build local et les tests ne changent pas.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ]
  },
  experimental: {
    cpus: 4,
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig