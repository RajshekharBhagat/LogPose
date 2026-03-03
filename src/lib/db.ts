import { MongoClient } from "mongodb";
import { env } from "@/lib/env";

// Cache the client across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
}

const client: MongoClient =
  global._mongoClient ?? new MongoClient(env.MONGODB_URI);

if (process.env.NODE_ENV !== "production") {
  global._mongoClient = client;
}

export async function getDb() {
  await client.connect();
  return client.db("log_pose");
}
