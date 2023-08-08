import express from 'express';
import sqlite3 from 'sqlite3';
import Bard from 'bard-ai';
import fetch from 'node-fetch';

const app = express();
const port = 3000;

// Initialize Bard instance
const bard = new Bard({
  "__Secure-1PSID": "Zgiv2NoHHyYYyDhLImkY7QmwASbp6k72CiZIMaM2Tc9kJ3PZJkOywx2pKWDCB4Ty-bSMww.",
  "__Secure-1PSIDTS": "sidts-CjIBSAxbGeL1pTAqkIOcl_ito3FU5oN8ZsNv0LW00zc-W_Vq6lvob_EJ-gzmawP0d2UhqxAA"
});

function cleanContentAndExtractImages(output) {
  const imageRegex = /\[Image of .+?\]\(.*?\)/g;

  const content = output.content.replace(imageRegex, '');

  const images = output.images.filter(image => image.tag && image.url && image.info)
                             .map(image => ({
                               tag: image.tag,
                               url: image.url,
                               info: image.info
                             }));

  if (images.length > 0) {
    return {
      content,
      images
    };
  } else {
    return {
      content
    };
  }
}


// Initialize SQLite database
const db = new sqlite3.Database('chats.db', err => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the database.');
  }
});

// Create chats table if not exists
db.run(`CREATE TABLE IF NOT EXISTS chats (uid TEXT, chatIDs JSON)`);

// Endpoint to interact with Bard using GET
app.get('/chat', async (req, res) => {
  try {
    const { uid, prompt, img } = req.query;

    let options = { format: Bard.JSON };

    if (img) {
      const imageBuffer = await fetch(img).then(res => res.arrayBuffer());
      options.image = imageBuffer;
    }

    if (!uid) {
      // Create a new chat
      const myConversation = bard.createChat();
      const response = await myConversation.ask(prompt, options);
      const modifiedContent = cleanContentAndExtractImages(response);
      res.json({ data: modifiedContent });
    } else {
      // Check if UID exists in the database
      const query = `SELECT chatIDs FROM chats WHERE uid = ?`;
      db.get(query, [uid], async (err, row) => {
        if (err) {
          console.error('Error retrieving chatIDs from database:', err.message);
          res.status(500).json({ error: 'An internal server error occurred.' });
          return;
        }

        if (row && row.chatIDs) {
          const chatIDs = row.chatIDs;
          // Create a new chat
          const continuedConversation = bard.createChat({
    conversationID: chatIDs.conversationID,
    responseID: chatIDs.responseID,
    choiceID: chatIDs.choiceID,
    _reqID: chatIDs._reqID
});
          // Perform the conversation
          const response = await continuedConversation.ask(prompt, options);

          // Update chatIDs in the database
          const updatedChatIDs = await continuedConversation.export();
          const updateQuery = `UPDATE chats SET chatIDs = ? WHERE uid = ?`;
          db.run(updateQuery, [JSON.stringify(updatedChatIDs), uid], err => {
            if (err) {
              console.error('Error updating chatIDs in database:', err.message);
            } else {
              console.log(`ChatIDs updated in the database for ${uid}.`);
            }
          });

          const modifiedContent = cleanContentAndExtractImages(response);
          console.log(updatedChatIDs)
          res.json({ data: modifiedContent });
        } else {
          // Create a new chat for a new user
          const myConversation = bard.createChat();
          const response = await myConversation.ask(prompt, options);

          // Store chatIDs in the database
          const chatIDs = await myConversation.export();
          const insertQuery = `INSERT INTO chats (uid, chatIDs) VALUES (?, ?)`;
          db.run(insertQuery, [uid, JSON.stringify(chatIDs)], err => {
            if (err) {
              console.error('Error inserting chatIDs into database:', err.message);
              res.status(500).json({ error: 'An internal server error occurred.' });
            } else {
              console.log(`ChatIDs inserted into the database for ${uid}.`);
              const modifiedContent = cleanContentAndExtractImages(response);
              res.json({ data: modifiedContent });
            }
          });
        }
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
