/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The PDF reader runs as-is on the server (it is not meant to be bundled).
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
