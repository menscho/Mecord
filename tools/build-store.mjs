// Builds the catalog: bundles plugins/*/ and store-themes/*/, hashes every file, writes a monotonic, expiring, Ed25519-signed index.
//   node tools/build-store.mjs            -> store/
import * as esbuild from "esbuild";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const OUT = "store";
const KEY = "keys/store.key", PUB = "keys/store.pub";

function ensureKey() {
  if (!fs.existsSync(KEY)) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    fs.mkdirSync("keys", { recursive: true });
    fs.writeFileSync(KEY, privateKey.export({ type: "pkcs8", format: "pem" }));
    fs.writeFileSync(PUB, Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("hex"));
    console.log("generated new store signing key (keys/store.pub changed: rebuild mecord.exe)");
  }
  return crypto.createPrivateKey(fs.readFileSync(KEY));
}
const sha = b => crypto.createHash("sha256").update(b).digest("hex");

// Metadata lives in a header comment: "// @name Foo", "// @tags a, b", "// @native ps1 helper.ps1".
// Theme headers are CSS comments such as "/** @name Foo */", so the marker can follow //, /*, /** or *.
function parseHeader(src, id, required, label = id) {
  const h = {};
  for (const line of src.split(/\r?\n/).slice(0, 20)) {
    const mm = /^\s*(?:\/\/|\/\*\*?|\*)?\s*@(\w+)\s+(.*?)\s*(?:\*\/)?\s*$/.exec(line);
    if (mm) h[mm[1]] = mm[2];
  }
  for (const k of required) if (!h[k]) throw new Error(`${label}: missing @${k}`);
  const list = v => (v ? v.split(",").map(x => x.trim()).filter(Boolean) : []);
  const m = { id, name: h.name, version: h.version, description: h.description, author: h.author, tags: list(h.tags), category: h.category, capabilities: list(h.capabilities) };
  if (h.native) { const [kind, file] = h.native.split(/\s+/); m.native = { kind, file }; }
  return m;
}

const key = ensureKey();
const prev = fs.existsSync(`${OUT}/index.json`) ? JSON.parse(fs.readFileSync(`${OUT}/index.json`, "utf8")) : { version: 0 };
fs.rmSync(`${OUT}/plugins`, { recursive: true, force: true });
fs.rmSync(`${OUT}/themes`, { recursive: true, force: true });

const plugins = [];
for (const dir of fs.readdirSync("plugins", { withFileTypes: true }).filter(d => d.isDirectory())) {
  const root = path.join("plugins", dir.name);
  if (dir.name.startsWith("_")) continue; // shared libs
  const entry = ["index.tsx", "index.ts", "index.jsx", "index.js"].map(f => path.join(root, f)).find(fs.existsSync);
  if (!entry) throw new Error(`${root}: no index.* entry`);
  const m = parseHeader(fs.readFileSync(entry, "utf8"), dir.name, ["name", "version", "description"], `plugins/${dir.name}`);
  const res = await esbuild.build({
    entryPoints: [entry], bundle: true, write: false, format: "cjs", platform: "browser", target: "chrome128",
    external: ["@mecord/api"], jsx: "transform", jsxFactory: "Mecord.api.React.createElement", jsxFragment: "Mecord.api.React.Fragment",
    minify: true, legalComments: "none", logLevel: "warning",
  });
  const files = [{ path: "index.js", data: Buffer.from(res.outputFiles[0].contents) }];
  let native = null;
  if (m.native) {
    const data = fs.readFileSync(path.join(root, m.native.file));
    files.push({ path: m.native.file, data });
    native = { kind: m.native.kind, file: m.native.file, sha256: sha(data) };
  }
  const outDir = `${OUT}/plugins/${m.id}/${m.version}`;
  fs.mkdirSync(outDir, { recursive: true });
  const listing = files.map(f => ({ path: f.path, sha256: sha(f.data), size: f.data.length }));
  for (const f of files) fs.writeFileSync(path.join(outDir, f.path), f.data);
  plugins.push({
    id: m.id, name: m.name, version: m.version, description: m.description, author: m.author ?? "Mecord", tags: m.tags ?? [],
    category: m.category ?? null, capabilities: m.capabilities ?? [], native, files: listing, sha256: sha(Buffer.from(JSON.stringify(listing))),
  });
}
plugins.sort((a, b) => a.name.localeCompare(b.name));

// Themes are one CSS file each. They install like plugins, but only write a file into the themes folder.
const themes = [];
if (fs.existsSync("store-themes")) for (const dir of fs.readdirSync("store-themes", { withFileTypes: true }).filter(d => d.isDirectory())) {
  const root = path.join("store-themes", dir.name);
  const file = path.join(root, "theme.css");
  if (!fs.existsSync(file)) throw new Error(`${root}: no theme.css`);
  const src = fs.readFileSync(file, "utf8");
  const m = parseHeader(src, dir.name, ["name", "version", "description"], `store-themes/${dir.name}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(dir.name)) throw new Error(`${root}: theme folder names are lowercase letters, digits and dashes`);
  const data = Buffer.from(src);
  const outDir = `${OUT}/themes/${dir.name}/${m.version}`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "theme.css"), data);
  const listing = [{ path: "theme.css", sha256: sha(data), size: data.length }];
  themes.push({
    id: dir.name, name: m.name, version: m.version, description: m.description, author: m.author ?? "Mecord", tags: m.tags ?? [],
    files: listing, sha256: sha(Buffer.from(JSON.stringify(listing))),
  });
}
themes.sort((a, b) => a.name.localeCompare(b.name));

const index = JSON.stringify({ schema: 1, version: prev.version + 1, expires: Math.floor(Date.now() / 1000) + 90 * 86400, generated: Math.floor(Date.now() / 1000), plugins, themes });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/index.json`, index);
fs.writeFileSync(`${OUT}/index.json.sig`, crypto.sign(null, Buffer.from(index), key).toString("hex"));
console.log(`catalog v${prev.version + 1}: ${plugins.length} plugins (${plugins.filter(p => p.native).length} with native code), ${themes.length} themes`);
