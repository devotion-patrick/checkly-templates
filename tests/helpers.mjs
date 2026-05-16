// Shared test helpers. Single jiti instance, single compiled schema,
// fake Checkly session that lets factories instantiate constructs.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import AjvImport from 'ajv';
import addFormatsImport from 'ajv-formats';

const Ajv = AjvImport;
const addFormats = addFormatsImport;

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');

const jiti = createJiti(import.meta.url);

const { buildSchema } = await jiti.import(path.join(repoRoot, 'src', 'deploy', 'schema-builder.ts'));
export const schema = buildSchema();

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
export const validate = ajv.compile(schema);

// Loads each kind's module via the registry. Use lazily to avoid
// require cycles or unnecessary load cost when a test only needs one.
const registryMod = await jiti.import(path.join(repoRoot, 'src', 'deploy', 'registry.ts'));
export const REGISTRY = registryMod.REGISTRY;
export const MODULES = registryMod.MODULES;
export const hasPlaywrightKinds = registryMod.hasPlaywrightKinds;

// Set up a fake Checkly project so factories that instantiate ApiCheck /
// PlaywrightCheck don't throw `"outside a Checkly CLI project"`. We also
// pin checkFileAbsolutePath because PlaywrightCheck resolves the
// playwrightConfigPath relative to it and bails when it's unset.
const { Project, Session } = await jiti.import('checkly/constructs');
Session.project = new Project('test-project', { name: 'Test Project' });
Session.checkFileAbsolutePath = path.join(repoRoot, 'src', 'deploy', 'all.check.ts');
Session.basePath = repoRoot;

// PlaywrightCheck.validate() requires a populated workspace; in the real
// Checkly CLI flow project-parser.js sets this up via faux/real workspace
// detection. We re-use the same packageManager.fauxWorkspaceFromPackageJson
// helper so the test harness ends up in the same state.
import { pathToFileURL } from 'node:url';
async function initSessionWorkspace() {
  // Use lookupWorkspace (real workspace detection, including lockfile)
  // rather than fauxWorkspaceFromPackageJson — the latter omits the
  // lockfile path that PlaywrightCheck.validate() requires.
  const pmUrl = pathToFileURL(
    path.join(repoRoot, 'node_modules', 'checkly', 'dist', 'services', 'check-parser', 'package-files', 'package-manager.js'),
  ).href;
  const resultUrl = pathToFileURL(
    path.join(repoRoot, 'node_modules', 'checkly', 'dist', 'services', 'check-parser', 'package-files', 'result.js'),
  ).href;
  const pm = await import(pmUrl);
  const result = await import(resultUrl);
  const workspace = await pm.npmPackageManager.lookupWorkspace(repoRoot);
  if (workspace) {
    Session.workspace = result.Ok(workspace);
    Session.basePath = workspace.root.path;
    Session.contextPath = workspace.root.path;
  }
}
await initSessionWorkspace();

// Minimum valid project block for an entry-level test.
export const baseProject = { logicalId: 'test-project', name: 'Test' };

// Minimum valid context object for invoking a factory directly.
export const baseContext = {
  project: baseProject,
  defaultFrequency: 'EVERY_15M',
  defaultLocations: ['eu-central-1'],
};

// Wraps each kind's `factory(entry, ctx)` so a test can call it and
// recover any thrown error without crashing the whole run.
export function tryFactory(kind, entry, ctx = baseContext) {
  const mod = REGISTRY[kind];
  if (!mod) throw new Error(`Unknown kind: ${kind}`);
  return mod.factory(entry, ctx);
}

// Convenience: build a full consumer-config object around a single entry.
export function configWith(entries, project = baseProject) {
  return { project, checks: Array.isArray(entries) ? entries : [entries] };
}

// Convenience: validate and return `{valid, errors}` so tests assert on either.
export function validateConfig(config) {
  const valid = validate(config);
  return { valid, errors: validate.errors ?? [] };
}
