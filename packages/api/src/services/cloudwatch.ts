import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DeleteLogGroupCommand,
  DeleteLogStreamCommand,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  PutLogEventsCommand,
  PutRetentionPolicyCommand,
  type CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  DescribeAlarmsCommand,
  ListMetricsCommand,
  type CloudWatchClient,
} from "@aws-sdk/client-cloudwatch";
import { awsClients } from "../aws";

export type CreateLogGroupInput = {
  name: string;
  retentionInDays?: number;
};

export type CreateLogStreamInput = {
  group: string;
  name: string;
};

export type PutLogEventsInput = {
  group: string;
  stream: string;
  events: Array<{ timestamp: number; message: string }>;
};

export function createCloudWatchService(
  logsClient: CloudWatchLogsClient = awsClients.cloudwatchLogs,
  cloudWatchClient: CloudWatchClient = awsClients.cloudwatch,
) {
  return {
    async listLogGroups(prefix?: string) {
      const res = await logsClient.send(
        new DescribeLogGroupsCommand(
          prefix ? { logGroupNamePrefix: prefix } : {},
        ),
      );

      return (res.logGroups ?? []).map((group) => ({
        name: group.logGroupName ?? "",
        arn: group.arn,
        retentionInDays: group.retentionInDays,
        createdAt: group.creationTime ?? 0,
        storedBytes: group.storedBytes ?? 0,
        metricFilterCount: group.metricFilterCount ?? 0,
      }));
    },

    async createLogGroup(input: CreateLogGroupInput) {
      try {
        await logsClient.send(
          new CreateLogGroupCommand({ logGroupName: input.name }),
        );
      } catch (err) {
        if (
          (err as { name?: string }).name !== "ResourceAlreadyExistsException"
        )
          throw err;
      }

      if (input.retentionInDays) {
        await logsClient.send(
          new PutRetentionPolicyCommand({
            logGroupName: input.name,
            retentionInDays: input.retentionInDays,
          }),
        );
      }
    },

    async deleteLogGroup(name: string) {
      await logsClient.send(new DeleteLogGroupCommand({ logGroupName: name }));
    },

    async listLogStreams(group: string) {
      const res = await logsClient.send(
        new DescribeLogStreamsCommand({
          logGroupName: group,
          orderBy: "LastEventTime",
          descending: true,
        }),
      );

      return (res.logStreams ?? []).map((stream) => ({
        name: stream.logStreamName ?? "",
        createdAt: stream.creationTime,
        firstEventAt: stream.firstEventTimestamp,
        lastEventAt: stream.lastEventTimestamp,
        lastIngestionAt: stream.lastIngestionTime,
        storedBytes: stream.storedBytes ?? 0,
      }));
    },

    async createLogStream(input: CreateLogStreamInput) {
      try {
        await logsClient.send(
          new CreateLogStreamCommand({
            logGroupName: input.group,
            logStreamName: input.name,
          }),
        );
      } catch (err) {
        if (
          (err as { name?: string }).name !== "ResourceAlreadyExistsException"
        )
          throw err;
      }
    },

    async deleteLogStream(group: string, stream: string) {
      await logsClient.send(
        new DeleteLogStreamCommand({
          logGroupName: group,
          logStreamName: stream,
        }),
      );
    },

    async getLogEvents(group: string, stream: string) {
      const res = await logsClient.send(
        new GetLogEventsCommand({
          logGroupName: group,
          logStreamName: stream,
          startFromHead: false,
        }),
      );

      return (res.events ?? []).map((event, index) => ({
        id: `${event.timestamp ?? 0}-${index}`,
        timestamp: event.timestamp ?? 0,
        message: event.message ?? "",
        ingestionTime: event.ingestionTime,
      }));
    },

    async putLogEvents(input: PutLogEventsInput) {
      await logsClient.send(
        new PutLogEventsCommand({
          logGroupName: input.group,
          logStreamName: input.stream,
          logEvents: input.events,
        }),
      );
    },

    async listAlarms() {
      const res = await cloudWatchClient.send(new DescribeAlarmsCommand({}));
      return (res.MetricAlarms ?? []).map((alarm) => ({
        alarmName: alarm.AlarmName ?? "",
        stateValue: alarm.StateValue ?? "INSUFFICIENT_DATA",
        stateReason: alarm.StateReason,
        metricName: alarm.MetricName,
        namespace: alarm.Namespace,
        threshold: alarm.Threshold,
      }));
    },

    async listMetrics() {
      const res = await cloudWatchClient.send(new ListMetricsCommand({}));
      return (res.Metrics ?? []).map((metric, index) => {
        const namespace = metric.Namespace ?? "Unknown";
        const metricName = metric.MetricName ?? "UnnamedMetric";
        const dimensions = (metric.Dimensions ?? []).map((dimension) => ({
          name: dimension.Name ?? "",
          value: dimension.Value ?? "",
        }));

        return {
          id: `${namespace}:${metricName}:${
            dimensions.map((d) => `${d.name}=${d.value}`).join(",") || index
          }`,
          namespace,
          metricName,
          dimensions,
        };
      });
    },
  };
}

export const cloudWatchService = createCloudWatchService();
