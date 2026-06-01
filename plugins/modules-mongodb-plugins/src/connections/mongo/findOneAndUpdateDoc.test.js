import inMemoryMongo from '../shared/inMemoryMongo.js';
import findOneAndUpdateDoc from './findOneAndUpdateDoc.js';

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await mongo.cleanup();
});

beforeEach(async () => {
  await mongo.db.collection('docs').deleteMany({});
});

test('returns the post-write document', async () => {
  await mongo.db.collection('docs').insertOne({ _id: 'x', n: 1 });
  const doc = await findOneAndUpdateDoc({
    mongoDb: mongo.db,
    collection: 'docs',
    filter: { _id: 'x' },
    update: { $set: { n: 2 } },
  });
  expect(doc).toMatchObject({ _id: 'x', n: 2 });
});

test('returns null when the filter matches zero docs (CAS miss)', async () => {
  await mongo.db.collection('docs').insertOne({ _id: 'x', n: 1 });
  const doc = await findOneAndUpdateDoc({
    mongoDb: mongo.db,
    collection: 'docs',
    filter: { _id: 'x', n: 999 },
    update: { $set: { n: 2 } },
  });
  expect(doc).toBeNull();
  // The doc was not modified.
  const after = await mongo.db.collection('docs').findOne({ _id: 'x' });
  expect(after.n).toBe(1);
});
