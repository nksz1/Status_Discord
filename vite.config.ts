import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendPort = env.SERVER_PORT || env.PORT || "25133";

  return {
    plugins: [react()],
    server: {
      allowedHosts: true,
      watch: {
        ignored: ["**/*.mp4"],
      },
      proxy: {
        "/api": `http://localhost:${backendPort}`,
      },
    },
  };
});
