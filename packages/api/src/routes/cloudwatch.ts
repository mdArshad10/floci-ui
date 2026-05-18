import { Hono } from "hono";
import {
  cloudWatchService,
  type CreateLogGroupInput,
  type CreateLogStreamInput,
  type PutLogEventsInput,
} from "../services/cloudwatch";

const app = new Hono();

app.get("/log-groups", async (c) => {
  return c.json(await cloudWatchService.listLogGroups(c.req.query("prefix")));
});

app.post("/log-groups", async (c) => {
  await cloudWatchService.createLogGroup(
    await c.req.json<CreateLogGroupInput>(),
  );
  return c.json({ ok: true });
});

app.delete("/log-groups", async (c) => {
  await cloudWatchService.deleteLogGroup(c.req.query("name") ?? "");
  return c.json({ ok: true });
});

app.get("/log-streams", async (c) => {
  return c.json(
    await cloudWatchService.listLogStreams(c.req.query("group") ?? ""),
  );
});

app.post("/log-streams", async (c) => {
  await cloudWatchService.createLogStream(
    await c.req.json<CreateLogStreamInput>(),
  );
  return c.json({ ok: true });
});

app.delete("/log-streams", async (c) => {
  await cloudWatchService.deleteLogStream(
    c.req.query("group") ?? "",
    c.req.query("stream") ?? "",
  );
  return c.json({ ok: true });
});

app.get("/log-events", async (c) => {
  return c.json(
    await cloudWatchService.getLogEvents(
      c.req.query("group") ?? "",
      c.req.query("stream") ?? "",
    ),
  );
});

app.post("/log-events", async (c) => {
  await cloudWatchService.putLogEvents(await c.req.json<PutLogEventsInput>());
  return c.json({ ok: true });
});

app.get("/alarms", async (c) => {
  return c.json(await cloudWatchService.listAlarms());
});

app.get("/metrics", async (c) => {
  return c.json(await cloudWatchService.listMetrics());
});

export default app;
