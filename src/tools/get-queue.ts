import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetQueueInput {}

export const getQueue = async (client: JenkinsClient, _input: GetQueueInput) => {
  return client.getQueue();
};
