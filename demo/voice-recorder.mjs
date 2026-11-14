// Voice recorder for the demo narration: shows each scene's text, records your microphone in the browser,
// and saves clean clips (trimmed, levelled) as <dir>/voice/NN.wav plus <dir>/durations.json.
// make_video.py --voice then lays each clip at the start of its scene.
//
//   node voice-recorder.mjs <dir>        then open http://localhost:4100
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEMO = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] || path.join(DEMO, 'recording'));
const PORT = Number(process.env.RECORDER_PORT || 4100);
const VOICE = path.join(OUT, 'voice');
fs.mkdirSync(VOICE, { recursive: true });

// The narration text comes straight from scenes.mjs, so it always matches the video.
const narrationFile = path.join(OUT, 'narration.json');
spawnSync(process.execPath, ['director.mjs'], { cwd: DEMO, env: { ...process.env, DEMO_NARRATION: narrationFile }, stdio: 'inherit' });
const narration = JSON.parse(fs.readFileSync(narrationFile, 'utf8'));

const pad = (i) => String(i).padStart(2, '0');
function seconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim()) || 0;
}
function status() {
  return narration.map((s) => {
    const wav = path.join(VOICE, `${pad(s.index)}.wav`);
    return { ...s, recorded: fs.existsSync(wav), seconds: fs.existsSync(wav) ? Number(seconds(wav).toFixed(1)) : null };
  });
}
function writeDurations() {
  const d = {};
  for (const s of status()) if (s.recorded) d[s.index] = Number((s.seconds + 0.7).toFixed(2));
  fs.writeFileSync(path.join(OUT, 'durations.json'), JSON.stringify(d, null, 2));
}

// Trim leading/trailing silence, remove rumble, gentle noise reduction, broadcast loudness.
const CLEAN = [
  'highpass=f=80',
  'afftdn=nf=-25',
  'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.12',
  'areverse',
  'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.2',
  'areverse',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
].join(',');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(DEMO, 'stage/recorder.html')));
  }
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(status()));
  }
  const m = url.pathname.match(/^\/api\/(clip|raw)\/(\d+)$/);
  if (m && m[1] === 'clip' && req.method === 'POST') {
    const i = Number(m[2]);
    const raw = path.join(VOICE, `${pad(i)}-take.webm`);
    const wav = path.join(VOICE, `${pad(i)}.wav`);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      fs.writeFileSync(raw, Buffer.concat(chunks));
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', CLEAN, '-ar', '48000', '-ac', '1', wav]);
      let err = '';
      ff.stderr.on('data', (d) => (err += d));
      ff.on('exit', (code) => {
        if (code !== 0) { res.writeHead(500); return res.end(err); }
        writeDurations();
        console.log(`scene ${i}: ${seconds(wav).toFixed(1)} s`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ seconds: Number(seconds(wav).toFixed(1)) }));
      });
    });
    return;
  }
  const w = url.pathname.match(/^\/voice\/(\d+)\.wav$/);
  if (w && fs.existsSync(path.join(VOICE, `${pad(w[1])}.wav`))) {
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(path.join(VOICE, `${pad(w[1])}.wav`)));
  }
  res.writeHead(404).end();
});
server.listen(PORT, () => console.log(`Voice recorder: http://localhost:${PORT}  (clips saved in ${VOICE})`));
