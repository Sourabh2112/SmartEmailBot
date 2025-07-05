const { google } = require("googleapis");
const {
  oauth2Client,
  refreshAccessToken,
  loadTokens,
} = require("../auth/gmailAuth");
const { categorizeEmail } = require("./gemini"); // Import categorization service

// Function to send a reply to an email
async function sendReply(email, category) {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const categoryReplies = {
    Interested: "Thank you for the opportunity. What are the next steps?",
    "Not Interested": "Thanks for your response :) ",
    "More Information":
      "Thanks for your response. What else could I help you with?",
  };

  const replyBody = categoryReplies[category] || "Thank you for your email.";

  const rawMessage = [
    `To: ${email.from}`, // Recipient's email
    `Subject: Re: ${email.subject}`, // Ensure it's a reply subject
    `In-Reply-To: ${email.messageId}`, // Link to the original message ID
    `References: ${email.messageId}`, // Ensure it's part of the thread
    "Content-Type: text/plain; charset=UTF-8", // Content type
    "",
    replyBody, // The reply content
  ].join("\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
        threadId: email.threadId, 
      },
    });
    console.log(`Replied to ${email.from} with category: ${category}`);
  } catch (error) {
    console.error(`Failed to reply to ${email.from}:`, error.message);
  }
}

// Function to ensure a label exists
async function ensureLabelExists(labelName) {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    const res = await gmail.users.labels.list({ userId: "me" });
    const labels = res.data.labels || [];

    const existingLabel = labels.find((label) => label.name === labelName);
    if (existingLabel) {
      return existingLabel.id;
    }

    const newLabelRes = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    console.log(`Created label: ${labelName}`);
    return newLabelRes.data.id;
  } catch (error) {
    console.error(`Error ensuring label ${labelName} exists:`, error.message);
    throw error;
  }
}

// Function to move an email to a specific label
async function moveEmailToLabel(emailId, labelName) {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    const labelId = await ensureLabelExists(labelName);
    await gmail.users.messages.modify({
      userId: "me",
      id: emailId,
      requestBody: {
        addLabelIds: [labelId],
        removeLabelIds: ["INBOX"],
      },
    });
    console.log(`Moved email ${emailId} to label: ${labelName}`);
  } catch (error) {
    console.error(
      `Failed to move email ${emailId} to label ${labelName}:`,
      error.message
    );
  }
}

// Fetch and process unseen emails
async function fetchUnseenEmails() {
  try {
    await loadTokens();

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const res = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["UNREAD"],
      maxResults: 1,
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) {
      console.log("No unseen emails found.");
      return [];
    }

    const emailDetails = await Promise.all(
      messages.map(async (message) => {
        try {
          const msg = await gmail.users.messages.get({
            userId: "me",
            id: message.id,
          });

          const headers = msg.data.payload.headers;
          const subject =
            headers.find((header) => header.name === "Subject")?.value ||
            "No Subject";
          const from =
            headers.find((header) => header.name === "From")?.value ||
            "Unknown Sender";

          let body = "";
          if (msg.data.payload.parts) {
            const part = msg.data.payload.parts.find(
              (p) => p.mimeType === "text/plain"
            );
            if (part && part.body.data) {
              body = Buffer.from(part.body.data, "base64").toString();
            }
          } else if (msg.data.payload.body.data) {
            body = Buffer.from(msg.data.payload.body.data, "base64").toString();
          }

          return { id: message.id, subject, from, body };
        } catch (messageError) {
          console.error(
            `Error processing message ${message.id}:`,
            messageError
          );
          return null;
        }
      })
    );

    //categorizingEmails
    const categorizedEmails = await Promise.all(
      emailDetails.map(async (email) => {
        if (email) {
          const category = await categorizeEmail(email.body);
          await sendReply(email, category); // Send a reply based on the category
          await moveEmailToLabel(email.id, category); // Move email to the appropriate label
          return { ...email, category };
        }
        return null;
      })
    );

    // Mark emails as read after replying
    await Promise.all(
      categorizedEmails.map(async (email) => {
        if (email) {
          try {
            await gmail.users.messages.modify({
              userId: "me",
              id: email.id,
              requestBody: {
                removeLabelIds: ["UNREAD"],
              },
            });
            console.log(`Marked email from ${email.from} as read.`);
          } catch (error) {
            console.error(
              `Failed to mark email ${email.id} as read:`,
              error.message
            );
          }
        }
      })
    );

    return categorizedEmails.filter((email) => email !== null);
  } catch (error) {
    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403)
    ) {
      console.log("Token expired or invalid. Attempting to refresh...");
      try {
        await refreshAccessToken();
        return fetchUnseenEmails();
      } catch (refreshError) {
        console.error("Failed to refresh token:", refreshError);
        return [];
      }
    }
    console.error("Error fetching emails:", error);
    return [];
  }
}

// Start polling for unseen emails
function startEmailPolling(intervalMs = 10000) {
  setInterval(async () => {
    console.log("Checking for new unseen emails...");
    const emails = await fetchUnseenEmails();
    if (emails.length > 0) {
      console.log("Processed Emails:", emails);
    }
  }, intervalMs);
}

module.exports = { fetchUnseenEmails, startEmailPolling };
