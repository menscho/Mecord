//! TypeScript/JSX compilation for user plugins, via an esbuild binary embedded in this exe.
use crate::paths;
use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

static ESBUILD: &[u8] = include_bytes!("../vendor/esbuild.exe");
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn esbuild_path() -> Result<PathBuf> {
    let tag = hex::encode(&Sha256::digest(ESBUILD)[..6]);
    let p = paths::cache().join(format!("esbuild-{tag}.exe"));
    if std::fs::metadata(&p).ok().map(|m| m.len() as usize) != Some(ESBUILD.len()) {
        paths::write_atomic(&p, ESBUILD).context("extracting esbuild")?;
    }
    Ok(p)
}

/// Bundle one plugin entry (file) to a CommonJS string; `@mecord/api` stays external.
pub fn compile(entry: &Path) -> Result<String> {
    let exe = esbuild_path()?;
    let out = Command::new(exe)
        .arg(entry)
        .args([
            "--bundle", "--format=cjs", "--platform=browser", "--target=chrome128",
            "--external:@mecord/api", "--jsx=transform",
            "--jsx-factory=Mecord.api.React.createElement", "--jsx-fragment=Mecord.api.React.Fragment",
            "--log-level=error", "--color=false",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .context("running esbuild")?;
    if !out.status.success() {
        bail!("{}", String::from_utf8_lossy(&out.stderr).trim());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}
