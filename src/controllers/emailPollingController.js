require("dotenv").config();
const { Queue, Worker } = require("bullmq"); 
const { Redis } = require("ioredis");
const { fetchUnseenEmails } = require("../services/gmailProcessing"); 

const redis = new Redis({
  host: "127.0.0.1", // Ensure Redis is running here
  port: 6379,
  maxRetriesPerRequest: null,
});

redis.on("connect", () => console.log("Connected to Redis!"));
redis.on("error", (err) => console.error("Redis connection error:", err));

const emailQueue = new Queue("emailPollingQueue", { connection: redis });

async function addToQueue() {
  await emailQueue.add("fetchEmails", {}, { repeat: { every: 10000 } }); // Repeat every 10 seconds
  console.log("Email polling task added to queue.");
}

async function stopQueue() {
  await emailQueue.obliterate({ force: true });
  console.log("Email polling task stopped.");
}

async function processQueue() {
  const worker = new Worker(
    "emailPollingQueue",
    async () => {
      console.log("Checking for new emails via queue...");
      await fetchUnseenEmails();
    },
    { connection: redis } // Pass Redis connection to Worker
  );

  worker.on("completed", (job) => {
    console.log(`Job with ID ${job.id} completed.`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job with ID ${job.id} failed with error:`, err.message);
  });
}

module.exports = { addToQueue, stopQueue, processQueue };
