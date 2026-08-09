use std::io::Read;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const COLLECTOR_TIMEOUT: Duration = Duration::from_secs(20);

/// Runs a fixed collector script and returns its stdout.
///
/// SECURITY INVARIANT: the parameter is `&'static str` so only compile-time
/// constants can be executed — there is intentionally no way to run text that
/// originated from the frontend or any runtime source. Do not widen this
/// signature (see docs/SECURITY.md).
pub fn run_fixed_script(script: &'static str) -> Result<String, String> {
    let mut child = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("failed to start PowerShell: {e}"))?;

    let mut stdout = child.stdout.take().expect("stdout was piped");
    let (tx, rx) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        let _ = tx.send(buf);
    });

    match rx.recv_timeout(COLLECTOR_TIMEOUT) {
        Ok(buf) => {
            let _ = child.wait();
            let _ = reader.join();
            let text = String::from_utf8_lossy(&buf).trim().to_string();
            if text.is_empty() {
                Err("collector produced no output".into())
            } else {
                Ok(text)
            }
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            Err("collector timed out".into())
        }
    }
}

/// Runs a fixed script and parses its JSON output into `T`.
pub fn run_json<T: serde::de::DeserializeOwned>(script: &'static str) -> Result<T, String> {
    let out = run_fixed_script(script)?;
    serde_json::from_str(&out).map_err(|e| format!("unexpected collector output: {e}"))
}
