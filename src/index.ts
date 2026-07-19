#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnv } from "./env.js";
import { createServer } from "./server.js";

loadEnv(new URL("../.env", import.meta.url).pathname); // .env next to package root
loadEnv(".env"); // .env in cwd

if (!process.env.MERIT_API_ID || !process.env.MERIT_API_KEY) {
  console.error("Missing MERIT_API_ID and/or MERIT_API_KEY environment variables.");
  process.exit(1);
}

await createServer().connect(new StdioServerTransport());
