import { createServer } from "node:http";
import process from "node:process";
import { Readable } from "node:stream";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Busboy from "busboy";
import { google } from "googleapis";
import { MongoClient } from "mongodb";

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
const MAX_MULTIPART_BODY_BYTES = 500 * 1024 * 1024;
const MAX_MEMORY_FILE_BYTES = 100 * 1024 * 1024;
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = process.env.MONGODB_DATABASE || "slam_book";
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || "entries";
const DRIVE_PARENT_FOLDER_ID = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required. Add it to backend/.env or your deployment environment.");
}

const mongoClient = new MongoClient(MONGODB_URI);
let entriesCollectionPromise;
let driveClientPromise;

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

function getContentType(request) {
  return request.headers["content-type"] || "";
}

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function getAdmissionFolderName(admissionNumber) {
  return admissionNumber.replace(/[\\/]/g, "-").trim();
}

async function getEntriesCollection() {
  if (!entriesCollectionPromise) {
    entriesCollectionPromise = mongoClient.connect().then(async (client) => {
      const collection = client.db(DATABASE_NAME).collection(COLLECTION_NAME);
      await collection.createIndex({ id: 1 }, { unique: true });
      return collection;
    });
  }

  return entriesCollectionPromise;
}

async function getDriveClient() {
  if (!driveClientPromise) {
    const authOptions = {
      scopes: ["https://www.googleapis.com/auth/drive"]
    };

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
      }

      authOptions.credentials = credentials;
    } else if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
      authOptions.keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
    } else {
      throw new Error(
        "Google Drive credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE and share the Drive folder with that service account."
      );
    }

    const auth = new google.auth.GoogleAuth(authOptions);
    driveClientPromise = auth.getClient().then((authClient) =>
      google.drive({ version: "v3", auth: authClient })
    );
  }

  return driveClientPromise;
}

function serializeEntry(entry) {
  const { _id, ...publicEntry } = entry;
  return {
    admissionNumber: "",
    vinodMemoryFiles: [],
    ...publicEntry
  };
}

async function readEntries() {
  const collection = await getEntriesCollection();
  const entries = await collection
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .toArray();

  return entries.map(serializeEntry);
}

async function getOrCreateAdmissionFolder(admissionNumber) {
  const drive = await getDriveClient();
  const folderName = getAdmissionFolderName(admissionNumber);
  const escapedName = escapeDriveQueryValue(folderName);
  const escapedParentId = escapeDriveQueryValue(DRIVE_PARENT_FOLDER_ID);
  const existingFolders = await drive.files.list({
    q: `'${escapedParentId}' in parents and name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name,webViewLink)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  if (existingFolders.data.files?.[0]) {
    return existingFolders.data.files[0];
  }

  const createdFolder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [DRIVE_PARENT_FOLDER_ID]
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true
  });

  return createdFolder.data;
}

async function uploadMemoryFilesToDrive(admissionNumber, memoryFiles) {
  if (memoryFiles.length === 0) {
    return [];
  }

  const drive = await getDriveClient();
  const folder = await getOrCreateAdmissionFolder(admissionNumber);

  const uploadedFiles = [];

  for (const [index, file] of memoryFiles.entries()) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = file.filename.replace(/[\\/]/g, "-") || `memory-${index + 1}`;
    const uploadedFile = await drive.files.create({
      requestBody: {
        name: `${timestamp}-${safeName}`,
        parents: [folder.id]
      },
      media: {
        mimeType: file.mimeType,
        body: Readable.from(file.buffer)
      },
      fields: "id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink,createdTime",
      supportsAllDrives: true
    });

    uploadedFiles.push({
      driveFileId: uploadedFile.data.id,
      folderId: folder.id,
      folderName: folder.name,
      name: uploadedFile.data.name,
      originalName: file.filename,
      mimeType: uploadedFile.data.mimeType || file.mimeType,
      size: Number(uploadedFile.data.size || file.size || 0),
      webViewLink: uploadedFile.data.webViewLink || "",
      webContentLink: uploadedFile.data.webContentLink || "",
      thumbnailLink: uploadedFile.data.thumbnailLink || "",
      createdTime: uploadedFile.data.createdTime || new Date().toISOString()
    });
  }

  return uploadedFiles;
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

function readMultipartEntryRequest(request) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers["content-length"] || 0);

    if (contentLength > MAX_MULTIPART_BODY_BYTES) {
      reject(new Error("Memory upload is too large. Please upload smaller files."));
      request.destroy();
      return;
    }

    const fields = {};
    const memoryFiles = [];
    const pendingFiles = [];
    const busboy = Busboy({
      headers: request.headers,
      limits: {
        fileSize: MAX_MEMORY_FILE_BYTES
      }
    });
    let settled = false;

    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, file, info) => {
      if (name !== "vinodMemoryFiles") {
        file.resume();
        return;
      }

      const mimeType = info.mimeType || "";

      if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
        file.resume();
        fail(new Error("Only image and video files can be added to memories."));
        return;
      }

      const chunks = [];
      let size = 0;
      let fileTooLarge = false;
      const filePromise = new Promise((resolveFile, rejectFile) => {
        file.on("data", (chunk) => {
          size += chunk.length;
          chunks.push(chunk);
        });

        file.on("limit", () => {
          fileTooLarge = true;
          file.resume();
        });

        file.on("end", () => {
          if (fileTooLarge) {
            rejectFile(new Error(`${info.filename} is too large. Please keep each file under 100 MB.`));
            return;
          }

          if (size > 0) {
            memoryFiles.push({
              filename: info.filename || "memory-file",
              mimeType,
              size,
              buffer: Buffer.concat(chunks)
            });
          }

          resolveFile();
        });

        file.on("error", rejectFile);
      });

      pendingFiles.push(filePromise);
    });

    busboy.on("finish", async () => {
      try {
        await Promise.all(pendingFiles);

        if (!settled) {
          settled = true;
          resolve({ body: fields, memoryFiles });
        }
      } catch (error) {
        fail(error);
      }
    });

    busboy.on("error", fail);
    request.on("error", fail);
    request.pipe(busboy);
  });
}

async function readEntryRequest(request) {
  if (getContentType(request).includes("multipart/form-data")) {
    return readMultipartEntryRequest(request);
  }

  return {
    body: await readJsonRequestBody(request),
    memoryFiles: []
  };
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
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/entries") {
      const entries = await readEntries();
      sendJson(response, 200, { entries });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/entries") {
      const { body, memoryFiles } = await readEntryRequest(request);
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

      const vinodMemoryFiles = await uploadMemoryFilesToDrive(entry.admissionNumber, memoryFiles);
      const nextEntry = {
        ...entry,
        vinodMemoryFiles,
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
