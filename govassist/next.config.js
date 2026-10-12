/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Application Requests accepts up to 4 files x 4MB through a server
  // action; Next's default 1MB body limit would reject them.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

module.exports = nextConfig;
