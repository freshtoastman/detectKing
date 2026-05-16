const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadTimers() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveTimers(timers) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(timers, null, 2));
}

const sseClients = new Set();

function broadcast(event, data) {
  for (const res of sseClients) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/timers', (_req, res) => {
  res.json(loadTimers());
});

app.post('/api/timers', (req, res) => {
  const { channel, monster, respawnMin } = req.body;
  if (!channel || !monster || !respawnMin) {
    return res.status(400).json({ error: '缺少必要欄位' });
  }

  const timer = {
    id: Date.now() + Math.random(),
    channel,
    monster,
    killTime: Date.now(),
    respawnMs: respawnMin * 60 * 1000,
  };

  const timers = loadTimers();
  timers.unshift(timer);
  saveTimers(timers);
  broadcast('update', timers);
  res.json(timer);
});

app.post('/api/timers/adjust', (req, res) => {
  const { id, adjustMs } = req.body;
  if (!id || !adjustMs) return res.status(400).json({ error: '缺少 id 或 adjustMs' });

  const timers = loadTimers();
  const timer = timers.find(t => t.id === id);
  if (!timer) return res.status(404).json({ error: '找不到計時器' });

  timer.respawnMs += adjustMs;
  if (timer.respawnMs < 0) timer.respawnMs = 0;

  saveTimers(timers);
  broadcast('update', timers);
  res.json(timer);
});

app.delete('/api/timers/:id', (req, res) => {
  const id = parseFloat(req.params.id);
  const timers = loadTimers().filter(t => t.id !== id);
  saveTimers(timers);
  broadcast('update', timers);
  res.json({ ok: true });
});

app.post('/api/timers/clear-respawned', (_req, res) => {
  const now = Date.now();
  const timers = loadTimers().filter(t => (t.killTime + t.respawnMs) > now);
  saveTimers(timers);
  broadcast('update', timers);
  res.json({ ok: true });
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
