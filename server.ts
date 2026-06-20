// Entry point para correr el servidor de forma local o en un entorno Node
// persistente (ej: Cloud Run / AI Studio). En Vercel, se usa en cambio
// /api/index.ts, que reutiliza la misma app de Express desde src/server/app.ts.
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { app } from "./src/server/app";

const PORT = 3000;

async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AML SERVER] Running on port http://localhost:${PORT}`);
  });
}

setupServer();
