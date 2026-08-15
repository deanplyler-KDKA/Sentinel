//! M-Lab NDT7 speed test.
//!
//! Why this exists alongside speedtest.rs: Cloudflare's free endpoint
//! rate-limits per public IP, which is fragile behind a shared VPN exit
//! address. M-Lab is an open measurement platform explicitly intended for
//! third-party speed tests, so it is the dependable option.
//!
//! PRIVACY — the important trade-off, disclosed in docs/PRIVACY.md and in the
//! UI next to the selector: **M-Lab publishes every measurement as open
//! research data, including the client IP address.** Cloudflare does not.
//! That is why the engine is a user choice rather than a silent default.
//!
//! Protocol (<https://www.measurementlab.net/tests/ndt/ndt7/>):
//!
//! 1. Ask the locate service for nearby servers.
//! 2. Download: open wss://…/ndt7/v7/download, read for ~10 s, count bytes.
//! 3. Upload: open wss://…/ndt7/v7/upload, send for ~10 s, count bytes.
//!
//! Both directions use the `net.measurementlab.ndt.v7` subprotocol.

use std::time::{Duration, Instant};

use serde::Deserialize;
use tungstenite::client::IntoClientRequest;
use tungstenite::Message;

const LOCATE_URL: &str = "https://locate.measurementlab.net/v2/nearest/ndt/ndt7";
const SUBPROTOCOL: &str = "net.measurementlab.ndt.v7";
/// The protocol specifies ~10 s per direction; we stop slightly earlier to
/// keep a full test comfortably under the UI's patience.
const MEASURE_WINDOW: Duration = Duration::from_secs(9);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Upload frame size. The spec allows scaling up to 16 MB; 1 MB is ample for
/// consumer uplinks and keeps memory flat.
const UPLOAD_FRAME_BYTES: usize = 1 << 20;

#[derive(Debug, Deserialize)]
struct LocateResponse {
    #[serde(default)]
    results: Vec<LocateResult>,
}

#[derive(Debug, Deserialize)]
struct LocateResult {
    #[serde(default)]
    machine: String,
    #[serde(default)]
    urls: std::collections::HashMap<String, String>,
}

pub struct Ndt7Outcome {
    pub down_mbps: f64,
    pub up_mbps: Option<f64>,
    pub server: String,
}

/// Picks the nearest server. The locate service returns them already ordered
/// by proximity, so the first entry with usable URLs wins.
fn locate() -> Result<(String, String, String), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let resp = client
        .get(LOCATE_URL)
        .send()
        .map_err(|e| format!("couldn't reach the measurement service: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "the measurement service is unavailable right now ({})",
            resp.status()
        ));
    }
    let body: LocateResponse = resp
        .json()
        .map_err(|e| format!("unexpected response from the measurement service: {e}"))?;

    for r in body.results {
        // Prefer the TLS endpoints; plain ws:// is offered too but we never
        // use it — measurements should not be trivially tamperable.
        let down = r.urls.get("wss:///ndt/v7/download").cloned();
        let up = r.urls.get("wss:///ndt/v7/upload").cloned();
        if let (Some(down), Some(up)) = (down, up) {
            return Ok((down, up, r.machine));
        }
    }
    Err("no measurement servers were offered".into())
}

type Socket = tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>;

/// Adjusts the read timeout on an established socket. The upload leg needs a
/// near-zero timeout so draining server measurements never stalls sending.
fn set_read_timeout(socket: &Socket, timeout: Duration) {
    match socket.get_ref() {
        tungstenite::stream::MaybeTlsStream::Plain(s) => {
            let _ = s.set_read_timeout(Some(timeout));
        }
        tungstenite::stream::MaybeTlsStream::Rustls(s) => {
            let _ = s.get_ref().set_read_timeout(Some(timeout));
        }
        _ => {}
    }
}

fn connect(url: &str) -> Result<Socket, String> {
    let mut request = url
        .into_client_request()
        .map_err(|e| format!("bad server URL: {e}"))?;
    request.headers_mut().insert(
        "Sec-WebSocket-Protocol",
        SUBPROTOCOL
            .parse()
            .map_err(|_| "bad subprotocol header".to_string())?,
    );
    let (socket, _resp) =
        tungstenite::connect(request).map_err(|e| format!("couldn't open the measurement connection: {e}"))?;

    // Reads must not block past the measurement window.
    set_read_timeout(&socket, CONNECT_TIMEOUT);
    Ok(socket)
}

/// Download: the server streams binary frames; we count what arrives. Text
/// frames are the server's own JSON measurements — counted too, since they
/// also crossed the wire, but they are tiny.
fn download(url: &str) -> Result<f64, String> {
    let mut socket = connect(url)?;
    let started = Instant::now();
    let mut received: u64 = 0;

    while started.elapsed() < MEASURE_WINDOW {
        match socket.read() {
            Ok(Message::Binary(b)) => received += b.len() as u64,
            Ok(Message::Text(t)) => received += t.len() as u64,
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(e) => {
                if received == 0 {
                    return Err(format!("download measurement failed: {e}"));
                }
                break;
            }
        }
    }
    let _ = socket.close(None);

    if received == 0 {
        return Err("download measurement produced no data".into());
    }
    let secs = started.elapsed().as_secs_f64().max(0.1);
    Ok((received as f64 * 8.0) / secs / 1e6)
}

/// Upload: we send frames as fast as the socket accepts them. The server's
/// own JSON measurements are authoritative for what actually arrived, so we
/// prefer them and fall back to our sent-byte count.
fn upload(url: &str) -> Result<f64, String> {
    let mut socket = connect(url)?;
    // Near-zero read timeout: see the drain loop below.
    set_read_timeout(&socket, Duration::from_millis(1));
    let payload = vec![0u8; UPLOAD_FRAME_BYTES];
    let started = Instant::now();
    let mut sent: u64 = 0;
    let mut server_bytes: Option<u64> = None;
    let mut server_elapsed_us: Option<u64> = None;

    while started.elapsed() < MEASURE_WINDOW {
        if let Err(e) = socket.write(Message::Binary(payload.clone())) {
            if sent == 0 {
                return Err(format!("upload measurement failed: {e}"));
            }
            break;
        }
        if socket.flush().is_err() {
            break;
        }
        sent += UPLOAD_FRAME_BYTES as u64;

        // Drain whatever measurement frames are already waiting, then move on.
        // socket.read() blocks, so the timeout is set to near-zero for this
        // leg: a blocking read after every write would throttle the very
        // thing we're trying to measure.
        loop {
            match socket.read() {
                Ok(Message::Text(t)) => {
                    if let Some((bytes, elapsed)) = parse_server_measurement(&t) {
                        server_bytes = Some(bytes);
                        server_elapsed_us = Some(elapsed);
                    }
                }
                Ok(Message::Close(_)) => break,
                Ok(_) => {}
                // Nothing pending — the expected case, not an error.
                Err(_) => break,
            }
        }
    }
    let _ = socket.close(None);

    if let (Some(bytes), Some(us)) = (server_bytes, server_elapsed_us) {
        if us > 0 && bytes > 0 {
            return Ok((bytes as f64 * 8.0) / (us as f64 / 1e6) / 1e6);
        }
    }
    if sent == 0 {
        return Err("upload measurement produced no data".into());
    }
    let secs = started.elapsed().as_secs_f64().max(0.1);
    Ok((sent as f64 * 8.0) / secs / 1e6)
}

/// Pulls BytesReceived + ElapsedTime out of an NDT7 measurement frame.
/// Returns None for frames that don't carry them — shape varies by server
/// version, so this is deliberately tolerant rather than strict.
fn parse_server_measurement(text: &str) -> Option<(u64, u64)> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    let tcp = v.get("TCPInfo")?;
    let bytes = tcp.get("BytesReceived").and_then(|b| b.as_u64())?;
    let elapsed = tcp.get("ElapsedTime").and_then(|e| e.as_u64())?;
    Some((bytes, elapsed))
}

pub fn run() -> Result<Ndt7Outcome, String> {
    let (down_url, up_url, machine) = locate()?;
    let down_mbps = download(&down_url)?;
    // An upload failure must not discard a good download result.
    let up_mbps = upload(&up_url).ok();
    Ok(Ndt7Outcome {
        down_mbps,
        up_mbps,
        server: machine,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_server_measurement_frame() {
        let frame = r#"{"AppInfo":{"NumBytes":123},"TCPInfo":{"BytesReceived":5000000,"ElapsedTime":2000000}}"#;
        let (bytes, elapsed) = parse_server_measurement(frame).expect("should parse");
        assert_eq!(bytes, 5_000_000);
        assert_eq!(elapsed, 2_000_000);
        // 5 MB in 2 s = 20 Mbps
        let mbps = (bytes as f64 * 8.0) / (elapsed as f64 / 1e6) / 1e6;
        assert!((mbps - 20.0).abs() < 0.01, "got {mbps}");
    }

    #[test]
    fn ignores_frames_without_tcpinfo() {
        assert!(parse_server_measurement(r#"{"AppInfo":{"NumBytes":1}}"#).is_none());
        assert!(parse_server_measurement("not json").is_none());
    }

    /// Live: cargo test ndt7_live -- --ignored --nocapture
    #[test]
    #[ignore]
    fn ndt7_live() {
        match run() {
            Ok(o) => println!(
                "NDT7 down={:.1} Mbps up={:?} server={}",
                o.down_mbps, o.up_mbps, o.server
            ),
            Err(e) => panic!("ndt7 failed: {e}"),
        }
    }
}
