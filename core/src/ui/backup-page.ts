// Backup page: export the setup to one file, or restore one (merge or replace).
import { call } from "../bridge";
import { h } from "../features";
import { loaded } from "../plugins";
import { Mount, btn, modal, openFolder } from "./shell";

export const mountBackup: Mount = (tools, head, body) => {
  head.append(btn("Backups folder", () => openFolder("backups"), "ghost", "folder"));
  const build = () => {
    body.replaceChildren();
    const msg = h("div", { style: { color: "var(--muted)", marginTop: "10px", minHeight: "1.4em" } });
    const mode = h("select", { "aria-label": "Restore mode" }, h("option", { value: "merge" }, "Merge: keep what I have, add the backup"), h("option", { value: "replace" }, "Replace: make everything match the backup")) as HTMLSelectElement;
    const file = h("input", { type: "file", accept: ".json,application/json", "aria-label": "Backup file" }) as HTMLInputElement;
    const css = h("input", { type: "checkbox", id: "mecord-css" }) as HTMLInputElement;
    body.append(
      h("div", { class: "card" }, h("h3", null, "Export"), h("p", null, "Saves your settings, plugin choices and options, themes, looks, profiles, shortcuts and Quick CSS into one file in Documents. Passwords and API keys are left out."),
        btn("Export backup", async () => {
          try {
            const secrets: Record<string, string[]> = {};
            for (const [id, lp] of loaded) secrets[id] = Object.entries(lp.def?.settings ?? {}).filter(([, d]) => (d as any).secret).map(([k]) => k);
            const r = await call<{ path: string }>("backup.export", { secrets });
            msg.textContent = "Saved to " + r.path;
          } catch (e: any) { msg.textContent = e.message; }
        }, "primary", "backup")),
      h("div", { class: "card" }, h("h3", null, "Restore"), h("p", null, "Plugins in a backup are installed again through the store's checks, so a backup file can't bring in new code. Your current setup is saved first."),
        h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" } }, file, mode),
        h("label", { style: { display: "flex", gap: "8px", alignItems: "center", margin: "12px 0", color: "var(--muted)" } }, css, "Also overwrite my Quick CSS (merge mode)"),
        btn("Restore", async () => {
          const f = file.files?.[0]; if (!f) { msg.textContent = "Choose a backup file first."; return; }
          if (mode.value === "replace" && !(await modal("Replace your whole setup?", [h("p", null, "Everything is reset to match the backup. A snapshot of the current setup is saved first, so you can undo this.")], "Replace", true))) return;
          try { const r = await call<{ summary: string }>("backup.import", { json: await f.text(), mode: mode.value, overwriteCss: css.checked }); msg.textContent = r.summary + " Reloading…"; setTimeout(() => location.reload(), 1200); }
          catch (e: any) { msg.textContent = "Couldn't restore: " + e.message; }
        })), msg);
  };
  build();
  return () => build();
};
