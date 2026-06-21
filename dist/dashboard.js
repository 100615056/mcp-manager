import { createServer } from 'http';
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCP Manager — Server Health</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,system-ui,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh}
  .container{max-width:960px;margin:0 auto;padding:24px 20px}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #1e1e1e}
  h1{font-size:1.1rem;font-weight:700;letter-spacing:-0.3px;display:flex;align-items:center;gap:8px}
  h1 .dot{width:8px;height:8px;border-radius:50%;background:#4ade80;animation:pulse 2s infinite}
  .actions{display:flex;gap:8px}
  .btn{background:#161616;color:#c0c0c0;border:1px solid #2a2a2a;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;transition:all .15s}
  .btn:hover{background:#222;border-color:#444;color:#fff}
  .btn-danger{border-color:#7f1d1d40}
  .btn-danger:hover{background:#1a0505;border-color:#f87171}
  section{margin-bottom:32px}
  .section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:#555;margin-bottom:12px}
  .card{background:#111;border:1px solid #1e1e1e;border-radius:12px;overflow:hidden}
  .server-row{display:grid;grid-template-columns:1fr auto 80px 90px 60px 80px;align-items:center;padding:14px 16px;border-bottom:1px solid #1a1a1a;gap:12px;transition:background .1s}
  .server-row:last-child{border-bottom:none}
  .server-row:hover{background:#161616}
  .server-name{font-weight:600;font-size:13px;color:#f0f0f0}
  .server-scope{font-size:10px;color:#555;margin-top:2px}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
  .badge::before{content:'';width:6px;height:6px;border-radius:50%}
  .connected{background:#052e1680;color:#4ade80}.connected::before{background:#4ade80}
  .dropped{background:#2d0a0a80;color:#f87171}.dropped::before{background:#f87171}
  .degraded{background:#2d1a0080;color:#fb923c}.degraded::before{background:#fb923c}
  .failed{background:#1e0a2e80;color:#c084fc}.failed::before{background:#c084fc}
  .unknown{background:#1e1e1e80;color:#666}.unknown::before{background:#666}
  .restarted{background:#0a1e2d80;color:#60a5fa}.restarted::before{background:#60a5fa}
  .meta{font-size:12px;color:#666;font-variant-numeric:tabular-nums}
  .error-row{padding:0 16px 14px;font-size:11px;color:#f87171;background:#0a0505;border-bottom:1px solid #1a1a1a}
  .event-row{display:grid;grid-template-columns:80px 1fr auto 1fr;align-items:center;padding:10px 16px;border-bottom:1px solid #1a1a1a;gap:12px;font-size:12px}
  .event-row:last-child{border-bottom:none}
  .event-time{color:#444;font-variant-numeric:tabular-nums;font-size:11px}
  .event-server{color:#999;font-weight:500}
  .event-detail{color:#555;font-size:11px}
  .summary{display:flex;gap:20px;margin-bottom:20px}
  .stat{background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:14px 18px;flex:1;text-align:center}
  .stat-value{font-size:22px;font-weight:700;letter-spacing:-1px}
  .stat-label{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-top:4px}
  .empty{text-align:center;padding:40px;color:#444;font-size:13px}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  @media(max-width:640px){
    .server-row{grid-template-columns:1fr auto auto;gap:8px}
    .server-row .meta:nth-child(n+4){display:none}
    .event-row{grid-template-columns:60px 1fr auto}
    .event-detail{display:none}
  }
  @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<main class="container" role="main">
  <header>
    <h1><span class="dot" id="pulse" aria-hidden="true"></span> MCP Manager</h1>
    <div class="actions">
      <button class="btn" onclick="load()" aria-label="Refresh status">Refresh</button>
      <button class="btn btn-danger" onclick="restartAll()" aria-label="Restart all failed servers">Restart all failed</button>
    </div>
  </header>

  <div class="summary" id="summary" aria-label="Server summary"></div>

  <section aria-label="Server status">
    <div class="section-title">Servers</div>
    <div class="card" id="status" role="list"></div>
  </section>

  <section aria-label="Recent events">
    <div class="section-title">Recent Events</div>
    <div class="card" id="history" role="log"></div>
  </section>
</main>

<script>
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
async function load(){
  const [s,h]=await Promise.all([fetch('/api/status').then(r=>r.json()),fetch('/api/history').then(r=>r.json())]);
  const badge=state=>'<span class="badge '+state+'">'+state+'</span>';

  // Summary
  const total=s.length,up=s.filter(x=>x.state==='connected').length,down=s.filter(x=>x.state==='dropped'||x.state==='failed').length;
  document.getElementById('summary').innerHTML=
    '<div class="stat"><div class="stat-value">'+total+'</div><div class="stat-label">Total</div></div>'+
    '<div class="stat"><div class="stat-value" style="color:#4ade80">'+up+'</div><div class="stat-label">Connected</div></div>'+
    '<div class="stat"><div class="stat-value" style="color:'+(down>0?'#f87171':'#666')+'">'+down+'</div><div class="stat-label">Down</div></div>';

  // Pulse color
  document.getElementById('pulse').style.background=down>0?'#f87171':up===total?'#4ade80':'#fb923c';

  // Status table
  if(s.length===0){document.getElementById('status').innerHTML='<div class="empty">No servers discovered</div>';return}
  document.getElementById('status').innerHTML=s.map(sv=>{
    const ping=sv.lastPingMs!=null?sv.lastPingMs+'ms':'—';
    const seen=sv.lastSeen?new Date(sv.lastSeen).toLocaleTimeString():'—';
    const err=sv.lastError&&(sv.state==='dropped'||sv.state==='failed')?'<div class="error-row">'+esc(sv.lastError)+'</div>':'';
    return '<div class="server-row" role="listitem">'+
      '<div><div class="server-name">'+esc(sv.name)+'</div><div class="server-scope">'+esc(sv.scope)+'</div></div>'+
      '<div>'+badge(sv.state)+'</div>'+
      '<div class="meta">'+ping+'</div>'+
      '<div class="meta">'+seen+'</div>'+
      '<div class="meta">'+sv.restartAttempts+' restart'+(sv.restartAttempts===1?'':'s')+'</div>'+
      '<div><button class="btn" onclick="restart(\\''+esc(sv.name)+'\\')">Restart</button></div>'+
    '</div>'+err
  }).join('');

  // History
  if(h.length===0){document.getElementById('history').innerHTML='<div class="empty">No events yet</div>';return}
  document.getElementById('history').innerHTML=h.slice(0,30).map(e=>
    '<div class="event-row">'+
      '<div class="event-time">'+new Date(e.timestamp).toLocaleTimeString()+'</div>'+
      '<div class="event-server">'+esc(e.serverName)+'</div>'+
      '<div>'+badge(e.event)+'</div>'+
      '<div class="event-detail">'+(e.detail?esc(e.detail):'')+(e.latencyMs!=null?' ('+e.latencyMs+'ms)':'')+'</div>'+
    '</div>'
  ).join('');
}
async function restart(name){await fetch('/api/restart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});load()}
async function restartAll(){await fetch('/api/restart-all',{method:'POST'});load()}
load();setInterval(load,5000);
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