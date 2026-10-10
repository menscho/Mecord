//! Mecord uninstaller. Run it from the Mecord folder: it removes Mecord's settings, plugins, themes, backups and logs,
//! the desktop shortcut, and the program files next to it. Discord itself is never touched.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONINFORMATION, MB_ICONWARNING, MB_OK, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNO};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// What the release puts next to uninstall.exe. Anything else in that folder is left alone.
const PROGRAM_FILES: [&str; 3] = ["mecord.exe", "QUICKSTART.txt", "uninstall.exe"];
const PROGRAM_DIRS: [&str; 1] = ["store"];

fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }

fn ask(title: &str, text: &str) -> bool {
    // Test hook: only compiled into debug builds, never into release.
    #[cfg(debug_assertions)]
    if env::var_os("MECORD_TEST_AUTOCONFIRM").is_some() { return true; }
    unsafe { MessageBoxW(std::ptr::null_mut(), wide(text).as_ptr(), wide(title).as_ptr(), MB_YESNO | MB_ICONWARNING | MB_TOPMOST | MB_SETFOREGROUND) == IDYES }
}

fn show(title: &str, text: &str, warn: bool) {
    #[cfg(debug_assertions)]
    if env::var_os("MECORD_TEST_AUTOCONFIRM").is_some() { eprintln!("{title}: {text}"); return; }
    let icon = if warn { MB_ICONWARNING } else { MB_ICONINFORMATION };
    unsafe { MessageBoxW(std::ptr::null_mut(), wide(text).as_ptr(), wide(title).as_ptr(), MB_OK | icon | MB_TOPMOST | MB_SETFOREGROUND); }
}

/// Mecord keeps everything it writes in %AppData%\Mecord.
fn data_dir() -> Option<PathBuf> { env::var_os("APPDATA").map(|a| PathBuf::from(a).join("Mecord")) }

fn powershell(script: &str) -> Result<String, String> {
    let out = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() { return Err(String::from_utf8_lossy(&out.stderr).trim().to_string()) }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Stops Mecord, and the native helper programs it started (those keep running when their parent is killed).
/// Best effort: if something is still running, the file removals below fail and say which file.
fn stop_mecord(data: &Path) {
    // The path goes in through the environment, so it never appears in this command line and can't match itself.
    let script = "Get-Process -Name mecord -ErrorAction SilentlyContinue | Stop-Process -Force; \
        $helpers = Join-Path $env:MECORD_DATA 'cache\\native'; \
        Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($helpers) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; \
        Wait-Process -Name mecord -Timeout 10 -ErrorAction SilentlyContinue";
    let _ = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("MECORD_DATA", data)
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

fn remove_data(data: &Path) -> Result<(), String> {
    // Only ever delete a folder that is really named Mecord.
    if data.file_name().map(|n| n != "Mecord").unwrap_or(true) { return Err(format!("refusing to delete {}", data.display())) }
    if !data.exists() { return Ok(()) }
    fs::remove_dir_all(data).map_err(|e| format!("{}: {e}", data.display()))
}

fn remove_shortcut() -> Result<(), String> {
    let desktop = powershell("[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetFolderPath('Desktop')")?;
    if desktop.is_empty() { return Err("could not find the desktop folder".into()) }
    let lnk = PathBuf::from(desktop).join("Mecord.lnk");
    if lnk.exists() { fs::remove_file(&lnk).map_err(|e| format!("{}: {e}", lnk.display()))?; }
    Ok(())
}

fn remove_program(dir: &Path, me_name: &str, problems: &mut Vec<String>) {
    for name in PROGRAM_FILES {
        // The running uninstaller removes itself last, once it has exited.
        if name == me_name { continue }
        let p = dir.join(name);
        if p.exists() { if let Err(e) = fs::remove_file(&p) { problems.push(format!("{}: {e}", p.display())); } }
    }
    for name in PROGRAM_DIRS {
        let p = dir.join(name);
        if p.exists() { if let Err(e) = fs::remove_dir_all(&p) { problems.push(format!("{}: {e}", p.display())); } }
    }
}

/// Deletes this exe and then its folder (only if empty), after the exe has exited.
fn schedule_self_delete(me: &Path, dir: &Path) {
    let line = format!("ping -n 4 127.0.0.1 >nul & del /F /Q \"{}\" & rmdir \"{}\"", me.display(), dir.display());
    let _ = Command::new("cmd.exe")
        .raw_arg(format!("/C \"{line}\""))
        // Not DETACHED_PROCESS: cmd needs a (hidden) console, or the del and rmdir below never run.
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

fn main() {
    let me = match env::current_exe() { Ok(p) => p, Err(_) => return show("Mecord", "Could not find the uninstaller's own location.", true) };
    let Some(dir) = me.parent().map(Path::to_path_buf) else { return show("Mecord", "Could not find the Mecord folder.", true) };
    let me_name = me.file_name().and_then(|n| n.to_str()).unwrap_or("uninstall.exe").to_string();
    let Some(data) = data_dir() else { return show("Mecord", "The APPDATA folder is not set, so nothing was removed.", true) };

    let text = format!(
        "Uninstall Mecord from this computer?\n\n\
         This removes:\n\
         - Mecord's settings, installed plugins, themes, backups and logs ({})\n\
         - the Mecord shortcut on your desktop\n\
         - Mecord.exe, QUICKSTART.txt and the store folder in {}\n\n\
         Backups you exported to your Documents folder are kept.\n\
         Discord is not changed. Restart Discord afterwards to remove Mecord from the running app.\n\n\
         Continue?",
        data.display(), dir.display());
    if !ask("Uninstall Mecord", &text) { return }

    let mut problems = Vec::new();
    stop_mecord(&data);
    if let Err(e) = remove_data(&data) { problems.push(format!("settings folder: {e}")); }
    if let Err(e) = remove_shortcut() { problems.push(format!("desktop shortcut: {e}")); }
    remove_program(&dir, &me_name, &mut problems);

    if problems.is_empty() {
        show("Mecord", "Mecord was removed.\n\nDiscord was not changed. Restart Discord to remove Mecord from the running app.", false);
    } else {
        show("Mecord", &format!("Mecord was only partly removed. These could not be removed:\n\n{}\n\nClose any Mecord windows and run the uninstaller again.", problems.join("\n")), true);
    }
    schedule_self_delete(&me, &dir);
}
