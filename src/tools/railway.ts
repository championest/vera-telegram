import { config } from '../config.js';

const RAILWAY_GQL = 'https://backboard.railway.app/graphql/v2';

async function gql(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(RAILWAY_GQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.RAILWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Railway HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join(', '));
  return json.data;
}

export async function railwayListServices(args: Record<string, unknown>): Promise<string> {
  if (!config.RAILWAY_TOKEN) return 'railway tools ไม่พร้อม — ตั้งค่า RAILWAY_TOKEN ใน Railway';
  const projectId = String(args.project_id ?? config.RAILWAY_PROJECT_ID ?? '');
  if (!projectId) return 'ต้องระบุ project_id หรือตั้งค่า RAILWAY_PROJECT_ID';

  const data = (await gql(`
    query($id: String!) {
      project(id: $id) {
        name
        services { edges { node { id name updatedAt } } }
      }
    }
  `, { id: projectId })) as { project: { name: string; services: { edges: { node: { id: string; name: string; updatedAt: string } }[] } } };

  const services = data.project.services.edges.map(e => e.node);
  if (!services.length) return `โปรเจค "${data.project.name}" ไม่มี service`;
  return `🚂 ${data.project.name} services:\n` +
    services.map(s => `• ${s.name} (id: ${s.id})`).join('\n');
}

export async function railwayRedeploy(args: Record<string, unknown>): Promise<string> {
  if (!config.RAILWAY_TOKEN) return 'railway tools ไม่พร้อม — ตั้งค่า RAILWAY_TOKEN ใน Railway';
  const serviceId = String(args.service_id ?? '');
  const environmentId = String(args.environment_id ?? '');
  if (!serviceId || !environmentId) return 'ต้องระบุ service_id และ environment_id';

  await gql(`
    mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
  `, { serviceId, environmentId });

  return `✅ Redeploy triggered for service ${serviceId}`;
}

export async function railwayGetLogs(args: Record<string, unknown>): Promise<string> {
  if (!config.RAILWAY_TOKEN) return 'railway tools ไม่พร้อม — ตั้งค่า RAILWAY_TOKEN ใน Railway';
  const deploymentId = String(args.deployment_id ?? '');
  if (!deploymentId) return 'ต้องระบุ deployment_id';

  const data = (await gql(`
    query($id: String!, $limit: Int) {
      deploymentLogs(deploymentId: $id, limit: $limit) {
        timestamp
        message
        severity
      }
    }
  `, { id: deploymentId, limit: Number(args.limit ?? 50) })) as {
    deploymentLogs: { timestamp: string; message: string; severity: string }[]
  };

  const logs = data.deploymentLogs;
  if (!logs.length) return 'ไม่มี logs';
  return `📋 Logs (${logs.length}):\n` +
    logs.map(l => `[${l.severity}] ${l.message}`).join('\n');
}
