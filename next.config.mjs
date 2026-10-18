/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["three"],
  async redirects() {
    return [{ source: "/flat", destination: "/text", permanent: true }];
  },
};

export default nextConfig;
