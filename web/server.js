import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import pty from "node-pty";
import { WebSocketServer } from "ws";
import {
  findTarget,
  HttpError,
  ensureDesktopCredentials,
  listTargets,
  readDesktopCredentials,
  readHermesConfig,
  removeTarget,
  saveHermesDefaults,
  saveTarget,
  targetEnvironment,
} from "./lib/config-store.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 8787);
const ansibleDir = "/app/ansible";
const staticDir = join(root, "out");
const backupDir = "/backups";
const jobHistoryFile = join(root, "..", ".config", "job-history.json");
const jobs = new Map();
const sockets = new Map();
const maxJobs = 30;
const maxLogChars = 200_000;
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
let activeJob = null;
let historySaveTimer = null;
let historySaveQueue = Promise.resolve();

const server = createServer((req, res) => {
  void route(req, res).catch((error) =>
    sendJson(res, error.statusCode || 500, { error: error.message }),
  );
});
const terminalServer = new WebSocketServer({
  noServer: true,
  maxPayload: 4096,
});

server.on("upgrade", (req, socket, head) => {
  if (!sameLocalOrigin(req) || !req.url?.startsWith("/api/terminal/")) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  terminalServer.handleUpgrade(req, socket, head, (webSocket) => {
    terminalServer.emit("connection", webSocket, req);
  });
});

terminalServer.on("connection", (webSocket, req) => {
  const jobId = decodeURIComponent(
    new URL(req.url, `http://${req.headers.host}`).pathname.split("/").pop(),
  );
  const job = jobs.get(jobId);
  if (!job?.terminal || !job.pty) {
    webSocket.close(1008, "Terminal is no longer running");
    return;
  }

  if (!sockets.has(jobId)) sockets.set(jobId, new Set());
  sockets.get(jobId).add(webSocket);
  webSocket.send(JSON.stringify({ type: "output", data: job.output }));

  webSocket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (
      message.type === "input" &&
      typeof message.data === "string" &&
      message.data.length <= 4096
    )
      job.pty.write(message.data);
    if (
      message.type === "resize" &&
      Number.isInteger(message.cols) &&
      Number.isInteger(message.rows)
    ) {
      job.pty.resize(
        Math.min(240, Math.max(20, message.cols)),
        Math.min(100, Math.max(5, message.rows)),
      );
    }
  });
  webSocket.on("close", () => sockets.get(jobId)?.delete(webSocket));
});

async function route(req, res) {
  if (!allowedHosts.has(req.headers.host || ""))
    return sendJson(res, 403, {
      error: "Open the panel at http://127.0.0.1:8787.",
    });
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (["POST", "PUT", "DELETE"].includes(req.method) && !sameLocalOrigin(req))
    return sendJson(res, 403, {
      error: "Requests must come from this local panel.",
    });

  if (req.method === "GET" && url.pathname === "/api/config") {
    const config = await readHermesConfig();
    return sendJson(res, 200, {
      defaults: config.hermes_defaults,
      activeJob,
    });
  }
  if (req.method === "PUT" && url.pathname === "/api/config") {
    const body = await readBody(req);
    return sendJson(res, 200, {
      defaults: await saveHermesDefaults(body.defaults || body),
    });
  }
  if (req.method === "GET" && url.pathname === "/api/targets")
    return sendJson(res, 200, { targets: await listTargets() });
  const desktopTarget = url.pathname.match(
    /^\/api\/targets\/([^/]+)\/desktop-connection$/,
  );
  if (req.method === "GET" && desktopTarget) {
    const id = decodeURIComponent(desktopTarget[1]);
    const target = await findTarget(id);
    const credentials = await readDesktopCredentials(id);
    if (!target || !credentials)
      return sendJson(res, 404, { error: "Najpierw uruchom instalację profilu." });
    const { desktopUrl } = targetEnvironment(
      target,
      (await readHermesConfig()).hermes_defaults,
    );
    return sendJson(res, 200, {
      url: desktopUrl,
      username: credentials.username,
      password: credentials.password,
    });
  }
  if (req.method === "POST" && url.pathname === "/api/targets") {
    const body = await readBody(req, 1_000_000);
    return sendJson(res, 201, { target: await saveTarget(body) });
  }
  if (req.method === "PUT" && url.pathname.startsWith("/api/targets/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const body = await readBody(req, 1_000_000);
    return sendJson(res, 200, { target: await saveTarget({ ...body, id }) });
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/targets/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    if (activeJob && jobs.get(activeJob)?.targetId === id)
      throw new HttpError(409, "Nie można usunąć profilu używanego przez zadanie.");
    await removeTarget(id);
    return sendJson(res, 200, { removed: true });
  }
  if (req.method === "GET" && url.pathname === "/api/backups") {
    const target = await findTarget(url.searchParams.get("targetId") || "local-podman");
    if (!target) return sendJson(res, 404, { error: "Nie znaleziono profilu." });
    const defaults = (await readHermesConfig()).hermes_defaults;
    const prefix = `${targetEnvironment(target, defaults).name}-`;
    const files = (await readdir(backupDir).catch(() => []))
      .filter(
        (name) =>
          name.startsWith(prefix) &&
          /^[A-Za-z0-9][A-Za-z0-9_.-]*[.]zip$/.test(name),
      )
      .sort()
      .reverse();
    return sendJson(res, 200, { files });
  }
  if (req.method === "GET" && url.pathname === "/api/jobs") {
    return sendJson(res, 200, {
      jobs: [...jobs.values()].map(publicJob).reverse(),
    });
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
    const job = jobs.get(url.pathname.split("/").pop());
    return job
      ? sendJson(res, 200, publicJob(job))
      : sendJson(res, 404, { error: "Job not found." });
  }
  if (req.method === "POST" && url.pathname === "/api/jobs")
    return startAnsibleJob(req, res);
  if (req.method === "POST" && url.pathname === "/api/terminals")
    return startTerminal(req, res);
  if (req.method === "DELETE" && url.pathname.startsWith("/api/jobs/"))
    return stopJob(res, url.pathname.split("/").pop());
  if (req.method === "GET") return serveStatic(url.pathname, res);
  return sendJson(res, 404, { error: "Not found." });
}

function sameLocalOrigin(req) {
  const host = req.headers.host || "";
  const origin = req.headers.origin;
  return allowedHosts.has(host) && origin === `http://${host}`;
}

async function readBody(req, maxSize = 16_384) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxSize) throw new HttpError(413, "Request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Request body must contain valid JSON.");
  }
}

async function startAnsibleJob(req, res) {
  const body = await readBody(req);
  if (activeJob)
    return sendJson(res, 409, {
      error: "Wait for the running task to finish first.",
    });

  const { action } = body;
  const target = await findTarget(body.targetId);
  if (!target) return sendJson(res, 404, { error: "Nie znaleziono profilu." });
  const backend = target.backend;
  const defaults = (await readHermesConfig()).hermes_defaults;
  const values = targetEnvironment(target, defaults);
  const allowedActions = ["install", "run", "stop", "connect", "backup", "restore"];
  if (
    !["podman", "docker", "k3s"].includes(backend) ||
    !allowedActions.includes(action)
  ) {
    return sendJson(res, 400, {
      error: "Choose a supported target and action.",
    });
  }
  const name = clean(body.name || values.name, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
  const namespace = clean(
    body.namespace || values.namespace,
    /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
  );
  const storage = clean(
    body.storage || values.storage,
    /^[0-9]+(Ki|Mi|Gi|Ti)$/,
  );
  const label = body.label ? clean(body.label, /^[A-Za-z0-9_.-]+$/) : "";
  const archive =
    action === "restore"
      ? clean(body.archive, /^[A-Za-z0-9][A-Za-z0-9_.-]*[.]zip$/)
      : "";
  const mode = body.mode === "cli" ? "cli" : "gateway";
  if (action === "restore" && body.confirmRestore !== true)
    return sendJson(res, 400, {
      error: "Confirm the restore before continuing.",
    });
  if (action === "run" && mode === "cli")
    return sendJson(res, 400, {
      error: "Use the browser terminal for the interactive CLI.",
    });
  if (action === "connect" && !values.desktopUrl)
    return sendJson(res, 400, {
      error: "Ustaw osiągalny adres Desktop w profilu Kubernetes.",
    });

  const desktopCredentials =
    ["install", "connect", "restore"].includes(action)
      ? await ensureDesktopCredentials(target.id)
      : null;

  const env = {
    ...process.env,
    HERMES_BACKEND: backend,
    HERMES_ACTION: action,
    HERMES_RESTORE_CONFIRMED: action === "restore" ? "yes" : "",
    HERMES_NAME: name,
    HERMES_NAMESPACE: namespace,
    HERMES_STORAGE: storage,
    HERMES_IMAGE: values.image,
    HERMES_DATA_PATH: values.dataPath,
    HERMES_MODE: mode,
    HERMES_LABEL: label,
    HERMES_ARCHIVE: archive,
    DOCKER_HOST: values.dockerHost,
    KUBECONFIG: values.kubeconfig,
    HERMES_DESKTOP_USERNAME: desktopCredentials?.username || "",
    HERMES_DESKTOP_PASSWORD: desktopCredentials?.password || "",
    HERMES_DESKTOP_SECRET: desktopCredentials?.secret || "",
    HERMES_DESKTOP_URL: values.desktopUrl,
    HERMES_DESKTOP_PUBLISHED_PORT: values.desktopPublishedPort,
  };
  const job = createJob({
    backend,
    action,
    terminal: false,
    targetId: target.id,
    targetName: target.name,
  });
  activeJob = job.id;
  const child = spawn(
    "ansible-playbook",
    ["playbook.yml", "--inventory", "localhost,", "--connection", "local"],
    {
      cwd: ansibleDir,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  job.child = child;
  child.stdout.on("data", (chunk) => appendOutput(job, chunk));
  child.stderr.on("data", (chunk) => appendOutput(job, chunk));
  child.on("error", (error) => finishJob(job, "failed", error.message));
  child.on("close", (code) =>
    finishJob(
      job,
      code === 0 ? "succeeded" : "failed",
      `\nAnsible exited with code ${code}.\n`,
    ),
  );
  return sendJson(res, 202, publicJob(job));
}

async function startTerminal(req, res) {
  const body = await readBody(req);
  if (activeJob)
    return sendJson(res, 409, {
      error: "Wait for the running task to finish first.",
    });
  const { action } = body;
  const target = await findTarget(body.targetId);
  if (!target) return sendJson(res, 404, { error: "Nie znaleziono profilu." });
  const backend = target.backend;
  const defaults = (await readHermesConfig()).hermes_defaults;
  const values = targetEnvironment(target, defaults);
  const name = clean(values.name, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
  const namespace = clean(values.namespace, /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
  const dataPath = clean(values.dataPath, /^\/[A-Za-z0-9_./-]+$/);
  if (
    !["podman", "docker", "k3s"].includes(backend) ||
    !["setup", "cli"].includes(action)
  ) {
    return sendJson(res, 400, {
      error: "Choose setup or CLI and a supported target.",
    });
  }

  const image = values.image;
  const overrides = JSON.stringify({
    spec: {
      volumes: [{ name: "data", persistentVolumeClaim: { claimName: name } }],
      containers: [
        {
          name: `${name}-interactive`,
          image,
          volumeMounts: [{ name: "data", mountPath: dataPath }],
        },
      ],
    },
  });
  const args =
    backend === "k3s"
      ? [
          "-n",
          namespace,
          "run",
          `${name}-interactive`,
          "--rm",
          "-i",
          "-t",
          "--restart=Never",
          `--image=${image}`,
          `--overrides=${overrides}`,
          "--",
          ...(action === "setup" ? ["setup"] : []),
        ]
      : [
          "run",
          "--rm",
          "-it",
          "-v",
          `${name}:${dataPath}`,
          image,
          ...(action === "setup" ? ["setup"] : []),
        ];
  const env = {
    ...process.env,
    DOCKER_HOST: values.dockerHost,
    KUBECONFIG: values.kubeconfig,
  };
  const command = backend === "k3s" ? "kubectl" : "docker";
  const job = createJob({
    backend,
    action,
    terminal: true,
    targetId: target.id,
    targetName: target.name,
  });
  activeJob = job.id;
  try {
    job.pty = pty.spawn(command, args, {
      name: "xterm-256color",
      cols: 100,
      rows: 30,
      cwd: "/app",
      env,
    });
  } catch (error) {
    finishJob(job, "failed", error.message);
    return sendJson(res, 500, { error: error.message });
  }
  job.pty.onData((data) => {
    appendOutput(job, data);
    for (const client of sockets.get(job.id) || [])
      if (client.readyState === 1)
        client.send(JSON.stringify({ type: "output", data }));
  });
  job.pty.onExit(({ exitCode }) =>
    finishJob(
      job,
      exitCode === 0 ? "succeeded" : "failed",
      `\nTerminal exited with code ${exitCode}.\n`,
    ),
  );
  return sendJson(res, 202, publicJob(job));
}

function createJob({ backend, action, terminal, targetId, targetName }) {
  const job = {
    id: randomUUID(),
    backend,
    targetId,
    targetName,
    action,
    terminal,
    status: "running",
    output: "",
    startedAt: new Date().toISOString(),
    endedAt: null,
    child: null,
    pty: null,
  };
  jobs.set(job.id, job);
  while (jobs.size > maxJobs) jobs.delete(jobs.keys().next().value);
  scheduleJobSave();
  return job;
}

function appendOutput(job, chunk) {
  job.output = (job.output + chunk.toString()).slice(-maxLogChars);
  scheduleJobSave();
}

function finishJob(job, status, message = "") {
  if (job.status !== "running") return;
  appendOutput(job, message);
  job.status = status;
  job.endedAt = new Date().toISOString();
  job.child = null;
  job.pty = null;
  for (const client of sockets.get(job.id) || [])
    client.close(1000, "Task finished");
  sockets.delete(job.id);
  if (activeJob === job.id) activeJob = null;
  scheduleJobSave();
}

async function restoreJobHistory() {
  let stored;
  try {
    stored = JSON.parse(await readFile(jobHistoryFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (!Array.isArray(stored)) throw new Error("Job history file must contain a JSON array.");

  for (const record of stored.slice(-maxJobs)) {
    if (!record || typeof record.id !== "string" || typeof record.startedAt !== "string")
      continue;
    const job = {
      ...record,
      output: String(record.output || "").slice(-maxLogChars),
      child: null,
      pty: null,
    };
    if (job.status === "running") {
      job.status = "failed";
      job.endedAt = new Date().toISOString();
      job.output += "\nPanel został uruchomiony ponownie; przerwane zadanie nie działa dalej.\n";
    }
    jobs.set(job.id, job);
  }
  await saveJobHistory();
}

function scheduleJobSave() {
  if (historySaveTimer) return;
  historySaveTimer = setTimeout(() => {
    historySaveTimer = null;
    void saveJobHistory();
  }, 500);
}

function saveJobHistory() {
  const contents = JSON.stringify([...jobs.values()].map(publicJob));
  historySaveQueue = historySaveQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(dirname(jobHistoryFile), { recursive: true });
      const temporaryFile = `${jobHistoryFile}.tmp`;
      await writeFile(temporaryFile, contents, "utf8");
      await rename(temporaryFile, jobHistoryFile);
    })
    .catch((error) => console.error(`Could not save job history: ${error.message}`));
  return historySaveQueue;
}

function publicJob(job) {
  return {
    id: job.id,
    backend: job.backend,
    targetId: job.targetId,
    targetName: job.targetName,
    action: job.action,
    terminal: job.terminal,
    status: job.status,
    output: job.output,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
  };
}

function stopJob(res, id) {
  const job = jobs.get(id);
  if (!job || job.status !== "running")
    return sendJson(res, 404, { error: "No running task found." });
  if (job.pty) job.pty.kill();
  else job.child?.kill("SIGTERM");
  appendOutput(
    job,
    "\nStop requested from the panel. Waiting for the process to exit.\n",
  );
  return sendJson(res, 200, publicJob(job));
}

function clean(value, pattern) {
  if (typeof value !== "string" || !pattern.test(value))
    throw new HttpError(400, "A form field contains an invalid value.");
  return value;
}

async function serveStatic(pathname, res) {
  let file = resolve(
    staticDir,
    `.${normalize(pathname === "/" ? "/index.html" : pathname)}`,
  );
  if (!file.startsWith(`${staticDir}${sep}`) && file !== staticDir)
    return sendJson(res, 403, { error: "Invalid path." });
  if (existsSync(file) && statSync(file).isDirectory())
    file = join(file, "index.html");
  else if (!existsSync(file) && !extname(file)) file = join(file, "index.html");
  if (!existsSync(file)) return sendJson(res, 404, { error: "Not found." });
  res.writeHead(200, {
    "Content-Type": contentType(file),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}

function contentType(file) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
      ".ico": "image/x-icon",
      ".json": "application/json; charset=utf-8",
    }[extname(file)] || "application/octet-stream"
  );
}

function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

restoreJobHistory()
  .then(() => {
    server.listen(port, "0.0.0.0", () =>
      console.log(
        `Hermes panel listening on port ${port}; publish it only on 127.0.0.1.`,
      ),
    );
  })
  .catch((error) => {
    console.error(`Could not restore job history: ${error.message}`);
    process.exitCode = 1;
  });
