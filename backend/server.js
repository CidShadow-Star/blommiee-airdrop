const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG = {
  clientId: process.env.X_CLIENT_ID || 'NU40U1djeVhlQXFJd0pTZTJyLXQ6MTpjaQ',
  clientSecret: process.env.X_CLIENT_SECRET || 'REPLACE_WITH_YOUR_TWITTER_CLIENT_SECRET',
  redirectUri: 'https://cidshadow-star.github.io/blommiee-airdrop/',
  blommieeTwitterId: process.env.BLOMMIEE_TWITTER_ID || 'REPLACE_WITH_TWITTER_USER_ID',
  port: process.env.PORT || 3456,
};

const tokens = new Map();

function httpsPost(url, data, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = new URLSearchParams(data).toString();
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64'),
        'Content-Length': Buffer.byteLength(postData),
        ...headers,
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/x/auth', async (req, res) => {
  try {
    const { code, code_verifier } = req.body;
    if (!code || !code_verifier) return res.status(400).json({ error: 'Missing code or code_verifier' });

    const tokenResponse = await httpsPost('https://api.twitter.com/2/oauth2/token', {
      code, grant_type: 'authorization_code', redirect_uri: CONFIG.redirectUri, code_verifier,
    });

    if (tokenResponse.status !== 200) return res.status(400).json({ error: 'Token exchange failed' });

    const { access_token, expires_in, refresh_token } = tokenResponse.body;
    const userResponse = await httpsGet('https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username', access_token);
    if (userResponse.status !== 200) return res.status(400).json({ error: 'Failed to get user info' });

    const user = userResponse.body.data;
    tokens.set(user.id, { accessToken: access_token, refreshToken: refresh_token, expiresAt: Date.now() + (expires_in * 1000), user });

    res.json({ success: true, user: { id: user.id, name: user.name, username: user.username, avatar: user.profile_image_url } });
  } catch (err) {
    console.error('[AUTH]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/x/verify-follow/:userId', async (req, res) => {
  try {
    const tokenData = tokens.get(req.params.userId);
    if (!tokenData) return res.status(401).json({ error: 'Not authenticated' });
    if (Date.now() > tokenData.expiresAt) { tokens.delete(req.params.userId); return res.status(401).json({ error: 'Token expired' }); }

    const followResponse = await httpsGet(`https://api.twitter.com/2/users/${req.params.userId}/following?max_results=1000`, tokenData.accessToken);
    if (followResponse.status !== 200) return res.status(400).json({ error: 'Failed to check follow' });

    const following = followResponse.body.data || [];
    const follows = following.some(u => u.id === CONFIG.blommieeTwitterId);
    res.json({ success: true, follows, username: tokenData.user.username });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats', (req, res) => res.json({ connected: tokens.size, uptime: process.uptime() }));

app.listen(CONFIG.port, () => console.log(`🌸 Blommiee X-Auth on port ${CONFIG.port}`));
