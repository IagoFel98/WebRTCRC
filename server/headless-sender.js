import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const ROOM_ID = process.env.ROOM_ID || 'raspberry-pi-stream';
const VIDEO_WIDTH = parseInt(process.env.VIDEO_WIDTH || '640', 10);
const VIDEO_HEIGHT = parseInt(process.env.VIDEO_HEIGHT || '480', 10);
const FRAME_RATE = parseInt(process.env.FRAME_RATE || '30', 10);
const OPTIMIZE_LATENCY = process.env.OPTIMIZE_LATENCY === 'true';

console.log('Starting Raspberry Pi Headless Streaming Service');
console.log(`Configuration: Room ID: ${ROOM_ID}, Resolution: ${VIDEO_WIDTH}x${VIDEO_HEIGHT}, FPS: ${FRAME_RATE}`);
console.log(`Latency Optimization: ${OPTIMIZE_LATENCY ? 'Enabled' : 'Disabled'}`);

// Setup Express and Socket.io
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  // Optimize for low latency
  pingTimeout: 10000,
  pingInterval: 2000,
  transports: ['websocket'],
  allowUpgrades: false
});

// Optimize network settings for low latency if enabled
if (OPTIMIZE_LATENCY) {
  try {
    // Set network optimization parameters
    exec('sudo sysctl -w net.ipv4.tcp_fastopen=3', (error) => {
      if (error) console.error('Failed to set tcp_fastopen:', error);
    });
    
    exec('sudo sysctl -w net.ipv4.tcp_low_latency=1', (error) => {
      if (error) console.error('Failed to set tcp_low_latency:', error);
    });
    
    exec('sudo sysctl -w net.ipv4.tcp_notsent_lowat=16384', (error) => {
      if (error) console.error('Failed to set tcp_notsent_lowat:', error);
    });
    
    // Set WiFi power management to off for better performance
    exec('sudo iwconfig wlan0 power off', (error) => {
      if (error) console.error('Failed to disable WiFi power management:', error);
    });
    
    console.log('Applied network optimizations for low latency');
  } catch (err) {
    console.error('Error applying network optimizations:', err);
  }
}

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

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`Access from another device using: http://<raspberry-pi-ip>:${PORT}`);
  
  // Get and display the Pi's IP address
  exec('hostname -I | cut -d\' \' -f1', (error, stdout) => {
    if (!error) {
      console.log(`Raspberry Pi IP address: ${stdout.trim()}`);
    }
  });
  
  // Automatically join the room and start streaming
  console.log('Initializing headless streaming client...');
  initializeHeadlessClient();
});

// Function to initialize the headless streaming client
function initializeHeadlessClient() {
  // This will be handled by the systemd service that launches a browser in headless mode
  console.log(`Streaming will be initialized with Room ID: ${ROOM_ID}`);
  console.log('Video settings:');
  console.log(`- Resolution: ${VIDEO_WIDTH}x${VIDEO_HEIGHT}`);
  console.log(`- Frame Rate: ${FRAME_RATE} fps`);
}