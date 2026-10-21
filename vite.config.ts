import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/FCO/",
  plugins: [react(), tailwindcss()],
  // Biên dịch sẵn module chính và gói thư viện khi khởi động để lần mở trang đầu không phải chờ.
  server: {
    warmup: { clientFiles: ["./src/main.tsx", "./src/App.tsx", "./src/cinema/*.tsx"] },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client", "motion/react", "lucide-react", "three", "three/addons/objects/Reflector.js"],
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
  },
});
