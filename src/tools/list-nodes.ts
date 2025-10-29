import { JenkinsClient } from '../lib/jenkins-client.js';

export interface ListNodesInput {}

export const listNodes = async (client: JenkinsClient, _input: ListNodesInput) => {
  return client.listNodes();
};
