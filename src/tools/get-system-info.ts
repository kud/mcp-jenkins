import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetSystemInfoInput {}

export const getSystemInfo = async (client: JenkinsClient, _input: GetSystemInfoInput) => {
  return client.getSystemInfo();
};
