use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const COLLECTOR_TIMEOUT: Duration = Duration::from_secs(20);
/// Collector output is small JSON; anything past this is a malfunction.
const MAX_OUTPUT_BYTES: u64 = 4 * 1024 * 1024;

/// Absolute path to the system PowerShell. Resolving by name would search the
/// exe's own directory and the CWD first, letting a same-user attacker shadow
/// the interpreter with a planted powershell.exe.
fn system_powershell() -> PathBuf {
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    PathBuf::from(system_root).join(r"System32\WindowsPowerShell\v1.0\powershell.exe")
}

/// Runs a fixed collector script and returns its stdout.
///
/// SECURITY INVARIANTS (see docs/SECURITY.md):
/// - The parameter is `&'static str` so only compile-time constants are
///   executed. This is a review convention backed by the type system, not an
///   absolute guarantee (leaked Strings could satisfy it) — never widen the
///   signature and never pass anything but a `const` script.
/// - Scripts must not contain BARE double-quote characters: powershell.exe
///   re-parses its raw command line, and an unescaped `"` would collide with
///   the quoting std applies to the argument. Use single quotes; when a
///   literal double-quote is genuinely needed (e.g. matching a quoted path in
///   startup.rs), build it with `$q = [char]34` rather than embedding `"`.
///   A backslash-escaped `\"` inside a single-quoted PS string does round-trip
///   correctly through std's arg quoting, but that is subtle — prefer [char]34.
/// - Every script must begin by pinning $env:PSModulePath to admin-writable
///   locations (see the collectors) so module autoloading cannot be hijacked
///   from the user-writable Documents module path.
/// - `-ExecutionPolicy AllSigned` ensures only signed modules load even if
///   the module path were subverted.
pub fn run_fixed_script(script: &'static str) -> Result<String, String> {
    let mut child = Command::new(system_powershell())
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "AllSigned",
            "-Command",
            script,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("failed to start PowerShell: {e}"))?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let (tx, rx) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.take(MAX_OUTPUT_BYTES).read_to_end(&mut buf);
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
            // Killing the child closes the pipe's write end, so the reader
            // normally exits promptly; give it a short grace period rather
            // than blocking the snapshot on a wedged handle (e.g. a grandchild
            // process that inherited stdout), then detach it.
            let _ = rx.recv_timeout(Duration::from_secs(2));
            Err("collector timed out".into())
        }
    }
}

/// Runs a fixed script and parses its JSON output into `T`.
pub fn run_json<T: serde::de::DeserializeOwned>(script: &'static str) -> Result<T, String> {
    let out = run_fixed_script(script)?;
    serde_json::from_str(&out).map_err(|e| format!("unexpected collector output: {e}"))
}
