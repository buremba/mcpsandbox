import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { cli, createSandbox, fn, provider } from "../src/index";

function createTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean =
    sorted.reduce((sum, value) => sum + value, 0) / Math.max(sorted.length, 1);
  const percentile = (ratio: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;

  return {
    meanMs: Number(mean.toFixed(3)),
    p50Ms: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(percentile(0.95).toFixed(3)),
  };
}

async function measure(
  iterations: number,
  run: () => Promise<void>
): Promise<number[]> {
  const values: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await run();
    values.push(performance.now() - start);
  }
  return values;
}

const root = createTempDir("mcpsandbox-bench-");

try {
  const createTimes = await measure(50, async () => {
    const sandbox = await createSandbox({
      filesystem: { root, writable: true },
    });
    await sandbox.dispose();
  });

  const sandbox = await createSandbox({
    filesystem: { root, writable: true },
    commands: {
      slugify: fn({
        input: { text: "$1" },
        handler: ({ text }: { text: string }) =>
          text.toLowerCase().replace(/\s+/g, "-"),
      }),
      "provider.true": provider({
        command: "true",
      }),
      "cli.node": cli({
        command: process.execPath,
        args: ["-e", ""],
      }),
    },
  });

  await sandbox.run('echo "warmup"');
  await sandbox.run('slugify "Warm Up"');
  await sandbox.run("provider.true");
  await sandbox.run("cli.node");

  const echoTimes = await measure(200, async () => {
    await sandbox.run('echo "hello"');
  });

  const fnTimes = await measure(200, async () => {
    await sandbox.run('slugify "Hello Benchmark"');
  });

  const providerTimes = await measure(100, async () => {
    await sandbox.run("provider.true");
  });

  const cliTimes = await measure(100, async () => {
    await sandbox.run("cli.node");
  });

  await sandbox.dispose();

  const result = {
    machine: process.env.MCPSANDBOX_BENCH_MACHINE ?? "Apple M4 Pro",
    date: "2026-04-09",
    runtime: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
    },
    benchmarks: {
      createSandbox: stats(createTimes),
      runBuiltinEcho: stats(echoTimes),
      runFunctionCommand: stats(fnTimes),
      runProviderCommand: stats(providerTimes),
      runCliCommand: stats(cliTimes),
    },
  };

  console.log(JSON.stringify(result, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
