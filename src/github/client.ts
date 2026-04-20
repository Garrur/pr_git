import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { config } from '../config/validateEnv';

/**
 * WHY singleton: Octokit instances cache JWT state internally.
 * Creating one per request would regenerate JWTs on every call,
 * hitting the GitHub 10-minute JWT window more aggressively.
 */
let _appClient: Octokit | undefined;

function getAppClient(): Octokit {
  if (!_appClient) {
    _appClient = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.GITHUB_APP_ID,
        privateKey: config.GITHUB_PRIVATE_KEY,
      },
    });
  }
  return _appClient;
}

/**
 * Returns an Octokit client authenticated as a specific installation.
 *
 * WHY per-call: installation tokens expire after 1 hour.
 * Octokit's auth-app plugin handles caching and refresh internally,
 * but we still create a new instance per installation so the token
 * scope is isolated to that org/repo.
 */
export async function getInstallationClient(installationId: number): Promise<Octokit> {
  const auth = createAppAuth({
    appId: config.GITHUB_APP_ID,
    privateKey: config.GITHUB_PRIVATE_KEY,
    installationId,
  });

  const { token } = await auth({ type: 'installation' });

  return new Octokit({ auth: token });
}

export { getAppClient };
