import { JenkinsClient } from "../lib/client.js"

export interface CancelQueueInput {
  queueId: number
}

export const cancelQueue = async (
  client: JenkinsClient,
  input: CancelQueueInput,
) => {
  await client.cancelQueueItem(input.queueId)
  return { queueId: input.queueId, cancelled: true }
}
