import { Query, ID, Permission, Role } from 'node-appwrite';

export const DB_ID = 'arfidwatch';

export function userPerms(userId) {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}

export function createDb(databases) {
  return {
    /** List documents with cursor-based pagination; returns up to `limit`. */
    async find(collectionId, queries = [], limit = 5000) {
      const all = [];
      let lastId = null;
      // Appwrite perf degrades badly with large batch sizes.
      // Use 250-doc pages for fast individual requests.
      const batch = Math.min(limit, 250);
      while (all.length < limit) {
        const q = [...queries, Query.limit(batch)];
        if (lastId) q.push(Query.cursorAfter(lastId));
        const r = await databases.listDocuments(DB_ID, collectionId, q);
        all.push(...r.documents);
        if (r.documents.length < batch) break;
        lastId = r.documents[r.documents.length - 1].$id;
      }
      return all.slice(0, limit);
    },

    async findOne(collectionId, queries = []) {
      const r = await databases.listDocuments(DB_ID, collectionId, [...queries, Query.limit(1)]);
      return r.documents[0] || null;
    },

    async create(collectionId, data, userId = null) {
      const perms = userId ? userPerms(userId) : [];
      return databases.createDocument(DB_ID, collectionId, ID.unique(), data, perms);
    },

    /** Batch-create with concurrency. */
    async createMany(collectionId, dataArray, userId = null, concurrency = 15) {
      const perms = userId ? userPerms(userId) : [];
      const results = [];
      for (let i = 0; i < dataArray.length; i += concurrency) {
        const chunk = dataArray.slice(i, i + concurrency);
        const batch = await Promise.all(
          chunk.map(d => databases.createDocument(DB_ID, collectionId, ID.unique(), d, perms)),
        );
        results.push(...batch);
      }
      return results;
    },

    async update(collectionId, docId, data) {
      return databases.updateDocument(DB_ID, collectionId, docId, data);
    },

    async remove(collectionId, docId) {
      return databases.deleteDocument(DB_ID, collectionId, docId);
    },

    /** Delete all docs matching queries. Returns count. */
    async removeMany(collectionId, queries = [], concurrency = 15) {
      let total = 0;
      let lastId = null;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const q = [...queries, Query.limit(100)];
        if (lastId) q.push(Query.cursorAfter(lastId));
        const r = await databases.listDocuments(DB_ID, collectionId, q);
        if (!r.documents.length) break;
        for (let i = 0; i < r.documents.length; i += concurrency) {
          const chunk = r.documents.slice(i, i + concurrency);
          await Promise.all(chunk.map(d => databases.deleteDocument(DB_ID, collectionId, d.$id)));
        }
        total += r.documents.length;
        if (r.documents.length < 100) break;
        lastId = null; // reset — docs were deleted, start from beginning
      }
      return total;
    },

    async count(collectionId, queries = []) {
      const r = await databases.listDocuments(DB_ID, collectionId, [...queries, Query.limit(1)]);
      return r.total;
    },

    raw: databases,
    DB_ID,
  };
}
