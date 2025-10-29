import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetPipelineStagesInput {
  jobName: string;
  buildNumber: number;
}

export const getPipelineStages = async (client: JenkinsClient, input: GetPipelineStagesInput) => {
  return client.getPipelineStages(input.jobName, input.buildNumber);
};
