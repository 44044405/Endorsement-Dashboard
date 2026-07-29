// Minimal static file server for the Endorsement Dashboard (web/index.html).
// The app itself talks to Supabase directly from the browser — this server's
// only job is to serve the static files, so it works the same on any host
// (Railway, Render, etc.) that can run a Node process.
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'web')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Endorsement Dashboard serving on port ${PORT}`));
