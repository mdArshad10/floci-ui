import { Hono } from "hono";
import { rdsService } from "../services/rds";

const app = new Hono();

app.get("/instances", async (c) => {
  return c.json(await rdsService.listInstances());
});

app.get("/instances/:identifier", async (c) => {
  return c.json(await rdsService.describeInstance(c.req.param("identifier")));
});

export default app;
