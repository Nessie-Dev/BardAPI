import express from 'express';
import sqlite3 from 'sqlite3';
import Bard from './bard.js';
import fetch from 'node-fetch';
import fs from 'fs';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());


async function readCookies() {
  try {
    const cookiesData = fs.readFileSync('cookies.json', 'utf8');
    return JSON.parse(cookiesData);
  } catch (error) {
    if (error.code === 'ENOENT') {
      fs.writeFileSync('cookies.json', JSON.stringify({}, null, 2), 'utf8');
      return {};
    } else {
      console.error('Error reading cookies:', error);
      return null;
    }
  }
}

async function updateCookies(cookiesObject) {
  try {
    fs.writeFileSync('cookies.json', JSON.stringify(cookiesObject, null, 2), 'utf8');
    console.log('Cookies updated successfully');
  } catch (error) {
    console.error('Error updating cookies:', error);
  }
}


function cleanContentAndExtractImages(output) {
    const content = output.content;

  const images = output.images;

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
};


const db = new sqlite3.Database('chats.db', err => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the database.');
  }
});


db.run(`
  CREATE TABLE IF NOT EXISTS chats (
    uid TEXT PRIMARY KEY,
    chat_export TEXT
  )
`);
let bard;

app.post('/update', async (req, res) => {
  console.log(`Request recived for updating cookies.`)
  const data = req.body;

  try {
    if (!data) {
      
      return res.status(400).json({ error: 'Bad Request', message: 'Required cookies are missing.' });
    }

    
    await updateCookies(data);

    console.log('Cookies updated successfully.');
    res.status(200).json({ message: 'Cookies updated successfully.' });
  } catch (error) {
    
    res.status(500).json({ error: 'Internal Server Error', message: 'An error occurred while updating cookies.' });
  }
});

app.get('/bard', async (req, res) => {
try {
bard = new Bard(await readCookies());
 console.log('Cookies updated successfully.');
    res.status(200).json({ message: 'Cookies updated successfully.' });
  } catch (error) {
    
    res.status(500).json({ error: 'Internal Server Error', message: 'An error occurred while updating cookies.' });
  }

});

app.get('/chat', async (req, res) => {
  if (bard == undefined) {
  bard = new Bard(await readCookies());
  };
  try {
    const { uid, prompt, img } = req.query;
    if (!prompt) {
      res.status(400).send('Missing prompt parameter');
      return;
    }

    let options = { format: Bard.JSON };

    if (img) {
      const imageBuffer = await fetch(img).then(res => res.arrayBuffer());
      options.image = imageBuffer;
    }

    if (!uid) {

      const myConversation = bard.createChat();
      const response = await myConversation.ask(prompt, options);
      const modifiedContent = cleanContentAndExtractImages(response);
      res.json({ data: modifiedContent });
    } else {

      db.get('SELECT chat_export FROM chats WHERE uid = ?', [uid], async (err, row) => {
        if (err) {
          console.error('Database error:', err.message);
          res.status(500).json({ error: 'An internal server error occurred.' });
          return;
        }

        if (row) {

          const existingChat = bard.createChat(JSON.parse(row.chat_export));
          const response = await existingChat.ask(prompt, options);
          console.log(response)
          const modifiedContent = cleanContentAndExtractImages(response);


          const updatedChatExport = JSON.stringify(response.ids);
          db.run('UPDATE chats SET chat_export = ? WHERE uid = ?', [updatedChatExport, uid], err => {
            if (err) {
              console.error('Database error:', err.message);
              res.status(500).json({ error: 'An internal server error occurred.' });
              return;
            }
            res.json({ data: modifiedContent });
          });
        } else {
         
          const newChat = bard.createChat();
          const response = await newChat.ask(prompt, options);
          const chatExport = JSON.stringify(newChat.export());

          
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
