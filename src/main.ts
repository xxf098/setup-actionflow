import * as core from '@actions/core';
import * as io from '@actions/io';
import * as installer from './installer';
import * as semver from 'semver';
import path from 'path';
import {restoreCache} from './cache-restore';
import {isGhes, isCacheFeatureAvailable} from './cache-utils';
import cp from 'child_process';
import fs from 'fs';
import os from 'os';

export async function run() {
  try {
    //
    // versionSpec is optional.  If supplied, install / use from the tool cache
    // If not supplied then problem matchers will still be setup.  Useful for self-hosted.
    //
    const versionSpec = resolveVersionInput();

    const cache = core.getBooleanInput('cache');
    core.info(`Setup flow version spec ${versionSpec}`);

    let arch = core.getInput('architecture');

    if (!arch) {
      arch = os.arch();
    }

    if (versionSpec) {
      let token = core.getInput('token');
      let auth = !token ? undefined : `token ${token}`;

      const checkLatest = core.getBooleanInput('check-latest');
      const installDir = await installer.getGo(
        versionSpec,
        checkLatest,
        auth,
        arch
      );

      core.addPath(installDir);
      core.info('Added flow to the path');

      core.info(`Successfully set up Flow version ${versionSpec}`);
    }

    if (cache && isCacheFeatureAvailable()) {
      const packageManager = 'default';
      const cacheDependencyPath = core.getInput('cache-dependency-path');
      await restoreCache(versionSpec, packageManager, cacheDependencyPath);
    }

    // add problem matchers
    const matchersPath = path.join(__dirname, '../..', 'matchers.json');
    core.info(`##[add-matcher]${matchersPath}`);

    core.setOutput('flow-version', versionSpec);
   
  } catch (error) {
    core.setFailed(error.message);
  }
}

export async function addBinToPath(): Promise<boolean> {
  let added = false;
  let g = await io.which('flow');
  core.debug(`which go :${g}:`);
  if (!g) {
    core.debug('go not in the path');
    return added;
  }

  let buf = cp.execSync('go env GOPATH');
  if (buf.length > 1) {
    let gp = buf.toString().trim();
    core.debug(`go env GOPATH :${gp}:`);
    if (!fs.existsSync(gp)) {
      // some of the hosted images have go install but not profile dir
      core.debug(`creating ${gp}`);
      await io.mkdirP(gp);
    }

    let bp = path.join(gp, 'bin');
    if (!fs.existsSync(bp)) {
      core.debug(`creating ${bp}`);
      await io.mkdirP(bp);
    }

    core.addPath(bp);
    added = true;
  }
  return added;
}

export function parseGoVersion(versionString: string): string {
  // get the installed version as an Action output
  // based on go/src/cmd/go/internal/version/version.go:
  // fmt.Printf("go version %s %s/%s\n", runtime.Version(), runtime.GOOS, runtime.GOARCH)
  // expecting go<version> for runtime.Version()
  return versionString.split(' ')[2].slice('flow'.length);
}

function resolveVersionInput(): string {
  let version = core.getInput('flow-version');

  return version;
}
