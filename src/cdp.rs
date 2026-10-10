use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::net::TcpStream;
use std::time::{Duration, Instant};
use tungstenite::{stream::MaybeTlsStream, Message, WebSocket};

pub struct Cdp {
    ws: WebSocket<MaybeTlsStream<TcpStream>>,
    next_id: u64,
    /// Events that arrived while waiting for a command response.
    queue: VecDeque<Value>,
}

impl Cdp {
    pub fn connect(port: u16, path: &str) -> Result<Self> {
        let stream = TcpStream::connect(("127.0.0.1", port))?;
        // The WebSocket handshake needs a patient read; a short timeout there fails the connection outright.
        stream.set_read_timeout(Some(Duration::from_millis(100)))?;
        let url = format!("ws://127.0.0.1:{port}{path}");
        let (ws, _) = tungstenite::client(url, MaybeTlsStream::Plain(stream))?;
        // Once connected, reads wait at most 10 ms, so replies and events are handled soon after they arrive.
        if let MaybeTlsStream::Plain(s) = ws.get_ref() { s.set_read_timeout(Some(Duration::from_millis(10)))?; }
        Ok(Self { ws, next_id: 0, queue: VecDeque::new() })
    }

    fn build(&mut self, session: Option<&str>, method: &str, params: Value) -> (u64, String) {
        self.next_id += 1;
        let mut msg = json!({ "id": self.next_id, "method": method, "params": params });
        if let Some(s) = session { msg["sessionId"] = json!(s); }
        (self.next_id, msg.to_string())
    }

    /// Send without waiting for the response (the response is dropped by `read`).
    pub fn send(&mut self, session: Option<&str>, method: &str, params: Value) -> Result<()> {
        let (_, text) = self.build(session, method, params);
        self.ws.send(Message::text(text))?;
        Ok(())
    }

    /// Send a command and wait for its response; unrelated events are queued for `read`.
    pub fn call(&mut self, session: Option<&str>, method: &str, params: Value) -> Result<Value> {
        let (id, text) = self.build(session, method, params);
        self.ws.send(Message::text(text))?;
        let deadline = Instant::now() + Duration::from_secs(20);
        while Instant::now() < deadline {
            let Some(v) = self.raw()? else { continue };
            if v["id"] == id {
                if let Some(err) = v.get("error") { bail!("{method}: {err}") }
                return Ok(v["result"].clone());
            }
            if v.get("method").is_some() { self.queue.push_back(v); }
        }
        Err(anyhow!("{method}: timed out"))
    }

    /// Next event (queued ones first); `None` on timeout. Command responses are skipped.
    pub fn read(&mut self) -> Result<Option<Value>> {
        if let Some(v) = self.queue.pop_front() { return Ok(Some(v)); }
        loop {
            match self.raw()? {
                Some(v) if v.get("method").is_some() => return Ok(Some(v)),
                Some(_) => continue,
                None => return Ok(None),
            }
        }
    }

    fn raw(&mut self) -> Result<Option<Value>> {
        match self.ws.read() {
            Ok(Message::Text(t)) => Ok(Some(serde_json::from_str(t.as_str())?)),
            Ok(Message::Close(_)) => bail!("CDP connection closed"),
            Ok(_) => Ok(None),
            Err(tungstenite::Error::Io(e)) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
}
