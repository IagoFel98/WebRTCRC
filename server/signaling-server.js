import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files from the dist directory
app.use(express.static(join(__dirname, '../dist')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

// WebRTC signaling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle when a client joins a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Client ${socket.id} joined room ${roomId}`);
    
    // Notify other clients in the room
    socket.to(roomId).emit('user-connected', socket.id);
  });

  // Handle offer from sender
  socket.on('offer', (offer, roomId, targetId) => {
    console.log(`Relaying offer from ${socket.id} to room ${roomId}`);
    if (targetId) {
      socket.to(targetId).emit('offer', offer, socket.id);
    } else {
      socket.to(roomId).emit('offer', offer, socket.id);
    }
  });

  // Handle answer from receiver
  socket.on('answer', (answer, targetId) => {
    console.log(`Relaying answer from ${socket.id} to ${targetId}`);
    socket.to(targetId).emit('answer', answer, socket.id);
  });

  // Handle ICE candidates
  socket.on('ice-candidate', (candidate, targetId) => {
    console.log(`Relaying ICE candidate from ${socket.id} to ${targetId}`);
    socket.to(targetId).emit('ice-candidate', candidate, socket.id);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    io.emit('user-disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});