const { google } = require("googleapis");
require("dotenv").config();
const fs = require("fs").promises;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate Google Auth URL
const getAuthURL = () => {
  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    //"https://www.googleapis.com/auth/gmail.metadata",
  ];
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Force token refresh
    scope: scopes,
  });
};

// Refresh access token
const refreshAccessToken = async () => {
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await fs.writeFile("tokens.json", JSON.stringify(credentials));
    return credentials;
  } catch (error) {
    console.error("Token refresh failed:", error);
    return null;
  }
};

// Exchange authorization code for tokens and store them
const getAccessToken = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    await fs.writeFile("tokens.json", JSON.stringify(tokens));
    return tokens;
  } catch (error) {
    console.error("Error getting access token:", error);
    throw error;
  }
};

// Load tokens from file
const loadTokens = async () => {
  try {
    const tokensFile = await fs.readFile("tokens.json", "utf8");
    const tokens = JSON.parse(tokensFile);
    oauth2Client.setCredentials(tokens);
    
    // Check token expiration
    if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
      console.log("Token expired, refreshing...");
      await refreshAccessToken();
    }
  } catch (error) {
    console.log("No valid tokens found. Authentication required.");
  }
};

// Initialize token loading
loadTokens();

module.exports = { 
  getAuthURL, 
  getAccessToken, 
  oauth2Client,
  refreshAccessToken,
  loadTokens 
};