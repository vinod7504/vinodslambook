import { createServer } from "node:http";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, ServerApiVersion } from "mongodb";

const backendDirectory = dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile?.(resolve(backendDirectory, ".env"));
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

const PORT = process.env.PORT || 4000;
const MAX_JSON_BODY_BYTES = 15 * 1024 * 1024;
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = process.env.MONGODB_DATABASE || "slam_book";
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || "entries";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MONGODB_SERVER_SELECTION_TIMEOUT_MS = Number(
  process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000
);

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required. Add it to backend/.env or your deployment environment.");
}

const mongoClient = new MongoClient(MONGODB_URI, {
  autoSelectFamily: false,
  family: 4,
  serverSelectionTimeoutMS: MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true
  }
});
let entriesCollectionPromise;

const allowedFields = [
  "name",
  "admissionNumber",
  "nickname",
  "dob",
  "phone",
  "email",
  "address",
  "ambition",
  "bestFriend",
  "favoriteColor",
  "favoriteSong",
  "favoriteMovie",
  "favoriteFood",
  "hobby",
  "dreamPlace",
  "firstMemory",
  "funnyMoment",
  "message",
  "secretWish",
  "signature",
  "photo",
  "vinodMemoryText"
];

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Admin-Username,X-Admin-Password",
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(payload));
}

function isAdminRequest(request) {
  return (
    request.headers["x-admin-username"] === ADMIN_USERNAME &&
    request.headers["x-admin-password"] === ADMIN_PASSWORD
  );
}

async function getEntriesCollection() {
  if (!entriesCollectionPromise) {
    entriesCollectionPromise = mongoClient
      .connect()
      .then(async (client) => {
        const collection = client.db(DATABASE_NAME).collection(COLLECTION_NAME);
        await collection.createIndex({ id: 1 }, { unique: true });
        return collection;
      })
      .catch((error) => {
        entriesCollectionPromise = undefined;
        throw error;
      });
  }

  return entriesCollectionPromise;
}

async function getHealthPayload(deep = false) {
  const payload = {
    ok: true,
    nodeVersion: process.version,
    mongoConfigured: Boolean(MONGODB_URI)
  };

  if (!deep) {
    return payload;
  }

  try {
    const collection = await getEntriesCollection();
    await collection.db.command({ ping: 1 });
    payload.database = { ok: true };
  } catch (error) {
    payload.ok = false;
    payload.database = {
      ok: false,
      message: error.message || "Database connection failed."
    };
  }

  return payload;
}

function serializeEntry(entry) {
  return {
    admissionNumber: "",
    ...entry
  };
}

async function readEntries() {
  const collection = await getEntriesCollection();
  const entries = await collection
    .find(
      {},
      {
        projection: {
          _id: 0,
          vinodMemoryFiles: 0,
          vinodMemoryMedia: 0,
          vinodMemoryMediaName: 0,
          vinodMemoryMediaType: 0
        }
      }
    )
    .sort({ createdAt: -1 })
    .toArray();

  return entries.map(serializeEntry);
}

function readJsonRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (Buffer.byteLength(body) > MAX_JSON_BODY_BYTES) {
        reject(new Error("Photo or form data is too large. Please use a smaller file."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });

    request.on("error", reject);
  });
}

function sanitizeEntry(body) {
  const entry = {};

  for (const field of allowedFields) {
    entry[field] = typeof body[field] === "string" ? body[field].trim() : "";
  }

  entry.name = entry.name.trim();
  entry.admissionNumber = entry.admissionNumber.trim();

  return entry;
}

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Admin-Username,X-Admin-Password");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      const payload = await getHealthPayload(url.searchParams.get("deep") === "true");
      sendJson(response, payload.ok ? 200 : 500, payload);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/entries") {
      const entries = await readEntries();
      sendJson(response, 200, { entries });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/entries") {
      const body = await readJsonRequestBody(request);
      const entry = sanitizeEntry(body);
      const id = slugify(`${entry.admissionNumber}-${entry.name}`);

      if (!entry.name || !entry.admissionNumber || !id) {
        sendJson(response, 400, {
          message: "Full Name and Admission Number are needed to save a unique slam book page."
        });
        return;
      }

      const collection = await getEntriesCollection();
      const existingEntry = await collection.findOne({ id }, { projection: { _id: 1 } });

      if (existingEntry) {
        sendJson(response, 409, {
          message: "This admission number and name are already saved."
        });
        return;
      }

      const nextEntry = {
        ...entry,
        id,
        createdAt: new Date().toISOString()
      };

      await collection.insertOne(nextEntry);
      sendJson(response, 201, { entry: nextEntry });
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/entries/")) {
      if (!isAdminRequest(request)) {
        sendJson(response, 403, { message: "Only admin can delete slam book pages." });
        return;
      }

      const id = decodeURIComponent(url.pathname.replace("/api/entries/", ""));
      const collection = await getEntriesCollection();
      const result = await collection.deleteOne({ id });

      if (result.deletedCount === 0) {
        sendJson(response, 404, { message: "Slam book page not found." });
        return;
      }

      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 404, { message: "Route not found." });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${request.method} ${url.pathname}`, error);
    sendJson(response, 500, { message: error.message || "Server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Slam book backend running at http://localhost:${PORT}`);
});

async function closeMongoConnection() {
  await mongoClient.close();
}

process.on("SIGINT", () => {
  closeMongoConnection().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  closeMongoConnection().finally(() => process.exit(0));
});
