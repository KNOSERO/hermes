import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const projectDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const configDir = join(projectDir, ".config");
const secretDir = process.env.HERMES_SECRET_DIR || "/root/.ssh";
const hermesConfigFile = join(configDir, "hermes.yml");
const targetsFile = join(configDir, "targets.yml");

export async function readHermesConfig() {
  return (await readYaml(hermesConfigFile)) || { hermes_defaults: {} };
}

export async function saveHermesDefaults(input) {
  const current = await readHermesConfig();
  const defaults = {
    name: required(input.name, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/),
    namespace: required(input.namespace, /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/),
    storage: required(input.storage, /^[0-9]+(Ki|Mi|Gi|Ti)$/),
    data_path: required(input.data_path, /^\/[A-Za-z0-9_./-]+$/),
    image: required(
      input.image,
      /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$/,
    ),
  };
  await writeYaml(hermesConfigFile, {
    ...current,
    hermes_defaults: defaults,
  });
  return defaults;
}

export async function listTargets() {
  const stored = (await readYaml(targetsFile))?.targets || [];
  return [localTarget(), ...stored.map(publicTarget)];
}

export async function findTarget(id) {
  if (id === "local-podman") return localTarget();
  if (!isTargetId(id)) return null;
  const targets = (await readYaml(targetsFile))?.targets || [];
  const target = targets.find((item) => item.id === id);
  return target ? publicTarget(target) : null;
}

export async function saveTarget(input) {
  const config = (await readYaml(targetsFile)) || { targets: [] };
  const targets = config.targets || [];
  const existing = input.id ? targets.find((item) => item.id === input.id) : null;
  if (input.id && !existing) throw new HttpError(404, "Profil nie istnieje.");

  const backend = input.backend;
  if (!["docker", "k3s"].includes(backend))
    throw new HttpError(400, "Wybierz Docker albo Kubernetes.");
  if (existing && existing.backend !== backend)
    throw new HttpError(400, "Typ istniejącego profilu nie może być zmieniony.");
  const name = required(input.name, /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,59}$/u);
  if (
    targets.some(
      (item) =>
        item.id !== existing?.id &&
        item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    throw new HttpError(409, "Profil o tej nazwie już istnieje.");

  const id = existing?.id || randomUUID();
  const target = {
    id,
    backend,
    name,
    hermesName: required(
      input.hermesName,
      /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/,
    ),
    namespace: required(input.namespace, /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/),
    storage: required(input.storage, /^[0-9]+(Ki|Mi|Gi|Ti)$/),
    dataPath: required(input.dataPath, /^\/[A-Za-z0-9_./-]+$/),
    image: required(
      input.image,
      /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$/,
    ),
    desktopUrl: validateDesktopUrl(input.desktopUrl),
  };

  const credential = typeof input.credential === "string" ? input.credential : "";
  if (backend === "docker") {
    target.user = required(input.user, /^[A-Za-z0-9_.-]{1,64}$/);
    target.host = required(
      input.host,
      /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/,
    );
    target.port = input.port ? Number(input.port) : 22;
    if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535)
      throw new HttpError(400, "Port SSH musi być liczbą od 1 do 65535.");
    if (credential) validateSshKey(credential);
    if (!existing && !credential)
      throw new HttpError(400, "Wybierz klucz prywatny SSH.");
  } else {
    target.context = typeof input.context === "string" ? input.context.trim() : "";
    if (credential) {
      const kubeconfig = parse(credential);
      if (
        !kubeconfig ||
        !Array.isArray(kubeconfig.clusters) ||
        !Array.isArray(kubeconfig.users) ||
        !Array.isArray(kubeconfig.contexts)
      )
        throw new HttpError(400, "Wybrany plik nie wygląda na kubeconfig.");
      const context = target.context || kubeconfig["current-context"];
      if (!context || !kubeconfig.contexts.some((item) => item.name === context))
        throw new HttpError(400, "Podany kontekst nie istnieje w kubeconfigu.");
      kubeconfig["current-context"] = context;
      target.context = context;
      await writeSecret(kubeconfigPath(id), stringify(kubeconfig));
    }
    if (!existing && !credential)
      throw new HttpError(400, "Wybierz plik kubeconfig.");
  }

  if (backend === "docker" && credential) await writeSecret(sshKeyPath(id), credential);
  const next = existing
    ? targets.map((item) => (item.id === id ? target : item))
    : [...targets, target];
  await writeYaml(targetsFile, { targets: next });
  await writeSshConfig(next);
  return publicTarget(target);
}

export async function ensureDesktopCredentials(id) {
  if (id !== "local-podman" && !isTargetId(id))
    throw new HttpError(404, "Profil nie istnieje.");
  const path = desktopCredentialPath(id);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const credentials = {
    username: "hermes",
    password: randomBytes(32).toString("base64url"),
    secret: randomBytes(48).toString("base64url"),
  };
  await writeSecret(path, JSON.stringify(credentials));
  return credentials;
}

export async function readDesktopCredentials(id) {
  if (id !== "local-podman" && !isTargetId(id))
    throw new HttpError(404, "Profil nie istnieje.");
  try {
    return JSON.parse(await readFile(desktopCredentialPath(id), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function removeTarget(id) {
  if (!isTargetId(id)) throw new HttpError(404, "Profil nie istnieje.");
  const config = (await readYaml(targetsFile)) || { targets: [] };
  const target = (config.targets || []).find((item) => item.id === id);
  if (!target) throw new HttpError(404, "Profil nie istnieje.");
  await writeYaml(targetsFile, {
    targets: config.targets.filter((item) => item.id !== id),
  });
  await rm(target.backend === "docker" ? sshKeyPath(id) : kubeconfigPath(id), {
    force: true,
  });
  await rm(desktopCredentialPath(id), { force: true });
  await writeSshConfig(config.targets.filter((item) => item.id !== id));
}

export function targetEnvironment(target, defaults) {
  const values = target.id === "local-podman" ? defaults : target;
  return {
    name: values.hermesName || values.name || defaults.name,
    namespace: values.namespace || defaults.namespace,
    storage: values.storage || defaults.storage,
    dataPath: values.dataPath || defaults.data_path,
    image: values.image || defaults.image,
    dockerHost:
      target.backend === "podman"
        ? "unix:///run/podman/podman.sock"
        : target.backend === "docker"
          ? `ssh://hermes-${target.id}`
          : "",
    kubeconfig:
      target.backend === "k3s" ? kubeconfigPath(target.id) : "",
    desktopUrl:
      target.id === "local-podman"
        ? "http://127.0.0.1:9119"
        : target.desktopUrl ||
          (target.backend === "docker" ? `http://${target.host}:9119` : ""),
    desktopPublishedPort:
      target.backend === "podman"
        ? "127.0.0.1:9119:9119"
        : target.backend === "docker"
          ? "9119:9119"
          : "",
  };
}

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function localTarget() {
  return {
    id: "local-podman",
    name: "Lokalny Podman",
    backend: "podman",
    desktopUrl: "http://127.0.0.1:9119",
  };
}

function publicTarget(target) {
  if (!isTargetId(target.id)) throw new HttpError(400, "Nieprawidłowy identyfikator profilu.");
  const secret = target.backend === "docker" ? sshKeyPath(target.id) : kubeconfigPath(target.id);
  return { ...target, hasCredential: existsSync(secret) };
}

function validateSshKey(key) {
  if (
    !key.includes("-----BEGIN") ||
    !key.includes("PRIVATE KEY-----") ||
    !key.includes("-----END")
  )
    throw new HttpError(400, "Wybrany plik nie wygląda na prywatny klucz SSH.");
}

function required(value, pattern) {
  if (typeof value !== "string" || !pattern.test(value.trim()))
    throw new HttpError(400, "Sprawdź wymagane pola konfiguracji.");
  return value.trim();
}

async function readYaml(path) {
  try {
    return parse(await readFile(path, "utf8")) || {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeYaml(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, stringify(value), { mode: 0o600 });
  await rename(temporary, path);
}

async function writeSecret(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, value, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function writeSshConfig(targets) {
  const entries = targets
    .filter((item) => item.backend === "docker")
    .map(
      (item) => `Host hermes-${item.id}
  HostName ${item.host}
  User ${item.user}
  Port ${item.port}
  IdentityFile ${sshKeyPath(item.id)}
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new`,
    );
  await writeSecret(join(secretDir, "config"), `${entries.join("\n\n")}\n`);
}

function sshKeyPath(id) {
  return join(secretDir, "ssh", id);
}

function kubeconfigPath(id) {
  return join(secretDir, "kubeconfig", `${id}.yml`);
}

function desktopCredentialPath(id) {
  return join(secretDir, "desktop", `${id}.json`);
}

function validateDesktopUrl(value) {
  if (!value) return "";
  if (typeof value !== "string")
    throw new HttpError(400, "Adres Hermes Desktop jest nieprawidłowy.");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new HttpError(400, "Podaj pełny adres Hermes Desktop, np. http://host:9119.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new HttpError(400, "Adres Hermes Desktop musi zaczynać się od http:// lub https://.");
  return url.toString().replace(/\/$/, "");
}

function isTargetId(id) {
  return typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);
}
