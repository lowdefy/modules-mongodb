import { MongoMemoryServer } from "mongodb-memory-server";

import AiText from "./AiText/AiText.js";
import EventsTimeline from "./EventsTimeline/EventsTimeline.js";
import ReportingData from "./ReportingData/ReportingData.js";
import WorkflowAPI from "./WorkflowAPI/WorkflowAPI.js";
import getMongoDb, { clearMongoClientCache } from "./mongo/getMongoDb.js";

const quiet = { logger: { log: () => {} } };

describe("meta.dataSet declarations", () => {
  test.each([
    ["EventsTimeline", EventsTimeline],
    ["WorkflowAPI", WorkflowAPI],
    ["ReportingData", ReportingData],
  ])("%s is redirected to the run's database", (_name, connection) => {
    expect(connection.meta.dataSet).toBe("redirect");
  });

  test("AiText keeps its real target", () => {
    expect(AiText.meta.dataSet).toBe("external");
  });
});

describe("getMongoDb under one URI and several database names", () => {
  let server;

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await clearMongoClientCache();
    await server.stop();
  });

  test("shares the client and returns each call's own database", async () => {
    const databaseUri = server.getUri();
    const first = await getMongoDb(
      { databaseUri, databaseName: "ld_run_a" },
      quiet,
    );
    const second = await getMongoDb(
      { databaseUri, databaseName: "ld_run_b" },
      quiet,
    );

    expect(second.mongoClient).toBe(first.mongoClient);
    expect(first.mongoDb.databaseName).toBe("ld_run_a");
    expect(second.mongoDb.databaseName).toBe("ld_run_b");

    await first.mongoDb.collection("rows").insertOne({ run: "a" });
    expect(await second.mongoDb.collection("rows").countDocuments()).toBe(0);
    expect(await first.mongoDb.collection("rows").countDocuments()).toBe(1);
  });
});
