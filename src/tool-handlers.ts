import { JenkinsClient } from "./lib/jenkins-client.js"
import { getJobStatus } from "./tools/get-job-status.js"
import { getJobParameters } from "./tools/get-job-parameters.js"
import { getBuildStatus } from "./tools/get-build-status.js"
import { getConsoleLog } from "./tools/get-console-log.js"
import { triggerBuild } from "./tools/trigger-build.js"
import { listJobs } from "./tools/list-jobs.js"
import { getRecentBuilds } from "./tools/get-recent-builds.js"
import { listArtifacts } from "./tools/list-artifacts.js"
import { getArtifact } from "./tools/get-artifact.js"
import { searchJobs } from "./tools/search-jobs.js"
import { stopBuild } from "./tools/stop-build.js"
import { deleteBuild } from "./tools/delete-build.js"
import { getTestResults } from "./tools/get-test-results.js"
import { getQueue } from "./tools/get-queue.js"
import { cancelQueue } from "./tools/cancel-queue.js"
import { enableJob } from "./tools/enable-job.js"
import { disableJob } from "./tools/disable-job.js"
import { deleteJob } from "./tools/delete-job.js"
import { getJobConfig } from "./tools/get-job-config.js"
import { listNodes } from "./tools/list-nodes.js"
import { getSystemInfo } from "./tools/get-system-info.js"
import { getVersion } from "./tools/get-version.js"
import { getPlugins } from "./tools/get-plugins.js"
import { getBuildChanges } from "./tools/get-build-changes.js"
import { getPipelineStages } from "./tools/get-pipeline-stages.js"
import { replayBuild } from "./tools/replay-build.js"
import { createJob } from "./tools/create-job.js"
import { updateJobConfig } from "./tools/update-job-config.js"
import { renameJob } from "./tools/rename-job.js"
import { copyJob } from "./tools/copy-job.js"
import { getNode } from "./tools/get-node.js"
import { toggleNodeOffline } from "./tools/toggle-node-offline.js"
import { listViews } from "./tools/list-views.js"
import { getView } from "./tools/get-view.js"
import { quietDown } from "./tools/quiet-down.js"
import { cancelQuietDown } from "./tools/cancel-quiet-down.js"
import { safeRestart } from "./tools/safe-restart.js"

// Map tool names to handler functions
export type ToolHandler = (client: JenkinsClient, input: any) => Promise<any>
export const toolHandlers: Record<string, ToolHandler> = {
  jenkins_list_jobs: listJobs,
  jenkins_search_jobs: searchJobs,
  jenkins_get_job_status: getJobStatus,
  jenkins_get_job_parameters: getJobParameters,
  jenkins_get_build_status: getBuildStatus,
  jenkins_get_recent_builds: getRecentBuilds,
  jenkins_get_console_log: getConsoleLog,
  jenkins_trigger_build: triggerBuild,
  jenkins_list_artifacts: listArtifacts,
  jenkins_get_artifact: getArtifact,
  jenkins_stop_build: stopBuild,
  jenkins_delete_build: deleteBuild,
  jenkins_get_test_results: getTestResults,
  jenkins_get_build_changes: getBuildChanges,
  jenkins_get_pipeline_stages: getPipelineStages,
  jenkins_replay_build: replayBuild,
  jenkins_get_queue: getQueue,
  jenkins_cancel_queue: cancelQueue,
  jenkins_enable_job: enableJob,
  jenkins_disable_job: disableJob,
  jenkins_delete_job: deleteJob,
  jenkins_get_job_config: getJobConfig,
  jenkins_list_nodes: listNodes,
  jenkins_get_system_info: getSystemInfo,
  jenkins_get_version: getVersion,
  jenkins_get_plugins: getPlugins,
  jenkins_create_job: createJob,
  jenkins_update_job_config: updateJobConfig,
  jenkins_rename_job: renameJob,
  jenkins_copy_job: copyJob,
  jenkins_get_node: getNode,
  jenkins_toggle_node_offline: toggleNodeOffline,
  jenkins_list_views: listViews,
  jenkins_get_view: getView,
  jenkins_quiet_down: quietDown,
  jenkins_cancel_quiet_down: cancelQuietDown,
  jenkins_safe_restart: safeRestart,
}
