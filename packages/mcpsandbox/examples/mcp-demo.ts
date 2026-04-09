import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { createSandbox, mcp } from "../src/index";

function startDemoServer(): Promise<{ url: string; close(): Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/tools/search_repositories") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as { input?: { q?: string } };
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            result: {
              query: parsed.input?.q ?? "",
              repos: ["lobu-ai/lobu", "lobu-ai/owletto"],
            },
          })
        );
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Failed to start demo MCP server");
      }

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              done();
            });
          }),
      });
    });
  });
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcpsandbox-mcp-"));
  const server = await startDemoServer();

  try {
    const sandbox = await createSandbox({
      name: "mcp-demo",
      filesystem: { root, writable: true },
      network: { allow: ["127.0.0.1"] },
      commands: {
        "github.search": mcp({
          server: server.url,
          tool: "search_repositories",
          input: { q: "$1" },
        }),
      },
    });

    console.log(
      "mcp result:",
      await sandbox.run('github.search "mcpsandbox demo"')
    );
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}

void main();
