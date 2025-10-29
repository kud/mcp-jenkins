export interface JenkinsEnv {
  JENKINS_URL: string;
  JENKINS_USER?: string;
  JENKINS_API_TOKEN?: string;
  JENKINS_BEARER_TOKEN?: string;
}

export const loadJenkinsEnv = (): JenkinsEnv => {
  const { JENKINS_URL, JENKINS_USER, JENKINS_API_TOKEN, JENKINS_BEARER_TOKEN } = process.env;

  if (!JENKINS_URL) {
    throw new Error('Missing JENKINS_URL environment variable. Set JENKINS_URL to your Jenkins server URL.');
  }

  // Either bearer token OR (user + api token) must be provided
  const hasBasicAuth = JENKINS_USER && JENKINS_API_TOKEN;
  const hasBearerAuth = JENKINS_BEARER_TOKEN;
  if (!hasBasicAuth && !hasBearerAuth) {
    throw new Error('Missing Jenkins authentication: provide either JENKINS_BEARER_TOKEN or both (JENKINS_USER + JENKINS_API_TOKEN)');
  }

  return {
    JENKINS_URL: JENKINS_URL.replace(/\/$/, ''),
    JENKINS_USER,
    JENKINS_API_TOKEN,
    JENKINS_BEARER_TOKEN
  };
};
