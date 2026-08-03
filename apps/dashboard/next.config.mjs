/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/admin/user",
        destination: "/admin/users",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
