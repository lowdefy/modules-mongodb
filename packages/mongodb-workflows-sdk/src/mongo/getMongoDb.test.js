import { MongoMemoryServer, MongoMemoryReplSet } from "mongodb-memory-server";

import getMongoDb, { clearMongoClientCache } from "./getMongoDb.js";

describe("getMongoDb", () => {
  let standalone;
  let replSet;

  beforeAll(async () => {
    standalone = await MongoMemoryServer.create();
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  });

  afterAll(async () => {
    await clearMongoClientCache();
    await standalone.stop();
    await replSet.stop();
  });

  afterEach(async () => {
    await clearMongoClientCache();
  });

  test("throws when databaseUri is missing", async () => {
    await expect(getMongoDb({})).rejects.toThrow(/databaseUri is required/);
  });

  test("standalone topology sets useTransactions false and logs the mode", async () => {
    const logger = { log: jest.fn() };
    const { mongoDb, mongoClient, useTransactions } = await getMongoDb(
      { databaseUri: standalone.getUri() },
      { logger },
    );
    expect(useTransactions).toBe(false);
    expect(mongoDb).toBeTruthy();
    expect(mongoClient).toBeTruthy();
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0]).toMatch(/standalone/);
  });

  test("caches the client per databaseUri — second call reuses it", async () => {
    const uri = standalone.getUri();
    const first = await getMongoDb(
      { databaseUri: uri },
      { logger: { log: () => {} } },
    );
    const secondLogger = { log: jest.fn() };
    const second = await getMongoDb(
      { databaseUri: uri },
      { logger: secondLogger },
    );
    expect(second.mongoClient).toBe(first.mongoClient);
    expect(second.mongoDb).toBe(first.mongoDb);
    // Cached: the second call neither reconnects nor re-logs.
    expect(secondLogger.log).not.toHaveBeenCalled();
  });

  test("replica-set topology sets useTransactions true", async () => {
    const logger = { log: jest.fn() };
    const { useTransactions } = await getMongoDb(
      { databaseUri: replSet.getUri() },
      { logger },
    );
    expect(useTransactions).toBe(true);
    expect(logger.log.mock.calls[0][0]).toMatch(/transactional/);
  });

  test("useTransactions:false override forces the standalone path on a replica set", async () => {
    const { useTransactions } = await getMongoDb(
      { databaseUri: replSet.getUri(), useTransactions: false },
      { logger: { log: () => {} } },
    );
    expect(useTransactions).toBe(false);
  });
});
