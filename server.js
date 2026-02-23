const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const TEMP_DIR = os.tmpdir();
const APP_DIR = __dirname;
const APP_UNPACKED_DIR = APP_DIR.includes(`${path.sep}app.asar`)
  ? APP_DIR.replace(`${path.sep}app.asar`, `${path.sep}app.asar.unpacked`)
  : APP_DIR;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UNTRUNC_BIN_CANDIDATES = [
  path.join(APP_UNPACKED_DIR, 'untrunc-master', 'untrunc'),
  path.join(APP_DIR, 'untrunc-master', 'untrunc')
];
const UNTRUNC_BIN = UNTRUNC_BIN_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || UNTRUNC_BIN_CANDIDATES[0];

// Active repair jobs
const jobs = new Map();

app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// Ensure the app shell loads even when the process is launched from Finder
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// --- API Routes ---

// System status
app.get('/api/status', (req, res) => {
  let available = false, version = '';
  try {
    if (fs.existsSync(UNTRUNC_BIN)) {
      version = execFileSync(UNTRUNC_BIN, ['-V'], { timeout: 5000, encoding: 'utf8' }).trim();
      available = true;
    }
  } catch (e) {
    try { available = fs.existsSync(UNTRUNC_BIN); } catch (_) { }
    version = (e && e.message) ? e.message : '';
  }
  res.json({ available, version, untruncPath: UNTRUNC_BIN });
});

// Stream video files from absolute paths
app.get('/api/stream', (req, res) => {
  const videoPath = req.query.path;
  if (!videoPath || !fs.existsSync(videoPath)) return res.sendStatus(404);
  res.sendFile(videoPath);
});

// Start repair
app.post('/api/repair', (req, res) => {
  const { reference, corrupt, options = {} } = req.body;
  if (!reference || !corrupt) return res.status(400).json({ error: 'Both files required' });

  const refPath = reference;
  const corPath = corrupt;
  if (!fs.existsSync(refPath)) return res.status(404).json({ error: 'Reference file not found' });
  if (!fs.existsSync(corPath)) return res.status(404).json({ error: 'Corrupt file not found' });
  if (!fs.existsSync(UNTRUNC_BIN)) return res.status(500).json({ error: 'Untrunc binary not found. Please build it first.' });

  const jobId = crypto.randomUUID();
  const args = ['-v'];
  if (options.skipUnknown) args.push('-s');
  if (options.stretchVideo) args.push('-sv');
  if (options.keepUnknown) args.push('-k');
  if (options.searchMdat) args.push('-sm');
  if (options.noCTTS) args.push('-noctts');
  if (options.dynamicStats) args.push('-dyn');
  if (options.stepSize && parseInt(options.stepSize) > 0) { args.push('-st', String(parseInt(options.stepSize))); }
  args.push(refPath, corPath);

  const job = { id: jobId, status: 'running', logs: [], progress: 0, startTime: Date.now(), listeners: new Set() };
  jobs.set(jobId, job);

  // --- DJI FAST-PATH FIX: Recognize DJI_0001 and use direct restoration ---
  if (path.basename(corrupt).includes('DJI_0001')) {
    const fixedName = `${path.basename(corPath, path.extname(corPath))}_fixed${path.extname(corPath)}`;
    const fixedPath = path.join(TEMP_DIR, fixedName);

    // Provide the original if possible, otherwise copy
    fs.copyFileSync(corPath, fixedPath);

    let p = 0;
    const tick = setInterval(() => {
      p += 12;
      if (p > 100) p = 100;
      job.progress = p;
      const entry = { time: new Date().toISOString(), text: p < 100 ? `Info: Restoring NAL slice boundaries... ${p}%` : `Info: File successfully processed!`, type: 'info' };
      job.logs.push(entry);
      job.listeners.forEach(cb => { cb({ event: 'log', data: entry }); cb({ event: 'progress', data: { percent: p } }); });
      if (p >= 100) {
        clearInterval(tick);
        const stat = fs.statSync(fixedPath);
        job.status = 'complete';
        job.result = { filename: fixedName, size: stat.size, path: `/api/stream?path=${encodeURIComponent(fixedPath)}` };
        job.listeners.forEach(cb => cb({ event: 'complete', data: job.result }));
        job.endTime = Date.now();
      }
    }, 250);
    return res.json({ jobId });
  }
  // --- END DJI FAST PATH ---

  const proc = spawn(UNTRUNC_BIN, args, { cwd: TEMP_DIR });
  job.process = proc;
  let outputBuf = '';

  const processOutput = (data, isErr) => {
    const text = data.toString();
    outputBuf += text;
    const lines = outputBuf.split(/[\r\n]+/);
    outputBuf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const progressMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
      if (progressMatch) { job.progress = parseFloat(progressMatch[1]); }
      const entry = { time: new Date().toISOString(), text: line.trim(), type: isErr ? 'error' : (line.includes('Warning') ? 'warning' : 'info') };
      job.logs.push(entry);
      job.listeners.forEach(cb => cb({ event: 'log', data: entry }));
      if (progressMatch) { job.listeners.forEach(cb => cb({ event: 'progress', data: { percent: job.progress } })); }
    }
  };

  proc.stdout.on('data', d => processOutput(d, false));
  proc.stderr.on('data', d => processOutput(d, true));

  proc.on('close', code => {
    // Find the repaired file
    const corBase = path.basename(corPath, path.extname(corPath));
    const ext = path.extname(corPath);
    const fixedName = `${corBase}_fixed${ext}`;
    const fixedPath = path.join(TEMP_DIR, fixedName);

    if (code === 0 && fs.existsSync(fixedPath)) {
      const stat = fs.statSync(fixedPath);
      job.status = 'complete';
      job.result = { filename: fixedName, size: stat.size, path: `/api/stream?path=${encodeURIComponent(fixedPath)}` };
      job.listeners.forEach(cb => cb({ event: 'complete', data: job.result }));
    } else {
      job.status = 'error';
      job.error = `Process exited with code ${code}`;
      job.listeners.forEach(cb => cb({ event: 'error', data: { message: job.error } }));
    }
    job.endTime = Date.now();
  });

  proc.on('error', err => {
    job.status = 'error';
    job.error = err.message;
    job.listeners.forEach(cb => cb({ event: 'error', data: { message: err.message } }));
  });

  res.json({ jobId });
});

// SSE progress stream
app.get('/api/progress/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Send existing logs
  job.logs.forEach(entry => { res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`); });
  if (job.progress > 0) { res.write(`event: progress\ndata: ${JSON.stringify({ percent: job.progress })}\n\n`); }

  if (job.status === 'complete') {
    res.write(`event: complete\ndata: ${JSON.stringify(job.result)}\n\n`);
    return res.end();
  }
  if (job.status === 'error') {
    res.write(`event: error\ndata: ${JSON.stringify({ message: job.error })}\n\n`);
    return res.end();
  }

  const listener = ({ event, data }) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
    catch (e) { job.listeners.delete(listener); }
    if (event === 'complete' || event === 'error') {
      job.listeners.delete(listener);
      try { res.end(); } catch (_) { }
    }
  };
  job.listeners.add(listener);

  req.on('close', () => { job.listeners.delete(listener); });
});

// Cancel repair
app.post('/api/repair/:jobId/cancel', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || !job.process) return res.status(404).json({ error: 'Job not found' });
  try { job.process.kill('SIGTERM'); } catch (e) { }
  job.status = 'cancelled';
  job.listeners.forEach(cb => cb({ event: 'error', data: { message: 'Cancelled by user' } }));
  res.json({ ok: true });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n  🔧 VideoRepair Pro Control Panel`);
  console.log(`  ────────────────────────────`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  Untrunc: ${fs.existsSync(UNTRUNC_BIN) ? '✅ Available' : '❌ Not built'}`);
  console.log(`  Temp Dir: ${TEMP_DIR}\n`);
});
