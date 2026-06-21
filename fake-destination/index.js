const express = require('express');
const fs = require('fs');

const PORT = parseInt(process.env.PORT || '4000', 10);
const CONTROL_FILE = process.env.DEMO_CONTROL_FILE || './demo-control.json';

const app = express();
// Accept any content type as raw text — we just echo/log it.
app.use(express.text({ type: '*/*', limit: '5mb' }));

function isRunning() {
  try {
    const raw = fs.readFileSync(CONTROL_FILE, 'utf8');
    return JSON.parse(raw).running !== false;
  } catch {
    // No control file yet → behave as up.
    return true;
  }
}

// Health is always green so the gateway can probe liveness independently.
app.get('/health', (_req, res) => res.status(200).json({ status: 'up' }));

app.post('/webhook', (req, res) => {
  const attempt = req.header('x-attempt-number') || '?';
  const deliveryId = req.header('x-webhook-id') || '?';
  const ts = new Date().toISOString();

  if (!isRunning()) {
    console.log(`[${ts}] DOWN  delivery=${deliveryId} attempt=${attempt} -> 500`);
    return res.status(500).json({ error: 'destination is down (demo)' });
  }

  console.log(
    `[${ts}] OK    delivery=${deliveryId} attempt=${attempt} -> 200 | body=${
      typeof req.body === 'string' ? req.body.slice(0, 200) : ''
    }`,
  );
  return res.status(200).json({ received: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Fake destination listening on :${PORT} (control file: ${CONTROL_FILE})`);
});
