import { JenkinsClient } from '../lib/jenkins-client.js';

export interface CancelQueueInput {
  queueId: number;
}

export const cancelQueue = async (client: JenkinsClient, input: CancelQueueInput) => {
  return client.cancelQueue(input.queueId);
};
