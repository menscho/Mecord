use anyhow::{bail, Result};
use std::path::PathBuf;

pub struct Install {
    pub exe: PathBuf,
    /// Electron user-data dir (where DevToolsActivePort is written).
    pub data_dir: PathBuf,
}

/// Locate the newest `app-x.y.z\<Channel>.exe` for a channel.
pub fn find(channel: &str) -> Result<Install> {
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let roaming = std::env::var_os("APPDATA").map(PathBuf::from);
    let (Some(local), Some(roaming)) = (local, roaming) else { bail!("LOCALAPPDATA/APPDATA not set") };
    let root = local.join(channel);
    let mut apps: Vec<(Vec<u32>, PathBuf)> = std::fs::read_dir(&root)
        .map_err(|e| anyhow::anyhow!("{} not found: {e}", root.display()))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let ver = name.strip_prefix("app-")?;
            let parts = ver.split('.').map(|p| p.parse().ok()).collect::<Option<Vec<u32>>>()?;
            Some((parts, e.path()))
        })
        .collect();
    apps.sort();
    let Some((_, dir)) = apps.pop() else { bail!("no app-* directory in {}", root.display()) };
    let exe = dir.join(format!("{channel}.exe"));
    if !exe.exists() { bail!("{} missing", exe.display()) }
    Ok(Install { exe, data_dir: roaming.join(channel.to_lowercase()) })
}
