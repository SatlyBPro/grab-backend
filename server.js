const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const TMP_DIR = '/tmp/downloads';
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace('www.', '');
    return (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host === 'facebook.com' ||
      host === 'm.facebook.com' ||
      host === 'fb.watch'
    );
  } catch {
    return false;
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/download', (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url' });
  }
  if (!isAllowedUrl(url)) {
    return res.status(400).json({ error: 'Only YouTube and Facebook links are supported' });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const outputTemplate = path.join(TMP_DIR, `${id}.%(ext)s`);

  const args = [
    '-f', 'mp4/best',
    '--no-playlist',
    '-o', outputTemplate,
    url
  ];

  const proc = spawn('yt-dlp', args);

  let stderr = '';
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error('yt-dlp failed:', stderr);
      return res.status(500).json({ error: 'Download failed. The link may be private, region-locked, or the site changed something on their end.' });
    }

    const files = fs.readdirSync(TMP_DIR).filter(f => f.startsWith(id));
    if (files.length === 0) {
      return res.status(500).json({ error: 'No file produced' });
    }

    const filePath = path.join(TMP_DIR, files[0]);
    const filename = `video-${id}.mp4`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on('close', () => {
      fs.unlink(filePath, () => {});
    });
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
