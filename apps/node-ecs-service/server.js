// server.js — a deliberately tiny web service.
// You will never need to change the logic here. The ONLY line you'll edit is
// APP_VERSION, which is how we prove a new image actually reached Fargate.

const express = require('express');
const os = require('os');

const app = express();

// ---------------------------------------------------------------------------
// PORT: read from an environment variable, fall back to 3000.
//
// WHY THIS MATTERS FOR CONTAINERS:
// The SAME image must run unchanged on your laptop, in GitHub Actions, and on
// ECS. The only thing that differs between those is configuration. So config
// comes from the environment at RUN time, never baked into the image at BUILD
// time. Bake in config and you need a separate image per environment — which
// defeats the entire point of an image being a promotable artifact.
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

// Bump this to 'v2', 'v3', ... to watch a deploy roll through the pipeline.
const APP_VERSION = 'v4-BROKEN';

// ---------------------------------------------------------------------------
// /health — the ALB target group will poll THIS path every 30 seconds.
//
// If it stops returning HTTP 200, the load balancer marks the task unhealthy,
// stops sending it traffic, and ECS kills and replaces it. A health endpoint
// must be cheap and must NOT check your database — otherwise one slow query
// takes down every task at once.
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(500).json({ status: 'broken on purpose' });
});

// ---------------------------------------------------------------------------
// / — returns the version and the hostname.
//
// os.hostname() inside a container returns the CONTAINER ID. With 2 Fargate
// tasks running, refreshing this page shows the hostname changing — visible
// proof that the load balancer is spreading traffic across tasks.
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    version: APP_VERSION,
    hostname: os.hostname(),
  });
});

// ---------------------------------------------------------------------------
// listen on 0.0.0.0, NOT 127.0.0.1.
//
// THIS IS A REAL AND COMMON CONTAINER BUG:
// 127.0.0.1 inside a container means "only this container". Your `-p 8080:3000`
// mapping arrives from OUTSIDE the container, so it would be refused and you'd
// get an empty reply with no error in the logs. 0.0.0.0 means "all interfaces".
// Same failure happens on ECS: the ALB health check gets connection refused,
// tasks cycle forever, and nothing in the logs explains why.
// ---------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  // console.log writes to stdout.
  // stdout -> `docker logs` locally -> CloudWatch Logs on ECS.
  // If you write logs to a FILE inside the container instead, they are
  // invisible on ECS and lost when the task dies.
  console.log(`listening on port ${PORT}, version ${APP_VERSION}`);
});
