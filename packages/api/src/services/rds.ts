import {
  DescribeDBInstancesCommand,
  type DBInstance,
  type RDSClient,
} from "@aws-sdk/client-rds";
import { awsClients } from "../aws";

export type RdsEndpoint = {
  address?: string;
  port?: number;
  hostedZoneId?: string;
};

export type RdsVpcSecurityGroup = {
  id?: string;
  status?: string;
};

export type RdsSubnet = {
  identifier?: string;
  availabilityZone?: string;
  status?: string;
};

export type RdsDbSubnetGroup = {
  name?: string;
  vpcId?: string;
  status?: string;
  subnets: RdsSubnet[];
};

export type RdsInstance = {
  identifier: string;
  arn?: string;
  resourceId?: string;
  status?: string;
  engine?: string;
  engineVersion?: string;
  instanceClass?: string;
  dbName?: string;
  masterUsername?: string;
  allocatedStorage?: number;
  storageType?: string;
  availabilityZone?: string;
  multiAz?: boolean;
  publiclyAccessible?: boolean;
  iamDatabaseAuthenticationEnabled?: boolean;
  preferredBackupWindow?: string;
  preferredMaintenanceWindow?: string;
  endpoint?: RdsEndpoint;
  vpcSecurityGroups: RdsVpcSecurityGroup[];
  subnetGroup?: RdsDbSubnetGroup;
};

function toRdsInstance(instance: DBInstance): RdsInstance {
  return {
    identifier: instance.DBInstanceIdentifier ?? "",
    arn: instance.DBInstanceArn,
    resourceId: instance.DbiResourceId,
    status: instance.DBInstanceStatus,
    engine: instance.Engine,
    engineVersion: instance.EngineVersion,
    instanceClass: instance.DBInstanceClass,
    dbName: instance.DBName,
    masterUsername: instance.MasterUsername,
    allocatedStorage: instance.AllocatedStorage,
    storageType: instance.StorageType,
    availabilityZone: instance.AvailabilityZone,
    multiAz: instance.MultiAZ,
    publiclyAccessible: instance.PubliclyAccessible,
    iamDatabaseAuthenticationEnabled: instance.IAMDatabaseAuthenticationEnabled,
    preferredBackupWindow: instance.PreferredBackupWindow,
    preferredMaintenanceWindow: instance.PreferredMaintenanceWindow,
    endpoint: instance.Endpoint
      ? {
          address: instance.Endpoint.Address,
          port: instance.Endpoint.Port,
          hostedZoneId: instance.Endpoint.HostedZoneId,
        }
      : undefined,
    vpcSecurityGroups: (instance.VpcSecurityGroups ?? []).map((group) => ({
      id: group.VpcSecurityGroupId,
      status: group.Status,
    })),
    subnetGroup: instance.DBSubnetGroup
      ? {
          name: instance.DBSubnetGroup.DBSubnetGroupName,
          vpcId: instance.DBSubnetGroup.VpcId,
          status: instance.DBSubnetGroup.SubnetGroupStatus,
          subnets: (instance.DBSubnetGroup.Subnets ?? []).map((subnet) => ({
            identifier: subnet.SubnetIdentifier,
            availabilityZone: subnet.SubnetAvailabilityZone?.Name,
            status: subnet.SubnetStatus,
          })),
        }
      : undefined,
  };
}

export function createRdsService(client: RDSClient = awsClients.rds) {
  return {
    async listInstances(): Promise<RdsInstance[]> {
      const instances: RdsInstance[] = [];
      let marker: string | undefined;

      do {
        const res = await client.send(
          new DescribeDBInstancesCommand({ Marker: marker }),
        );
        instances.push(...(res.DBInstances ?? []).map(toRdsInstance));
        marker = res.Marker;
      } while (marker);

      return instances;
    },

    async describeInstance(identifier: string): Promise<RdsInstance> {
      const res = await client.send(
        new DescribeDBInstancesCommand({ DBInstanceIdentifier: identifier }),
      );
      return toRdsInstance(res.DBInstances?.[0] ?? {});
    },
  };
}

export const rdsService = createRdsService();
