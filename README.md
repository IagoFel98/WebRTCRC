# Raspberry Pi to Windows Video Streaming

This project provides a low-latency video streaming solution between a Raspberry Pi 5 with a camera and a Windows notebook. It uses WebRTC technology to achieve minimal latency (targeting around 50ms).

## Features

- Real-time video streaming from Raspberry Pi to Windows
- WebRTC-based for low latency
- Simple user interface for both sender and receiver
- Adjustable video quality settings
- Connection status monitoring
- Stream statistics (resolution, frame rate, latency)

## Requirements

### Raspberry Pi (Sender)
- Raspberry Pi 5
- Camera module (5MP)
- Node.js installed
- Modern web browser

### Windows PC (Receiver)
- Windows notebook/PC
- Modern web browser (Chrome recommended)

## Setup Instructions

### 1. Clone and Install

```bash
# Clone the repository (or download it)
git clone <repository-url>
cd raspberry-pi-video-streaming

# Install dependencies
npm install
```

### 2. Build the Application

```bash
npm run build
```

### 3. Start the Server

```bash
npm run start:server
```

This will start the signaling server on port 3000 and serve the built application.

### 4. Access the Application

#### On Raspberry Pi:
1. Open a web browser
2. Navigate to `http://localhost:3000`
3. Select "Raspberry Pi (Sender)"
4. Connect to the server and start streaming

#### On Windows PC:
1. Open a web browser
2. Navigate to `http://<raspberry-pi-ip-address>:3000`
3. Select "Windows PC (Receiver)"
4. Connect to the server using the same Room ID as the Raspberry Pi

## Usage

### Sender (Raspberry Pi)
1. Enter a Room ID (or use the default)
2. Click "Connect"
3. Once connected, click "Start Streaming"
4. The camera feed will be visible in the preview
5. Adjust video settings as needed

### Receiver (Windows PC)
1. Enter the same Room ID as the sender
2. Click "Connect"
3. The video stream will automatically appear when the sender starts streaming
4. View stream statistics at the bottom of the page

## Optimizing for Low Latency

To achieve the lowest possible latency (around 50ms):

1. Use a wired network connection if possible
2. Keep both devices on the same local network
3. Adjust video resolution and frame rate in the sender settings
4. Lower resolution (e.g., 640x480) can reduce latency
5. Consider using Chrome browser which has optimized WebRTC implementation

## Troubleshooting

- **No video appears**: Ensure the camera is properly connected to the Raspberry Pi
- **High latency**: Check network conditions, reduce video resolution, ensure both devices are on the same network
- **Connection issues**: Verify the server is running, check firewall settings, ensure correct IP address is used

## License

MIT