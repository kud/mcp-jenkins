import { httpGetJson, httpGetText, httpPost, Errors, logger, loadJenkinsEnv } from '../common/index.js';

export interface NormalizedBuild {
  id: string;
  result: 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'RUNNING' | string;
  durationMs: number;
  timestamp: string; // ISO
  url: string;
}

export interface JenkinsCredentials {
  baseUrl: string;
  authHeader: string;
}

interface CrumbInfo { crumbRequestField: string; crumb: string }

export class JenkinsClient {
  private baseUrl: string;
  private authHeader: string;
  private crumb?: CrumbInfo;

  constructor(credentials?: JenkinsCredentials) {
    if (credentials) {
      // Use credentials provided by the caller (from request headers)
      this.baseUrl = credentials.baseUrl;
      this.authHeader = credentials.authHeader;
    } else {
      // Fall back to environment variables
      const env = loadJenkinsEnv();
      this.baseUrl = env.JENKINS_URL;

      // Support both Bearer token and Basic auth from env
      if (env.JENKINS_BEARER_TOKEN) {
        this.authHeader = 'Bearer ' + env.JENKINS_BEARER_TOKEN;
      } else {
        // Fall back to Basic auth with user + API token
        this.authHeader = 'Basic ' + Buffer.from(env.JENKINS_USER + ':' + env.JENKINS_API_TOKEN).toString('base64');
      }
    }
  }

  private headers(extra?: Record<string,string>) {
    return { 'Authorization': this.authHeader, ...extra };
  }

  // List jobs (shallow) returns name + url
  async listJobs(): Promise<{ name: string; url: string }[]> {
    try {
      const data = await httpGetJson<any>(`${this.baseUrl}/api/json`, { headers: this.headers() });
      if (Array.isArray(data.jobs)) {
        return data.jobs.map((j: any) => ({ name: j.name, url: j.url }));
      }
      return [];
    } catch (e: any) {
      if (e.message?.includes('HTTP 401')) throw Errors.authFailed();
      throw e;
    }
  }

  // Recent builds metadata for a job (last N, default 5)
  async getRecentBuilds(jobName: string, limit = 5): Promise<NormalizedBuild[]> {
    try {
      const raw = await httpGetJson<any>(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/api/json?depth=1` , { headers: this.headers() });
      if (!raw.builds) return [];
      const builds = raw.builds.slice(0, limit).map((b: any) => this.normalizeBuild(b));
      return builds;
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  private normalizeBuild(raw: any): NormalizedBuild {
    const building = raw.building === true;
    const result = building ? 'RUNNING' : (raw.result || 'RUNNING');
    return {
      id: String(raw.number ?? raw.id ?? ''),
      result,
      durationMs: raw.duration ?? 0,
      timestamp: raw.timestamp ? new Date(raw.timestamp).toISOString() : new Date().toISOString(),
      url: raw.url || ''
    };
  }

  async getLastBuild(jobName: string): Promise<NormalizedBuild> {
    try {
      const raw = await httpGetJson<any>(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/lastBuild/api/json`, { headers: this.headers() });
      return this.normalizeBuild(raw);
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  async getBuild(jobName: string, buildNumber: number): Promise<NormalizedBuild> {
    try {
      const raw = await httpGetJson<any>(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/api/json`, { headers: this.headers() });
      return this.normalizeBuild(raw);
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  async getConsoleLog(jobName: string, buildNumber?: number, maxSnippetLength = 200): Promise<{ jobName: string; buildNumber: number; logSnippet: string; fullLog: string; }> {
    let bn = buildNumber;
    if (bn == null) {
      bn = Number((await this.getLastBuild(jobName)).id);
    }
    try {
      const fullLog = await httpGetText(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${bn}/consoleText`, { headers: this.headers() });
      const snippet = fullLog.trim().slice(0, maxSnippetLength).replace(/\r/g,'');
      return { jobName, buildNumber: bn, logSnippet: snippet, fullLog };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  private async ensureCrumb(): Promise<CrumbInfo | undefined> {
    if (this.crumb) return this.crumb;
    try {
      const crumb = await httpGetJson<CrumbInfo>(`${this.baseUrl}/crumbIssuer/api/json`, { headers: this.headers() });
      this.crumb = crumb;
      return crumb;
    } catch (e: any) {
      // Some Jenkins instances may not have CSRF protection enabled
      logger.warn('Crumb fetch failed (continuing)', { error: String(e) });
      return undefined;
    }
  }

  async triggerBuild(jobName: string, params?: Record<string, any>): Promise<{ jobName: string; queueUrl: string | null }> {
    const crumb = await this.ensureCrumb();
    const isParameterized = params && Object.keys(params).length > 0;
    const path = isParameterized ? 'buildWithParameters' : 'build';
    const url = `${this.baseUrl}/job/${encodeURIComponent(jobName)}/${path}`;
    let body: string | undefined;
    const headers: Record<string,string> = this.headers();
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;
    if (isParameterized) {
      const usp = new URLSearchParams();
      for (const [k,v] of Object.entries(params!)) usp.append(k, String(v));
      body = usp.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    try {
      const res = await httpPost(url, { headers, body });
      const queueUrl = res.headers['location'] || null;
      return { jobName, queueUrl };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  async listArtifacts(jobName: string, buildNumber: number): Promise<{ fileName: string; relativePath: string; url: string; size?: number }[]> {
    try {
      const data = await httpGetJson<any>(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/api/json?tree=artifacts[fileName,relativePath]`, { headers: this.headers() });
      if (!data || !Array.isArray(data.artifacts)) return [];
      return data.artifacts.map((a: any) => ({
        fileName: a.fileName,
        relativePath: a.relativePath,
        url: `${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/artifact/${a.relativePath}`
      }));
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  async getArtifact(jobName: string, buildNumber: number, relativePath: string): Promise<{ fileName: string; relativePath: string; size: number; base64: string }> {
    const url = `${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/artifact/${relativePath}`;
    try {
      const data = await httpGetText(url, { headers: this.headers() });
      const buf = Buffer.from(data, 'utf8');
      return { fileName: relativePath.split('/').pop() || relativePath, relativePath, size: buf.length, base64: buf.toString('base64') };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.artifactNotFound(relativePath);
      throw e;
    }
  }

  async searchJobs(query: string): Promise<{ name: string; url: string }[]> {
    if (!query.trim()) return [];
    const all = await this.listJobs();
    const q = query.toLowerCase();
    return all.filter(j => j.name.toLowerCase().includes(q));
  }

  // Stop/abort a running build
  async stopBuild(jobName: string, buildNumber: number): Promise<{ jobName: string; buildNumber: number; stopped: boolean }> {
    const crumb = await this.ensureCrumb();
    const headers: Record<string,string> = this.headers();
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;

    try {
      await httpPost(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/stop`, { headers });
      return { jobName, buildNumber, stopped: true };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  // Delete a build
  async deleteBuild(jobName: string, buildNumber: number): Promise<{ jobName: string; buildNumber: number; deleted: boolean }> {
    const crumb = await this.ensureCrumb();
    const headers: Record<string,string> = this.headers();
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;

    try {
      await httpPost(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/doDelete`, { headers });
      return { jobName, buildNumber, deleted: true };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  // Get test results for a build
  async getTestResults(jobName: string, buildNumber: number): Promise<any> {
    try {
      const data = await httpGetJson<any>(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/testReport/api/json`, { headers: this.headers() });
      return {
        jobName,
        buildNumber,
        totalTests: data.totalCount || 0,
        passedTests: data.passCount || 0,
        failedTests: data.failCount || 0,
        skippedTests: data.skipCount || 0,
        duration: data.duration || 0,
        suites: data.suites || []
      };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) {
        return { jobName, buildNumber, totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0, message: 'No test results found' };
      }
      throw e;
    }
  }

  // Get build queue
  async getQueue(): Promise<any[]> {
    try {
      const data = await httpGetJson<any>(`${this.baseUrl}/queue/api/json`, { headers: this.headers() });
      if (!data.items) return [];
      return data.items.map((item: any) => ({
        id: item.id,
        blocked: item.blocked || false,
        buildable: item.buildable || false,
        stuck: item.stuck || false,
        why: item.why || '',
        task: {
          name: item.task?.name || '',
          url: item.task?.url || ''
        },
        inQueueSince: item.inQueueSince ? new Date(item.inQueueSince).toISOString() : null
      }));
    } catch (e: any) {
      throw e;
    }
  }

  // Cancel queued build
  async cancelQueue(queueId: number): Promise<{ queueId: number; cancelled: boolean }> {
    const crumb = await this.ensureCrumb();
    const headers: Record<string,string> = this.headers();
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;

    try {
      await httpPost(`${this.baseUrl}/queue/cancelItem?id=${queueId}`, { headers });
      return { queueId, cancelled: true };
    } catch (e: any) {
      throw e;
    }
  }

  // Enable a job
  async enableJob(jobName: string): Promise<{ jobName: string; enabled: boolean }> {
    const crumb = await this.ensureCrumb();
    const headers: Record<string,string> = this.headers();
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;

    try {
      await httpPost(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/enable`, { headers });
      return { jobName, enabled: true };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  // Disable a job
  async disableJob(jobName: string): Promise<{ jobName: string; disabled: boolean }> {
    const crumb = await this.ensureCrumb();
    const headers: Record<string,string> = this.headers();
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;

    try {
      await httpPost(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/disable`, { headers });
      return { jobName, disabled: true };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  // Delete a job
  async deleteJob(jobName: string): Promise<{ jobName: string; deleted: boolean }> {
    const crumb = await this.ensureCrumb();
    const headers: Record<string,string> = this.headers();
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;

    try {
      await httpPost(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/doDelete`, { headers });
      return { jobName, deleted: true };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  // Get job configuration (XML)
  async getJobConfig(jobName: string): Promise<{ jobName: string; config: string }> {
    try {
      const config = await httpGetText(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/config.xml`, { headers: this.headers() });
      return { jobName, config };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  // List nodes/agents
  async listNodes(): Promise<any[]> {
    try {
      const data = await httpGetJson<any>(`${this.baseUrl}/computer/api/json?depth=1`, { headers: this.headers() });
      if (!data.computer) return [];
      return data.computer.map((node: any) => ({
        name: node.displayName || '',
        offline: node.offline || false,
        idle: node.idle || false,
        numExecutors: node.numExecutors || 0,
        busyExecutors: node.monitorData?.['hudson.node_monitors.SwapSpaceMonitor']?.availablePhysicalMemory ? 0 : node.numExecutors,
        temporarilyOffline: node.temporarilyOffline || false,
        offlineCauseReason: node.offlineCauseReason || ''
      }));
    } catch (e: any) {
      throw e;
    }
  }

  // Get system info
  async getSystemInfo(): Promise<any> {
    try {
      const data = await httpGetJson<any>(`${this.baseUrl}/api/json`, { headers: this.headers() });
      return {
        nodeDescription: data.nodeDescription || '',
        nodeName: data.nodeName || '',
        numExecutors: data.numExecutors || 0,
        mode: data.mode || '',
        quietingDown: data.quietingDown || false,
        useCrumbs: data.useCrumbs || false,
        useSecurity: data.useSecurity || false
      };
    } catch (e: any) {
      throw e;
    }
  }

  // Get Jenkins version
  async getVersion(): Promise<{ version: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/json`, {
        method: 'HEAD',
        headers: this.headers()
      });
      const version = res.headers.get('x-jenkins') || 'unknown';
      return { version };
    } catch (e: any) {
      throw e;
    }
  }

  // Get installed plugins
  async getPlugins(): Promise<any[]> {
    try {
      const data = await httpGetJson<any>(`${this.baseUrl}/pluginManager/api/json?depth=1`, { headers: this.headers() });
      if (!data.plugins) return [];
      return data.plugins.map((plugin: any) => ({
        shortName: plugin.shortName || '',
        longName: plugin.longName || '',
        version: plugin.version || '',
        enabled: plugin.enabled || false,
        active: plugin.active || false,
        hasUpdate: plugin.hasUpdate || false
      }));
    } catch (e: any) {
      throw e;
    }
  }

  // Get build changes/commits
  async getBuildChanges(jobName: string, buildNumber: number): Promise<any> {
    try {
      const data = await httpGetJson<any>(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/api/json?tree=changeSet[items[author[fullName],msg,commitId,timestamp]]`, { headers: this.headers() });
      if (!data.changeSet || !data.changeSet.items) {
        return { jobName, buildNumber, changes: [] };
      }
      return {
        jobName,
        buildNumber,
        changes: data.changeSet.items.map((change: any) => ({
          author: change.author?.fullName || 'unknown',
          message: change.msg || '',
          commitId: change.commitId || '',
          timestamp: change.timestamp ? new Date(change.timestamp).toISOString() : null
        }))
      };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }

  // Get pipeline stages
  async getPipelineStages(jobName: string, buildNumber: number): Promise<any> {
    try {
      const data = await httpGetJson<any>(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/wfapi/describe`, { headers: this.headers() });
      return {
        jobName,
        buildNumber,
        status: data.status || '',
        stages: (data.stages || []).map((stage: any) => ({
          id: stage.id || '',
          name: stage.name || '',
          status: stage.status || '',
          startTimeMillis: stage.startTimeMillis || 0,
          durationMillis: stage.durationMillis || 0,
          pauseDurationMillis: stage.pauseDurationMillis || 0
        }))
      };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) {
        return { jobName, buildNumber, message: 'Not a pipeline build or workflow API not available' };
      }
      throw e;
    }
  }

  // Replay build (for pipeline jobs)
  async replayBuild(jobName: string, buildNumber: number): Promise<{ jobName: string; buildNumber: number; queueUrl: string | null }> {
    const crumb = await this.ensureCrumb();
    const headers: Record<string,string> = this.headers();
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;

    try {
      const res = await httpPost(`${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/replay/rebuild`, { headers });
      return { jobName, buildNumber, queueUrl: res.headers['location'] || null };
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) throw Errors.jobNotFound(jobName);
      throw e;
    }
  }
}

export const createClient = () => new JenkinsClient();
