import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetPluginsInput {}

export const getPlugins = async (client: JenkinsClient, _input: GetPluginsInput) => {
  return client.getPlugins();
};
