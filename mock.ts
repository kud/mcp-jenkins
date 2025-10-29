#!/usr/bin/env tsx
/**
 * Minimal mock Jenkins server for local development (no Docker needed).
 * Implements subset of endpoints consumed by the MCP Jenkins server.
 */
import http from 'http';
import { parse } from 'url';

interface Build {
  number: number;
  result: string | null; // null while running
  building: boolean;
  duration: number; // ms
  timestamp: number; // epoch ms
  url: string;
  log: string;
}

interface JobData { name: string; builds: Build[] }

const jobs: Record<string, JobData> = {};

function seedJob(name: string) {
  if (jobs[name]) return;
  const now = Date.now();
  const build: Build = {
    number: 1,
    result: 'SUCCESS',
    building: false,
    duration: 4200,
    timestamp: now - 4200,
    url: `http://localhost:5050/job/${encodeURIComponent(name)}/1/`,
    log: 'Started by seed\nCompiling...\nFinished: SUCCESS'
  };
  jobs[name] = { name, builds: [build] };
}

seedJob('demo-job');

const send = (res: http.ServerResponse, code: number, body: any, headers: Record<string,string> = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  if (!req.url) return send(res, 404, { error: 'no url' });
  const { pathname } = parse(req.url, true);
  if (!pathname) return send(res, 404, { error: 'no path' });

  // Crumb endpoint (optional)
  if (pathname === '/crumbIssuer/api/json') {
    return send(res, 200, { crumbRequestField: 'Jenkins-Crumb', crumb: 'mock-crumb' });
  }

  // Match job patterns
  const jobRegex = /^\/job\/([^/]+)(?:\/(\d+)|\/lastBuild)?(\/api\/json|\/consoleText)?$/;
  const m = pathname.match(jobRegex);
  if (m) {
    const jobName = decodeURIComponent(m[1]);
    const buildNumber = m[2] ? Number(m[2]) : undefined;
    const suffix = m[3];
    const job = jobs[jobName];

    // Trigger build endpoints
    if (req.method === 'POST' && (pathname.endsWith('/build') || pathname.endsWith('/buildWithParameters'))) {
      if (!job) seedJob(jobName);
      const j = jobs[jobName];
      const nextNum = Math.max(...j.builds.map(b => b.number)) + 1;
      const now = Date.now();
      const newBuild: Build = {
        number: nextNum,
        result: null,
        building: true,
        duration: 0,
        timestamp: now,
        url: `http://localhost:5050/job/${encodeURIComponent(jobName)}/${nextNum}/`,
        log: 'Build queued...\nRunning steps...'
      };
      j.builds.push(newBuild);
      // Simulate async completion
      setTimeout(() => {
        newBuild.result = Math.random() < 0.8 ? 'SUCCESS' : 'FAILURE';
        newBuild.building = false;
        newBuild.duration = Date.now() - now;
        newBuild.log += `\nFinished: ${newBuild.result}`;
      }, 1500);
      res.writeHead(201, { Location: `http://localhost:5050/queue/item/${Date.now()}/` });
      return res.end();
    }

    if (!job) return send(res, 404, { error: 'Job not found' });

    // Last build JSON
    if (suffix === '/api/json' && pathname.endsWith('/lastBuild/api/json')) {
      const last = job.builds[job.builds.length - 1];
      return send(res, 200, last);
    }

    // Specific build JSON
    if (suffix === '/api/json' && buildNumber) {
      const build = job.builds.find(b => b.number === buildNumber);
      if (!build) return send(res, 404, { error: 'Build not found' });
      return send(res, 200, build);
    }

    // Console text
    if (suffix === '/consoleText' && buildNumber) {
      const build = job.builds.find(b => b.number === buildNumber);
      if (!build) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Build not found');
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(build.log + '\n');
    }
  }

  // Queue item placeholder
  if (/^\/queue\/item\//.test(pathname)) {
    return send(res, 200, { stuck: false, why: null });
  }

  if (pathname === '/health') return send(res, 200, { ok: true });
  return send(res, 404, { error: 'not found' });
});

const port = Number(process.env.MOCK_JENKINS_PORT || 5050);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', msg: 'Mock Jenkins listening', port }));
});
