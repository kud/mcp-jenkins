import { JenkinsClient } from '../lib/jenkins-client.js';

export interface TriggerBuildInput { jobName: string; params?: Record<string, any> }
export const triggerBuild = async (client: JenkinsClient, input: TriggerBuildInput) => {
  return client.triggerBuild(input.jobName, input.params);
};
