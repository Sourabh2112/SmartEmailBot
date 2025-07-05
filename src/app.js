require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const { addToQueue, stopQueue, processQueue } = require("./controllers/emailPollingController.js");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Routes
app.get("/", (req, res) => {
    res.send("Email Categorization Service is running!");
});

// Start email polling (schedule with BullMQ)
app.post("/start-email-polling", async (req, res) => {
    try {
        await addToQueue();
        await processQueue();
        res.status(200).json({ message: "Email polling started." });
    } catch (error) {
        console.error("Failed to start email polling:", error.message);
        res.status(500).json({ error: "Failed to start email polling." });
    }
});

// Stop email polling
app.post("/stop-email-polling", async (req, res) => {
    try {
        await stopQueue();
        res.status(200).json({ message: "Email polling stopped." });
    } catch (error) {
        console.error("Failed to stop email polling:", error.message);
        res.status(500).json({ error: "Failed to stop email polling." });
    }
});

app.get('/auth/google', (req, res) => {
    res.redirect(getAuthURL());
});

app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    const tokens = await getAccessToken(code);
    res.json({ message: "Authentication successful!", tokens });
});

// Error handler
app.use((err, req, res, next) => {
    console.error("An error occurred:", err.stack);
    res.status(500).json({ error: "An unexpected error occurred. Please try again later." });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
