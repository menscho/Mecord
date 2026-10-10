//! Compiles the signed plugin catalog (`store/`) into mecord.exe, so the exe still works when it is copied on its own.
//! If the store was never built, the table is empty and Mecord reports that instead of failing on a missing path.
use std::path::{Path, PathBuf};
use std::{env, fs};

fn main() {
    println!("cargo:rerun-if-changed=store");
    let store = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("store");
    let mut files = Vec::new();
    if store.join("index.json").exists() { collect(&store, &store, &mut files) }
    files.sort();

    let mut src = String::from("/// The signed catalog, compiled in by build.rs (empty if `store/` was not built).\npub static BUILT_IN_FILES: &[(&str, &[u8])] = &[\n");
    for (rel, path) in &files {
        src += &format!("    ({rel:?}, include_bytes!({:?})),\n", path.to_string_lossy());
    }
    src += "];\n";
    fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("embedded_store.rs"), src).unwrap();
}

fn collect(root: &Path, dir: &Path, out: &mut Vec<(String, PathBuf)>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect(root, &path, out);
        } else {
            let rel = path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
            out.push((rel, path));
        }
    }
}
