/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the built UI is plain files that Cloud Run (or Firebase Hosting) can serve.
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
