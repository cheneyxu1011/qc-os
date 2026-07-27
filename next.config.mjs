/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/prototype/qc",
        destination: "/",
        permanent: true
      },
      {
        source: "/prototype/mobile",
        destination: "/mobile",
        permanent: true
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: "/",
        destination: "/prototype/qc.html"
      }
    ];
  }
};

export default nextConfig;
