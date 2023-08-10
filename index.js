import express from 'express';
import sqlite3 from 'sqlite3';
import Bard from 'bard-ai';
import fetch from 'node-fetch';

const app = express();
const port = 3000;

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

// Initialize Bard instance
const bard = new Bard({
  "__Secure-1PSID": "Zgiv2N92706_yTb-dIIm5DwrnKyuyThHZz4EAhowqnXNnyHS-S6VJwXh63lWz97UPvTHGA.",
  "__Secure-1PSIDTS": "sidts-CjEBSAxbGfe63ipTpC0Uj3daPb9gHSaMSG7zDhi--6EkwheHhJlhxDO9OD86d2AyDGszEAA"
});

// Initialize SQLite database
const db = new sqlite3.Database('chats.db', err => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the database.');
  }
});

// Create a new table to store chat data
db.run(`
  CREATE TABLE IF NOT EXISTS chats (
    uid TEXT PRIMARY KEY,
    chat_export TEXT
  )
`);

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
      // Check if chat exists in the database for the given UID
      db.get('SELECT chat_export FROM chats WHERE uid = ?', [uid], async (err, row) => {
        if (err) {
          console.error('Database error:', err.message);
          res.status(500).json({ error: 'An internal server error occurred.' });
          return;
        }

        if (row) {
          // Use existing chat export object to continue the conversation
          const existingChat = bard.createChat(JSON.parse(row.chat_export));
          const response = await existingChat.ask(prompt, options);
          const modifiedContent = cleanContentAndExtractImages(response);
          res.json({ data: modifiedContent });
        } else {
          // Create a new chat for a new user
          const newChat = bard.createChat();
          const response = await newChat.ask(prompt, options);
          const chatExport = JSON.stringify(await newChat.export());

          // Store chat export object in the database
          db.run('INSERT INTO chats (uid, chat_export) VALUES (?, ?)', [uid, chatExport], err => {
            if (err) {
              console.error('Database error:', err.message);
              res.status(500).json({ error: 'An internal server error occurred.' });
              return;
            }
            const modifiedContent = cleanContentAndExtractImages(response);
            res.json({ data: modifiedContent });
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
