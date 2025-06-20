const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);

// Enable CORS for all routes with specific origin
app.use(cors({
  origin: 'https://note.yunlinsan.ren',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// File path for persistent storage
const DATA_FILE = path.join(__dirname, 'data', 'notes.json');

// Storage for notes
let notes = new Map();

// Setup WebSocket server if not on Vercel
let wss = null;
if (process.env.NODE_ENV !== 'production') {
  wss = new WebSocket.Server({ server });
  setupWebSockets(wss);
}

// Ensure data directory exists
async function ensureDataDirExists() {
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Load notes from file
async function loadNotesFromFile() {
  try {
    await ensureDataDirExists();
    
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      const notesData = JSON.parse(data);
      
      for (const [id, noteData] of Object.entries(notesData)) {
        notes.set(id, {
          content: noteData.content,
          lastUpdated: noteData.lastUpdated || Date.now(),
          clients: new Set()
        });
      }
      
      console.log('Notes loaded from file');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading notes from file:', error);
      }
    }
  } catch (error) {
    console.error('Error in loadNotesFromFile:', error);
  }
}

// Save notes to file
async function saveNotesToFile() {
  try {
    await ensureDataDirExists();
    
    const notesData = {};
    for (const [id, note] of notes.entries()) {
      notesData[id] = {
        content: note.content,
        lastUpdated: note.lastUpdated
      };
    }
    
    await fs.writeFile(DATA_FILE, JSON.stringify(notesData, null, 2), 'utf8');
    console.log('Notes saved to file');
  } catch (error) {
    console.error('Error saving notes to file:', error);
  }
}

// Validate note ID (must be 6 characters long and alphanumeric)
function isValidNoteId(noteId) {
  return /^[a-z0-9]{6}$/.test(noteId);
}

// Load notes at startup
loadNotesFromFile();

// REST API endpoints
app.get('/api/notes/:noteId', (req, res) => {
  const { noteId } = req.params;
  
  if (!isValidNoteId(noteId)) {
    return res.status(400).json({ error: 'Invalid note ID. Must be 6 alphanumeric characters.' });
  }
  
  if (!notes.has(noteId)) {
    notes.set(noteId, {
      content: '',
      lastUpdated: Date.now(),
      clients: new Set()
    });
  }
  
  const note = notes.get(noteId);
  res.json({ 
    content: note.content,
    lastUpdated: note.lastUpdated
  });
});

app.post('/api/notes/:noteId', async (req, res) => {
  const { noteId } = req.params;
  const { content } = req.body;
  
  if (!isValidNoteId(noteId)) {
    return res.status(400).json({ error: 'Invalid note ID. Must be 6 alphanumeric characters.' });
  }
  
  if (!notes.has(noteId)) {
    notes.set(noteId, {
      content: '',
      lastUpdated: Date.now(),
      clients: new Set()
    });
  }
  
  const note = notes.get(noteId);
  note.content = content;
  note.lastUpdated = Date.now();
  
  // Save changes to file
  await saveNotesToFile();
  
  // If WebSocket server exists, broadcast to all clients
  if (wss) {
    note.clients.forEach(function(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'content_update',
          content: content,
          lastUpdated: note.lastUpdated,
          sender: req.headers['x-client-id'] || 'rest-api'
        }));
      }
    });
  }
  
  res.json({ 
    success: true,
    lastUpdated: note.lastUpdated
  });
});

// WebSocket server setup
function setupWebSockets(wss) {
  wss.on('connection', function(ws, req) {
    // Extract note ID from URL
    const urlParts = req.url.split('/');
    const noteId = urlParts[urlParts.length - 1];
    
    if (!isValidNoteId(noteId)) {
      ws.close(1008, 'Invalid note ID');
      return;
    }
    
    // Assign unique ID to this connection
    ws.id = uuidv4();
    
    console.log(`Client connected to note ${noteId} with ID ${ws.id}`);
    
    // If note doesn't exist yet, create it
    if (!notes.has(noteId)) {
      notes.set(noteId, {
        content: '',
        lastUpdated: Date.now(),
        clients: new Set()
      });
    }
    
    // Add this client to the note's client list
    const note = notes.get(noteId);
    note.clients.add(ws);
    
    // Handle incoming messages
    ws.on('message', async function(message) {
      try {
        const data = JSON.parse(message);
        
        if (data.type === 'content_update') {
          // Update the stored note content
          note.content = data.content;
          note.lastUpdated = Date.now();
          
          // Save changes to file
          await saveNotesToFile();
          
          // Broadcast to all other clients connected to this note
          note.clients.forEach(function(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'content_update',
                content: data.content,
                lastUpdated: note.lastUpdated,
                sender: data.sender
              }));
            }
          });
        } else if (data.type === 'get_content') {
          // Send the current note content to the requesting client
          ws.send(JSON.stringify({
            type: 'initial_content',
            content: note.content,
            lastUpdated: note.lastUpdated
          }));
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    // Handle client disconnection
    ws.on('close', function() {
      console.log(`Client ${ws.id} disconnected from note ${noteId}`);
      
      // Remove client from note's client list
      note.clients.delete(ws);
    });
    
    // Send the current note content to the client
    ws.send(JSON.stringify({
      type: 'initial_content',
      content: note.content,
      lastUpdated: note.lastUpdated
    }));
  });
}

// WebSocket endpoint for Vercel
app.get('/ws/:noteId', (req, res) => {
  res.status(200).send("WebSocket endpoint available in development environment only. Please use the REST API in production.");
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Save notes periodically (every 5 minutes)
setInterval(async () => {
  await saveNotesToFile();
}, 5 * 60 * 1000);

// Start the server in development mode
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Development server running on port ${PORT}`);
  });
}

// Export Express API for Vercel
module.exports = app;