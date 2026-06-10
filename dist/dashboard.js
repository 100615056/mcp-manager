import { createServer } from 'http';
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCP Manager</title>
<meta http-equiv="refresh" content="5">
<style>
  body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;margin:0;padding:2rem}
  h1{font-size:1.4rem;font-weight:600;margin-bottom:1.5rem}
  table{width:100%;border-collapse:collapse;font-size:.9rem}
  th{text-align:left;padding:.5rem .75rem;border-bottom:1px solid #333;color:#888;font-weight:500}
  td{padding:.6rem .75rem;border-bottom:1px solid #1e1e1e}
  .badge{display:inline-block;padding:.2rem .55rem;border-radius:999px;font-size:.75rem;font-weight:600}
  .connected{background:#052e16;color:#4ade80}
  .dropped{background:#2d0a0a;color:#f87171}
  .degraded{background:#2d1a00;color:#fb923c}
  .failed{background:#1e0a2e;color:#c084fc}
  .unknown{background:#1e1e1e;color:#888}
  .ts{color:#555;font-size:.8rem}
  button{background:#1e1e1e;color:#e0e0e0;border:1px solid #333;padding:.3rem .75rem;border-radius:6px;cursor:pointer;font-size:.8rem}
  button:hover{background:#333}
  h2{font-size:1rem;margin:2rem 0 .75rem;color:#888}
</style>
</head>
<body>
<h1>MCP Manager</h1>
<div id="status"></div>
<h2>Recent Events</h2>
<div id="history"></div>
<script>
async function load(){
  const [s,h]=await Promise.all([fetch('/api/status').then(r=>r.json()),fetch('/api/history').then(r=>r.json())]);
  const badge=state=>\`<span class="badge \${state}">\${state}</span>\`;
  document.getElementById('status').innerHTML=\`<table><thead><tr><th>Server</th><th>State</th><th>Latency</th><th>Last seen</th><th>Restarts</th><th></th></tr></thead><tbody>\${s.map(sv=>\`<tr><td>\${sv.name}</td><td>\${badge(sv.state)}</td><td>\${sv.lastPingMs!=null?sv.lastPingMs+'ms':'—'}</td><td class="ts">\${sv.lastSeen?new Date(sv.lastSeen).toLocaleTimeString():'—'}</td><td>\${sv.restartAttempts}</td><td><button onclick="restart('\${sv.name}')">Restart</button></td></tr>\`).join('')}</tbody></table>\`;
  document.getElementById('history').innerHTML=\`<table><thead><tr><th>Time</th><th>Server</th><th>Event</th><th>Detail</th></tr></thead><tbody>\${h.map(e=>\`<tr><td class="ts">\${new Date(e.timestamp).toLocaleTimeString()}</td><td>\${e.serverName}</td><td>\${badge(e.event)}</td><td>\${e.detail??''}\${e.latencyMs!=null?' ('+e.latencyMs+'ms)':''}</td></tr>\`).join('')}</tbody></table>\`;
}
async function restart(name){await fetch('/api/restart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});load();}
load();
</script>
</body>
</html>`;
function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
}
export function startDashboard(port, daemon) {
    const server = createServer((req, res) => {
        const { method, url } = req;
        if (url === '/status' || url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(HTML);
            return;
        }
        if (url === '/api/status')
            return json(res, daemon.getStatus());
        if (url === '/api/history')
            return json(res, daemon.getHistory(100));
        if (url === '/api/restart' && method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const { name } = JSON.parse(body);
                    if (name)
                        daemon.restart(name);
                    json(res, { ok: true });
                }
                catch {
                    json(res, { error: 'invalid body' }, 400);
                }
            });
            return;
        }
        if (url === '/api/restart-all' && method === 'POST') {
            daemon.restartAll();
            return json(res, { ok: true });
        }
        json(res, { error: 'not found' }, 404);
    });
    server.listen(port, '127.0.0.1', () => {
        console.error(`[mcp-manager] Dashboard: http://localhost:${port}`);
    });
}
//# sourceMappingURL=dashboard.js.map