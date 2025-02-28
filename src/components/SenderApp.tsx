import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Settings, Wifi } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { getServerUrl } from '../utils/serverUrl';

interface SenderAppProps {
  onBack: () => void;
}

const SenderApp: React.FC<SenderAppProps> = ({ onBack }) => {
  const [roomId, setRoomId] = useState<string>('raspberry-pi-stream');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [serverUrl, setServerUrl] = useState<string>(getServerUrl());
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [videoConstraints, setVideoConstraints] = useState({
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});

  // Connect to signaling server
  const connectToServer = () => {
    try {
      socketRef.current = io(serverUrl);
      
      socketRef.current.on('connect', () => {
        setIsConnected(true);
        setError(null);
        console.log('Connected to signaling server');
        
        // Join room
        socketRef.current?.emit('join-room', roomId);
      });
      
      socketRef.current.on('connect_error', (err) => {
        console.error('Connection error:', err);
        setError(`Failed to connect to server: ${err.message}`);
        setIsConnected(false);
      });
      
      socketRef.current.on('user-connected', (userId) => {
        console.log('User connected:', userId);
        setConnectedPeers(prev => [...prev, userId]);
        createPeerConnection(userId);
      });
      
      socketRef.current.on('user-disconnected', (userId) => {
        console.log('User disconnected:', userId);
        setConnectedPeers(prev => prev.filter(id => id !== userId));
        
        if (peerConnectionsRef.current[userId]) {
          peerConnectionsRef.current[userId].close();
          delete peerConnectionsRef.current[userId];
        }
      });
      
      socketRef.current.on('ice-candidate', (candidate, userId) => {
        console.log('Received ICE candidate from:', userId);
        const pc = peerConnectionsRef.current[userId];
        if (pc) {
          pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.error('Error adding ICE candidate:', e));
        }
      });
      
      socketRef.current.on('answer', (answer, userId) => {
        console.log('Received answer from:', userId);
        const pc = peerConnectionsRef.current[userId];
        if (pc) {
          pc.setRemoteDescription(new RTCSessionDescription(answer))
            .catch(e => console.error('Error setting remote description:', e));
        }
      });
      
    } catch (err) {
      console.error('Error connecting to server:', err);
      setError(`Failed to connect to server: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Create a peer connection for a specific user
  const createPeerConnection = async (userId: string) => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      peerConnectionsRef.current[userId] = pc;
      
      // Add local stream tracks to peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate to:', userId);
          socketRef.current?.emit('ice-candidate', event.candidate, userId);
        }
      };
      
      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });
      
      await pc.setLocalDescription(offer);
      
      console.log('Sending offer to:', userId);
      socketRef.current?.emit('offer', offer, roomId, userId);
      
    } catch (err) {
      console.error('Error creating peer connection:', err);
      setError(`Failed to create peer connection: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Start streaming video
  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      
      localStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      setIsStreaming(true);
      setError(null);
      
      // Create peer connections for all connected users
      Object.keys(peerConnectionsRef.current).forEach(userId => {
        // Close existing connections
        peerConnectionsRef.current[userId].close();
        delete peerConnectionsRef.current[userId];
        
        // Create new connections
        createPeerConnection(userId);
      });
      
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError(`Failed to access camera: ${err instanceof Error ? err.message : String(err)}`);
      setIsStreaming(false);
    }
  };

  // Stop streaming video
  const stopStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsStreaming(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
      peerConnectionsRef.current = {};
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center text-white"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </button>
        <h1 className="text-xl font-bold">Raspberry Pi Camera (Sender)</h1>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-full hover:bg-blue-700"
        >
          <Settings size={20} />
        </button>
      </header>
      
      <main className="flex-1 p-4 flex flex-col">
        {/* Video preview */}
        <div className="bg-black rounded-lg overflow-hidden aspect-video mb-4 flex items-center justify-center">
          {isStreaming ? (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-white flex flex-col items-center">
              <Camera size={48} className="mb-2" />
              <p>Camera preview will appear here</p>
            </div>
          )}
        </div>
        
        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Room ID
              </label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={isConnected}
              />
            </div>
            
            <div className="flex-none">
              {isConnected ? (
                <button
                  onClick={() => {
                    socketRef.current?.disconnect();
                    setIsConnected(false);
                    setConnectedPeers([]);
                  }}
                  className="w-full md:w-auto px-4 py-2 bg-red-600 text-white rounded-md"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={connectToServer}
                  className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded-md"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
          
          <div className="flex justify-center">
            {isStreaming ? (
              <button
                onClick={stopStream}
                className="px-6 py-3 bg-red-600 text-white rounded-md font-medium"
              >
                Stop Streaming
              </button>
            ) : (
              <button
                onClick={startStream}
                disabled={!isConnected}
                className={`px-6 py-3 ${
                  isConnected ? 'bg-green-600' : 'bg-gray-400'
                } text-white rounded-md font-medium`}
              >
                Start Streaming
              </button>
            )}
          </div>
        </div>
        
        {/* Status */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="text-lg font-semibold mb-2">Status</h2>
          
          <div className="flex items-center mb-2">
            <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <p>{isConnected ? 'Connected to server' : 'Disconnected from server'}</p>
          </div>
          
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-2 ${isStreaming ? 'bg-green-500' : 'bg-gray-500'}`}></div>
            <p>{isStreaming ? 'Camera streaming' : 'Camera not streaming'}</p>
          </div>
          
          {connectedPeers.length > 0 && (
            <div className="mt-2">
              <p className="font-medium">Connected viewers: {connectedPeers.length}</p>
            </div>
          )}
          
          {error && (
            <div className="mt-2 p-2 bg-red-100 text-red-800 rounded">
              <p>{error}</p>
            </div>
          )}
        </div>
        
        {/* Settings panel */}
        {showSettings && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">Settings</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Server URL
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={isConnected}
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Video Resolution
              </label>
              <select
                value={`${videoConstraints.width.ideal}x${videoConstraints.height.ideal}`}
                onChange={(e) => {
                  const [width, height] = e.target.value.split('x').map(Number);
                  setVideoConstraints(prev => ({
                    ...prev,
                    width: { ideal: width },
                    height: { ideal: height }
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={isStreaming}
              >
                <option value="640x480">640x480 (SD)</option>
                <option value="1280x720">1280x720 (HD)</option>
                <option value="1920x1080">1920x1080 (Full HD)</option>
              </select>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frame Rate
              </label>
              <select
                value={videoConstraints.frameRate.ideal}
                onChange={(e) => {
                  setVideoConstraints(prev => ({
                    ...prev,
                    frameRate: { ideal: Number(e.target.value) }
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={isStreaming}
              >
                <option value="15">15 fps</option>
                <option value="30">30 fps</option>
                <option value="60">60 fps</option>
              </select>
            </div>
          </div>
        )}
      </main>
      
      <footer className="bg-gray-200 p-3 text-center text-sm text-gray-600">
        <p>Raspberry Pi Video Streaming - Sender Application</p>
      </footer>
    </div>
  );
};

export default SenderApp;