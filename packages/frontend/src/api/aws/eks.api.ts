import { apiClient, apiEndpointKeys } from "@/api/api";
import type { ResourceSummary } from "@/api/types";

export type EksVpcConfig = {
  subnetIds: string[];
  securityGroupIds: string[];
  clusterSecurityGroupId?: string;
  vpcId?: string;
  endpointPublicAccess?: boolean;
  endpointPrivateAccess?: boolean;
  publicAccessCidrs: string[];
};

export type EksCluster = {
  name: string;
  arn?: string;
  createdAt?: string;
  version?: string;
  endpoint?: string;
  roleArn?: string;
  status?: string;
  platformVersion?: string;
  certificateAuthority?: {
    data?: string;
  };
  resourcesVpcConfig?: EksVpcConfig;
  tags: Record<string, string>;
  nodegroupCount?: number;
};

export type EksNodegroup = {
  name: string;
  arn?: string;
  clusterName: string;
  version?: string;
  releaseVersion?: string;
  createdAt?: string;
  modifiedAt?: string;
  status?: string;
  capacityType?: string;
  instanceTypes: string[];
  subnets: string[];
  nodeRole?: string;
  scalingConfig?: {
    minSize?: number;
    maxSize?: number;
    desiredSize?: number;
  };
  labels: Record<string, string>;
  tags: Record<string, string>;
};

export async function listEksClusters(
  signal?: AbortSignal,
): Promise<EksCluster[]> {
  const res = await apiClient.call<EksCluster[]>(
    apiEndpointKeys.aws.eks.clusters.list,
    { signal },
  );

  return res.data;
}

export async function describeEksCluster(
  name: string,
  signal?: AbortSignal,
): Promise<EksCluster> {
  const res = await apiClient.call<EksCluster>(
    apiEndpointKeys.aws.eks.clusters.describe,
    { signal },
    { name },
  );

  return res.data;
}

export async function listEksNodegroups(
  clusterName: string,
  signal?: AbortSignal,
): Promise<EksNodegroup[]> {
  const res = await apiClient.call<EksNodegroup[]>(
    apiEndpointKeys.aws.eks.nodegroups.list,
    { signal },
    { name: clusterName },
  );

  return res.data;
}

export async function describeEksNodegroup(
  clusterName: string,
  nodegroupName: string,
  signal?: AbortSignal,
): Promise<EksNodegroup> {
  const res = await apiClient.call<EksNodegroup>(
    apiEndpointKeys.aws.eks.nodegroups.describe,
    { signal },
    { name: clusterName, nodegroup: nodegroupName },
  );

  return res.data;
}

export async function listEksResources(
  signal?: AbortSignal,
): Promise<ResourceSummary[]> {
  const clusters = await listEksClusters(signal);

  return clusters.map((cluster) => ({
    id: cluster.arn ?? cluster.name,
    name: cluster.name,
    status: cluster.status,
    metadata: {
      version: cluster.version,
      platformVersion: cluster.platformVersion,
      nodegroups: cluster.nodegroupCount ?? 0,
      vpcId: cluster.resourcesVpcConfig?.vpcId,
    },
  }));
}

export const eksClient = {
  listClusters: listEksClusters,
  describeCluster: describeEksCluster,
  listNodegroups: listEksNodegroups,
  describeNodegroup: describeEksNodegroup,
  listResources: listEksResources,
};
