import { spawn } from "node:child_process";
import type { SandboxResult } from "./types";

export interface HostCommandParams {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stdin?: string;
  signal?: AbortSignal;
}

export async function runHostCommand(
  params: HostCommandParams
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      env: params.env,
      stdio: "pipe",
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const finish = (result: SandboxResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    if (params.signal) {
      const onAbort = () => {
        child.kill("SIGTERM");
      };
      params.signal.addEventListener("abort", onAbort, { once: true });
      child.once("close", () => {
        params.signal?.removeEventListener("abort", onAbort);
      });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      finish({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: error.message,
        exitCode: 1,
      });
    });

    child.on("close", (code) => {
      finish({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code ?? 1,
      });
    });

    if (params.stdin) {
      child.stdin.write(params.stdin);
    }
    child.stdin.end();
  });
}
