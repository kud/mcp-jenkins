import { JenkinsClient } from "../lib/client.js"

export interface GetQueueInput {}

export const getQueue = async (client: JenkinsClient, _input: GetQueueInput) => {
  const data = await client.getQueue()
  if (!data?.items) return []
  return data.items.map((item: any) => ({
    id: item.id,
    blocked: item.blocked || false,
    buildable: item.buildable || false,
    stuck: item.stuck || false,
    why: item.why || "",
    task: {
      name: item.task?.name || "",
      url: item.task?.url || "",
    },
    inQueueSince: item.inQueueSince
      ? new Date(item.inQueueSince).toISOString()
      : null,
  }))
}
