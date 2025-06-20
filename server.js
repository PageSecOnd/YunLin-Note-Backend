const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS for all routes (important for cross-domain requests from GitHub Pages)
app.use(cors());
app.use(express.json());

// Storage for notes (in a production environment, use a database instead)
const notes = new Map();

// Setup WebSocket server if not on Vercel (will be used in dev environment)
let wss = null;
if (process.env.NODE_ENV !== 'production') {
  wss = new WebSocket.Server({ server });
  setupWebSockets(wss);
}

// REST API for notes (fallback for environments without WebSocket support)
app.get('/api/notes/:noteId', (req, res) => {
  const { noteId } = req.params;
  
  if (!notes.has(noteId)) {
    notes.set(noteId, {
      content: '',
      clients: new Set(),
      lastUpdated: Date.now()
    });
  }
  
  const note = notes.get(noteId);
  res.json({ content: note.content });
});

app.post('/api/notes/:noteId', (req, res) => {
  const { noteId } = req.params;
  const { content } = req.body;
  
  if (!notes.has(noteId)) {
    notes.set(noteId, {
      content: '',
      clients: new Set(),
      lastUpdated: Date.now()
    });
  }
  
  const note = notes.get(noteId);
  note.content = content;
  note.lastUpdated = Date.now();
  
  // If WebSocket server exists, broadcast to all clients
  if (wss) {
    note.clients.forEach(function(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'content_update',
          content: content,
          sender: req.headers['x-client-id'] || 'rest-api'
        }));
      }
    });
  }
  
  res.json({ success: true });
});

function setupWebSockets(wss) {
  wss.on('connection', function(ws, req) {
    // Extract note ID from URL
    const urlParts = req.url.split('/');
    const noteId = urlParts[urlParts.length - 1];
    
    // Assign unique ID to this connection
    ws.id = uuidv4();
    
    console.log(`Client connected to note ${noteId} with ID ${ws.id}`);
    
    // If note doesn't exist yet, create it
    if (!notes.has(noteId)) {
      notes.set(noteId, {
        content: '',
        clients: new Set(),
        lastUpdated: Date.now()
      });
    }
    
    // Add this client to the note's client list
    const note = notes.get(noteId);
    note.clients.add(ws);
    
    // Handle incoming messages
    ws.on('message', function(message) {
      try {
        const data = JSON.parse(message);
        
        if (data.type === 'content_update') {
          // Update the stored note content
          note.content = data.content;
          note.lastUpdated = Date.now();
          
          // Broadcast to all other clients connected to this note
          note.clients.forEach(function(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'content_update',
                content: data.content,
                sender: data.sender
              }));
            }
          });
        } else if (data.type === 'get_content') {
          // Send the current note content to the requesting client
          ws.send(JSON.stringify({
            type: 'initial_content',
            content: note.content
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
      content: note.content
    }));
  });
}

// Vercel serverless function handler
app.get('/ws/:noteId', (req, res) => {
  res.status(200).send("WebSocket endpoint available in development environment only. Please use the REST API in production.");
});

// Cleanup old notes periodically (every hour)
setInterval(() => {
  const now = Date.now();
  const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  for (const [noteId, note] of notes.entries()) {
    if (now - note.lastUpdated > MAX_AGE && note.clients.size === 0) {
      notes.delete(noteId);
      console.log(`Note ${noteId} removed due to inactivity`);
    }
  }
}, 60 * 60 * 1000);

// Start the server in development mode
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Development server running on port ${PORT}`);
  });
}

// Export Express API for Vercel
module.exports = app;