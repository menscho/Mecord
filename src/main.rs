#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;
mod cdp;
mod compile;
mod config;
mod discover;
mod fileserve;
mod host;
mod native;
mod paths;
mod plugins;
mod store;
mod themes;
mod ui;

use anyhow::{bail, Context, Result};
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct Args {
    vanilla: bool,
    safe: bool,
    diagnose: bool,
    reset: bool,
    shortcut: bool,
    channel: String,
    disable: Vec<String>,
}

fn parse_args() -> Args {
    let mut a = Args { vanilla: false, safe: false, diagnose: false, reset: false, shortcut: false, channel: "Discord".into(), disable: vec![] };
    for arg in std::env::args().skip(1) {
        match arg.as_str() {
            "--vanilla" => a.vanilla = true,
            "--safe-mode" | "--safe" | "--no-plugins" => a.safe = true,
            "--diagnose" => a.diagnose = true,
            "--reset" => a.reset = true,
            "--install-shortcut" => a.shortcut = true,
            "--ptb" => a.channel = "DiscordPTB".into(),
            "--canary" => a.channel = "DiscordCanary".into(),
            s if s.starts_with("--disable-plugin=") => a.disable.push(s["--disable-plugin=".len()..].to_string()),
            other => paths::log("warn", &format!("unknown flag {other}")),
        }
    }
    a
}

fn discord_running(channel: &str) -> bool {
    let name = format!("{channel}.exe");
    Command::new("tasklist").args(["/FI", &format!("IMAGENAME eq {name}"), "/NH"]).creation_flags(CREATE_NO_WINDOW).output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains(&name.to_lowercase())).unwrap_or(false)
}

fn kill_discord(channel: &str) {
    let _ = Command::new("taskkill").args(["/F", "/IM", &format!("{channel}.exe")]).creation_flags(CREATE_NO_WINDOW).output();
    for _ in 0..50 { if !discord_running(channel) { return } std::thread::sleep(Duration::from_millis(200)); }
}

fn port_alive(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(&std::net::SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_millis(500)).is_ok()
}

/// Make sure Discord is running with a debug endpoint; returns (port, browser ws path).
fn ensure_discord(install: &discover::Install, args: &Args) -> Result<(u16, String)> {
    let active = install.data_dir.join("DevToolsActivePort");
    if let Some((p, path)) = host::read_active_port(&active, Duration::ZERO) {
        if port_alive(p) { paths::log("info", "attaching to the running Discord"); return Ok((p, path)); }
    }
    if discord_running(&args.channel) {
        let ok = ui::confirm("Mecord", "Discord is already running without Mecord.\n\nRestart Discord now so Mecord can attach? (Unsent message drafts may be lost.)");
        if !ok { bail!("Discord is running without Mecord and restart was declined") }
        kill_discord(&args.channel);
    }
    let _ = std::fs::remove_file(&active);
    let mut cmd = Command::new(&install.exe);
    cmd.arg("--remote-debugging-port=0");
    // Chromium switches can only be set at process start, which is why the Performance Suite's GPU and renderer options live here.
    let cfg = config::Config::load();
    let perf = &cfg.v["plugins"]["performance-suite"];
    let on = |key: &str| perf["enabled"] == true && perf["settings"][key] == true;
    let mut flags: Vec<&str> = vec![];
    if on("gpu") { flags.extend(["--enable-gpu-rasterization", "--enable-zero-copy", "--ignore-gpu-blocklist"]); }
    if on("skiaGraphite") { flags.push("--enable-features=SkiaGraphite"); }
    if !flags.is_empty() {
        cmd.args(&flags);
        paths::log("info", &format!("launching Discord with flags: {}", flags.join(" ")));
    }
    cmd.spawn().context("starting Discord")?;
    host::read_active_port(&active, Duration::from_secs(25)).context("Discord did not open its debug endpoint")
}

fn main() {
    let args = parse_args();
    if let Err(e) = run(&args) {
        paths::log("error", &format!("{e:#}"));
        #[cfg(not(debug_assertions))]
        ui::error("Mecord", &format!("{e:#}"));
        #[cfg(debug_assertions)]
        eprintln!("mecord: {e:#}");
        std::process::exit(1);
    }
}

fn run(args: &Args) -> Result<()> {
    let install = discover::find(&args.channel)?;
    let version = install.exe.parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().trim_start_matches("app-").to_string()).unwrap_or_default();

    if args.vanilla {
        // Plain Discord, none of our code involved. If it's running already, just leave it alone.
        if !discord_running(&args.channel) { Command::new(&install.exe).spawn().context("starting Discord")?; }
        return Ok(());
    }
    if args.shortcut {
        let me = std::env::current_exe()?;
        let ps = format!("$s=(New-Object -ComObject WScript.Shell).CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'),'Mecord.lnk'));$s.TargetPath='{}';$s.IconLocation='{},0';$s.Description='Discord with Mecord';$s.Save()", me.display(), install.exe.display());
        let out = Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", &ps]).creation_flags(CREATE_NO_WINDOW).output()?;
        if !out.status.success() { bail!("could not create the shortcut: {}", String::from_utf8_lossy(&out.stderr)) }
        ui::error("Mecord", "A Mecord shortcut was added to your desktop. Use it instead of Discord's own shortcut.");
        return Ok(());
    }
    if args.reset {
        let cfg = paths::root().join("config.json");
        if cfg.exists() { std::fs::rename(&cfg, paths::backups().join(format!("config-{}.json", paths::now())))?; }
        ui::error("Mecord", "Settings were reset. The old file was kept in the backups folder.");
        return Ok(());
    }

    // Single instance.
    let _lock = match std::fs::OpenOptions::new().write(true).create(true).truncate(true).share_mode(0).open(paths::root().join("mecord.lock")) {
        Ok(f) => f,
        Err(_) => { paths::log("info", "another Mecord instance is running"); return Ok(()); }
    };
    store::recover();

    if !args.disable.is_empty() {
        let mut cfg = config::Config::load();
        for id in &args.disable { cfg.v["plugins"][id.as_str()]["enabled"] = serde_json::json!(false); }
        cfg.save();
    }

    loop {
        let (port, path) = ensure_discord(&install, args)?;
        let cdp = cdp::Cdp::connect(port, &path)?;
        let mut h = host::Host::new(cdp, host::Opts { safe: args.safe, diagnose: args.diagnose, discord_version: version.clone() });
        let res = h.run();
        native::stop_all();
        if matches!(res, Ok(true)) {
            // The page asked for a restart (Health page → Restart Discord). Relaunch straight away.
            paths::log("info", "restarting Discord at the user's request");
            kill_discord(&args.channel);
            continue;
        }
        paths::log("info", &format!("disconnected: {}", res.err().map(|e| format!("{e:#}")).unwrap_or_default()));
        // Discord exited. If it comes straight back (self-update restart), offer to re-attach; otherwise we're done.
        std::thread::sleep(Duration::from_secs(5));
        if !discord_running(&args.channel) { return Ok(()); }
    }
}
