/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/prototype/qc.html",
        permanent: false
      }
    ];
  }
};

export default nextConfig;

