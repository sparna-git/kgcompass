import "reflect-metadata";
import { AppConfig } from "./config/AppConfig";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { createMcpRouter } from "./mcp/server";

import { ConfigProvider } from "./config/ConfigProvider";
import { warmUpLunrIndexes } from "./reconciliation/warmUpLunrIndexes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  credentials: false,
};

app.use(cors(corsOptions));
app.use(express.json());

// mcp routes
app.use(
  "/mcp/:projectKey",
  (req, res, next) => {
    const projectKey = req.params.projectKey;
    const project =
      ConfigProvider.getInstance().getConfig().projects?.[projectKey];
    if (!project)
      return res.status(404).json({ error: `Unknown project: ${projectKey}` });
    next();
  },
  createMcpRouter(),
);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found", url: req.originalUrl });
});

// === Démarrage du serveur ===
app.listen(PORT, () => {
  console.log(`KGCompass MCP server listening on port ${PORT}`);
  for (const projectKey of AppConfig.getInstance().listProjects()) {
    console.log(`MCP server route: http://localhost:${PORT}/mcp/${projectKey}`);
  }

  // Until the indexes are ready, a reconciliation call waits for its index.
  warmUpLunrIndexes();
});
