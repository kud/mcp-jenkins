import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetVersionInput {}

export const getVersion = async (client: JenkinsClient, _input: GetVersionInput) => {
  return client.getVersion();
};
