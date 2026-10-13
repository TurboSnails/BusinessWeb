import { build } from "esbuild";
import { chmod, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const repoDir = resolve(packageDir, "../..");

// identity.mjs reads TS catalog files at runtime in the repository. Embed their
// source text in the bundle so a package containing only dist can serve /companies.
const catalogPaths = ["companies.ts", "hsi.ts"];
const embeddedCatalogs = Object.fromEntries(await Promise.all(
  catalogPaths.map(async (name) => [name, await readFile(join(repoDir, "src/data", name), "utf8")]),
));

await build({
  entryPoints: [join(packageDir, "src/cli.mjs")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: join(packageDir, "dist/cli.mjs"),
  banner: { js: "#!/usr/bin/env node" },
  external: ["@earendil-works/pi-coding-agent"],
  plugins: [{
    name: "embed-valuation-catalogs",
    setup(buildContext) {
      buildContext.onLoad({ filter: /server\/valuation\/data\/identity\.mjs$/ }, async ({ path }) => {
        let contents = await readFile(path, "utf8");
        for (const [name, source] of Object.entries(embeddedCatalogs)) {
          const expression = `readFile(\n    fileURLToPath(new URL("../../../src/data/${name}", import.meta.url)),\n    "utf8",\n  )`;
          if (!contents.includes(expression))
            throw new Error(`无法嵌入估值公司目录：${name} 的源码读取形式已改变`);
          contents = contents.replace(expression, JSON.stringify(source));
        }
        return { contents, loader: "js" };
      });
    },
  }],
});
await chmod(join(packageDir, "dist/cli.mjs"), 0o755);
