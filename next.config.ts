import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ignore the test file that pdf-parse tries to read during initialization
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
      
      // Add externals to prevent bundling issues
      config.externals = config.externals || [];
      config.externals.push({
        'canvas': 'commonjs canvas',
      });
    }
    return config;
  },
  // Add empty turbopack config to silence the warning
  // (webpack config is still used when --webpack flag is passed)
  turbopack: {},
};

export default nextConfig;
