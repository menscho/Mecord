//! Native (out-of-page) dialogs. Anything the page can spoof must be confirmed here instead.
use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONWARNING, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNO, MB_OK, MB_ICONERROR};

fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }

pub fn confirm(title: &str, text: &str) -> bool {
    // Test hook: only compiled into debug builds, never into release.
    #[cfg(debug_assertions)]
    if std::env::var_os("MECORD_TEST_AUTOCONFIRM").is_some() { return true; }
    unsafe { MessageBoxW(std::ptr::null_mut(), wide(text).as_ptr(), wide(title).as_ptr(), MB_YESNO | MB_ICONWARNING | MB_TOPMOST | MB_SETFOREGROUND) == IDYES }
}

pub fn error(title: &str, text: &str) {
    unsafe { MessageBoxW(std::ptr::null_mut(), wide(text).as_ptr(), wide(title).as_ptr(), MB_OK | MB_ICONERROR | MB_TOPMOST | MB_SETFOREGROUND); }
}
