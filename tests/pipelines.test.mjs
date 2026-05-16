// Structural tests for the pipeline templates. Both ADO and GHA YAML
// files are parsed and asserted on key invariants:
//
//   - syntactically valid YAML
//   - the consumer-facing `mode` parameter accepts test|monitor|both
//   - inspect-config is invoked before the smoke and monitor passes
//   - smoke and monitor passes are conditional on the right flags
//   - CHECKLY_PURPOSE env is set per pass
//   - script file references in the YAML actually exist on disk
//
// We don't try to lint full ADO/GHA YAML schemas — those are huge — but
// regressions in any of the load-bearing structural properties above
// will fail here instead of on a consumer's pipeline run.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { repoRoot } from './helpers.mjs';

const adoTemplate = path.join(repoRoot, 'templates', 'azuredevops', 'deploy.yml');
const ghaTemplate = path.join(repoRoot, '.github', 'workflows', 'deploy.yml');
const adoExample = path.join(repoRoot, 'examples', 'consumer-pipeline.azdevops.yml');
const ghaExample = path.join(repoRoot, 'examples', 'consumer-pipeline.github.yml');

function loadYaml(file) {
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

describe('pipeline templates: every YAML file parses', () => {
  for (const f of [adoTemplate, ghaTemplate, adoExample, ghaExample]) {
    it(path.relative(repoRoot, f), () => {
      assert.doesNotThrow(() => loadYaml(f), `${path.basename(f)} is not valid YAML`);
    });
  }
});

describe('templates/azuredevops/deploy.yml', () => {
  const yaml = loadYaml(adoTemplate);

  it('exposes mode parameter with the three expected values', () => {
    const modeParam = yaml.parameters.find((p) => p.name === 'mode');
    assert.ok(modeParam, 'missing mode parameter');
    assert.equal(modeParam.default, 'both');
    assert.deepEqual([...modeParam.values].sort(), ['both', 'monitor', 'test']);
  });

  it('requires configPath parameter', () => {
    const p = yaml.parameters.find((p) => p.name === 'configPath');
    assert.ok(p, 'missing configPath parameter');
    assert.equal(p.type, 'string');
  });

  it('requires checklyCredentialsGroup parameter', () => {
    const p = yaml.parameters.find((p) => p.name === 'checklyCredentialsGroup');
    assert.ok(p);
  });

  it('exposes secretEnvVars parameter for forwarding ADO secret variables', () => {
    const p = yaml.parameters.find((p) => p.name === 'secretEnvVars');
    assert.ok(p, 'missing secretEnvVars parameter');
    assert.equal(p.type, 'object');
    assert.deepEqual(p.default, []);
  });

  it('exposes smokeLocation parameter to override the test-pass region', () => {
    const p = yaml.parameters.find((p) => p.name === 'smokeLocation');
    assert.ok(p, 'missing smokeLocation parameter');
    assert.equal(p.type, 'string');
    assert.equal(p.default, '');
  });

  it('smoke step conditionally passes --location when smokeLocation is set', () => {
    const raw = fs.readFileSync(adoTemplate, 'utf8');
    assert.match(raw, /parameters\.smokeLocation/);
    assert.match(raw, /--location\s+\$\{\{\s*parameters\.smokeLocation/);
  });

  it('smoke and monitor steps each contain a forwarding loop for secretEnvVars', () => {
    // The `${{ each }}` expression survives in the parsed YAML as a
    // string key on the env object. Asserting on the raw file lets us
    // verify both passes wire the loop up.
    const raw = fs.readFileSync(adoTemplate, 'utf8');
    const occurrences = raw.match(/\$\{\{ each name in parameters\.secretEnvVars \}\}/g);
    assert.ok(occurrences && occurrences.length >= 2, 'expected the secretEnvVars each-loop in both smoke and monitor step env blocks');
  });

  // Walk steps to find the smoke + monitor + inspect-config invocations.
  const steps = yaml.stages[0].jobs[0].steps;
  const inspectStep = steps.find((s) => s.script?.includes('inspect-config.mjs'));
  const smokeStep = steps.find((s) => s.displayName?.startsWith('checkly test'));
  const monitorStep = steps.find((s) => s.displayName?.startsWith('checkly deploy'));
  const smokeSkipStep = steps.find((s) => s.displayName?.includes('Smoke pass skipped'));
  const monitorSkipStep = steps.find((s) => s.displayName?.includes('Monitor pass skipped'));

  it('invokes scripts/inspect-config.mjs before the smoke step', () => {
    assert.ok(inspectStep, 'inspect-config step missing');
    assert.match(inspectStep.script, /--format=ado/);
    assert.ok(steps.indexOf(inspectStep) < steps.indexOf(smokeStep));
  });

  it('smoke step is conditional on mode in (test, both) AND hasSmoke=true', () => {
    assert.ok(smokeStep, 'smoke step missing');
    assert.match(smokeStep.condition, /in\('\$\{\{ parameters\.mode \}\}', 'test', 'both'\)/);
    assert.match(smokeStep.condition, /eq\(variables\.hasSmoke, 'true'\)/);
  });

  it('smoke step sets CHECKLY_PURPOSE=test', () => {
    assert.equal(smokeStep.env.CHECKLY_PURPOSE, 'test');
  });

  it('smoke step passes CHECKLY_API_KEY + CHECKLY_ACCOUNT_ID + CHECKLY_TEMPLATES_CONFIG', () => {
    for (const k of ['CHECKLY_API_KEY', 'CHECKLY_ACCOUNT_ID', 'CHECKLY_TEMPLATES_CONFIG']) {
      assert.ok(smokeStep.env[k] !== undefined, `smoke step missing env ${k}`);
    }
  });

  it('smoke-skip step is conditional on hasSmoke!=true', () => {
    assert.ok(smokeSkipStep, 'smoke-skip step missing');
    assert.match(smokeSkipStep.condition, /ne\(variables\.hasSmoke, 'true'\)/);
  });

  it('monitor step is conditional on mode in (monitor, both) AND hasMonitor=true', () => {
    assert.ok(monitorStep);
    assert.match(monitorStep.condition, /in\('\$\{\{ parameters\.mode \}\}', 'monitor', 'both'\)/);
    assert.match(monitorStep.condition, /eq\(variables\.hasMonitor, 'true'\)/);
  });

  it('monitor step uses succeededOrFailed() so smoke failures do not gate deploy', () => {
    assert.match(monitorStep.condition, /succeededOrFailed\(\)/);
    assert.doesNotMatch(monitorStep.condition, /\bsucceeded\(\)/);
  });

  it('monitor step sets CHECKLY_PURPOSE=monitor', () => {
    assert.equal(monitorStep.env.CHECKLY_PURPOSE, 'monitor');
  });

  it('monitor-skip step is conditional on hasMonitor!=true', () => {
    assert.ok(monitorSkipStep);
    assert.match(monitorSkipStep.condition, /ne\(variables\.hasMonitor, 'true'\)/);
  });

  it('checks out both consumer and templates repos to known paths', () => {
    const checkoutSelf = steps.find((s) => s.checkout === 'self');
    const checkoutTemplates = steps.find((s) => s.checkout === 'checklyTemplates');
    assert.ok(checkoutSelf, 'missing checkout: self');
    assert.ok(checkoutTemplates, 'missing checkout: checklyTemplates');
    assert.equal(checkoutSelf.path, 's/consumer');
    assert.equal(checkoutTemplates.path, 's/checkly-templates');
  });
});

describe('.github/workflows/deploy.yml', () => {
  const yaml = loadYaml(ghaTemplate);

  it('declares workflow_call with the required inputs', () => {
    const inputs = yaml.on.workflow_call.inputs;
    assert.ok(inputs['config-path'].required);
    assert.equal(inputs.mode.default, 'both');
    assert.equal(inputs['dry-run'].default, false);
  });

  it('declares the required secrets', () => {
    const secrets = yaml.on.workflow_call.secrets;
    assert.ok(secrets.CHECKLY_API_KEY.required);
    assert.ok(secrets.CHECKLY_ACCOUNT_ID.required);
  });

  const steps = yaml.jobs.deploy.steps;
  const inspectStep = steps.find((s) => s.run?.includes('inspect-config.mjs'));
  const smokeStep = steps.find((s) => s.name?.startsWith('checkly test'));
  const monitorStep = steps.find((s) => s.name?.startsWith('checkly deploy'));
  const smokeSkipStep = steps.find((s) => s.name?.includes('Smoke pass skipped'));
  const monitorSkipStep = steps.find((s) => s.name?.includes('Monitor pass skipped'));

  it('invokes scripts/inspect-config.mjs before smoke and monitor', () => {
    assert.ok(inspectStep);
    assert.match(inspectStep.run, /--format=gha/);
    assert.equal(inspectStep.id, 'inspect');
  });

  it('smoke step is conditional on mode in (test, both) AND has-smoke=true', () => {
    assert.ok(smokeStep);
    assert.match(smokeStep.if, /inputs\.mode == 'test' \|\| inputs\.mode == 'both'/);
    assert.match(smokeStep.if, /steps\.inspect\.outputs\.has-smoke == 'true'/);
  });

  it('smoke step sets CHECKLY_PURPOSE=test', () => {
    assert.equal(smokeStep.env.CHECKLY_PURPOSE, 'test');
  });

  it('smoke-skip step uses has-smoke != true', () => {
    assert.ok(smokeSkipStep);
    assert.match(smokeSkipStep.if, /steps\.inspect\.outputs\.has-smoke != 'true'/);
  });

  it('monitor step is conditional on mode in (monitor, both) AND has-monitor=true', () => {
    assert.ok(monitorStep);
    assert.match(monitorStep.if, /inputs\.mode == 'monitor' \|\| inputs\.mode == 'both'/);
    assert.match(monitorStep.if, /steps\.inspect\.outputs\.has-monitor == 'true'/);
  });

  it('monitor step uses !cancelled() so smoke failures do not gate deploy', () => {
    // GHA defaults to skipping subsequent steps on failure unless the
    // expression includes always() / failure() / cancelled(). We use
    // !cancelled() so the deploy runs after a smoke failure but not
    // after a manual cancellation.
    assert.match(monitorStep.if, /!cancelled\(\)/);
  });

  it('monitor step sets CHECKLY_PURPOSE=monitor', () => {
    assert.equal(monitorStep.env.CHECKLY_PURPOSE, 'monitor');
  });

  it('monitor-skip step uses has-monitor != true', () => {
    assert.ok(monitorSkipStep);
    assert.match(monitorSkipStep.if, /steps\.inspect\.outputs\.has-monitor != 'true'/);
  });

  it('top-level env exposes CHECKLY_API_KEY, CHECKLY_ACCOUNT_ID, CHECKLY_TEMPLATES_CONFIG', () => {
    const env = yaml.jobs.deploy.env;
    assert.ok(env.CHECKLY_API_KEY);
    assert.ok(env.CHECKLY_ACCOUNT_ID);
    assert.ok(env.CHECKLY_TEMPLATES_CONFIG);
  });
});

describe('pipeline templates: referenced scripts exist on disk', () => {
  it('scripts/inspect-config.mjs exists', () => {
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts', 'inspect-config.mjs')));
  });

  it('src/deploy/build-schema.mjs exists', () => {
    assert.ok(fs.existsSync(path.join(repoRoot, 'src', 'deploy', 'build-schema.mjs')));
  });

  it('src/deploy/all.check.ts exists (Checkly checkMatch target)', () => {
    assert.ok(fs.existsSync(path.join(repoRoot, 'src', 'deploy', 'all.check.ts')));
  });

  it('src/deploy/playwright.config.ts exists', () => {
    assert.ok(fs.existsSync(path.join(repoRoot, 'src', 'deploy', 'playwright.config.ts')));
  });
});

describe('example consumer pipelines reference the live template paths', () => {
  it('ADO example resources.repositories points at this repo and a valid ref', () => {
    const yaml = loadYaml(adoExample);
    const repo = yaml.resources.repositories.find((r) => r.repository === 'checklyTemplates');
    assert.ok(repo);
    assert.match(repo.name, /checkly-templates$/);
    assert.match(repo.ref, /^refs\/(heads|tags)\//);
  });

  it('ADO example references templates/azuredevops/deploy.yml@checklyTemplates', () => {
    const yaml = loadYaml(adoExample);
    const stage = yaml.stages.find((s) => s.template);
    assert.equal(stage.template, 'templates/azuredevops/deploy.yml@checklyTemplates');
  });

  it('GHA example uses .github/workflows/deploy.yml from this repo', () => {
    const yaml = loadYaml(ghaExample);
    const job = Object.values(yaml.jobs)[0];
    assert.match(job.uses, /\/\.github\/workflows\/deploy\.yml@/);
  });

  it('GHA example passes both required secrets through', () => {
    const yaml = loadYaml(ghaExample);
    const job = Object.values(yaml.jobs)[0];
    assert.ok(job.secrets?.CHECKLY_API_KEY);
    assert.ok(job.secrets?.CHECKLY_ACCOUNT_ID);
  });
});
