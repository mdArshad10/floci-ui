import { Hono } from "hono";
import { eksService } from "../services/eks";

const app = new Hono();

app.get("/clusters", async (c) => {
  return c.json(await eksService.listClusters());
});

app.get("/clusters/:name", async (c) => {
  return c.json(await eksService.describeCluster(c.req.param("name")));
});

app.get("/clusters/:name/nodegroups", async (c) => {
  return c.json(await eksService.listNodegroups(c.req.param("name")));
});

app.get("/clusters/:name/nodegroups/:nodegroup", async (c) => {
  return c.json(
    await eksService.describeNodegroup(
      c.req.param("name"),
      c.req.param("nodegroup"),
    ),
  );
});

export default app;
