import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Monitor, Settings } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { getServerUrl } from '../utils/serverUrl';

interface ReceiverAppProps {
  onBack: () => void;
}

const ReceiverApp: React.FC<ReceiverAppProps> = ({ onBack }) => {
  const [roomId, setRoomId] = useState<string>('raspberry-pi-stream');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isReceiving, setIsReceiving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>(getServerUrl());
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [stats, setStats] = useState<{
    resolution: string;
    frameRate: number;
    latency: number;
  }>({
    resolution: 'N/A',
    frameRate: 0,
    latency: 0
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const frameCounterRef = useRef<{ count: number, lastTime: number }>({ count: 0, lastTime: Date.now() });

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
      
      socketRef.current.on('offer', async (offer, userId) => {
        console.log('Received offer from:', userId);
        try {
          await createPeerConnection();
          
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            
            console.log('Sending answer to:', userId);
            socketRef.current?.emit('answer', answer, userId);
          }
        } catch (err) {
          console.error('Error handling offer:', err);
          setError(`Failed to handle offer: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      
      socketRef.current.on('ice-candidate', (candidate, userId) => {
        console.log('Received ICE candidate from:', userId);
        if (peerConnectionRef.current) {
          peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.error('Error adding ICE candidate:', e));
        }
      });
      
    } catch (err) {
      console.error('Error connecting to server:', err);
      setError(`Failed to connect to server: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Create a peer connection
  const createPeerConnection = async () => {
    try {
      // Close existing connection if any
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      peerConnectionRef.current = pc;
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          console.log('Sending ICE candidate');
          socketRef.current.emit('ice-candidate', event.candidate, socketRef.current.id);
        }
      };
      
      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log('Received track:', event.track.kind);
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setIsReceiving(true);
          
          // Start monitoring stats
          startStatsMonitoring();
          
          // Setup frame counter for FPS calculation
          setupFrameCounter();
        }
      };
      
      return pc;
    } catch (err) {
      console.error('Error creating peer connection:', err);
      setError(`Failed to create peer connection: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  // Setup frame counter for FPS calculation
  const setupFrameCounter = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      
      // Reset frame counter
      frameCounterRef.current = { count: 0, lastTime: Date.now() };
      
      // Create a canvas to draw video frames for counting
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Function to count frames
      const countFrame = () => {
        frameCounterRef.current.count++;
        
        // Calculate FPS every second
        const now = Date.now();
        const elapsed = now - frameCounterRef.current.lastTime;
        
        if (elapsed >= 1000) {
          const fps = Math.round((frameCounterRef.current.count / elapsed) * 1000);
          setStats(prev => ({ ...prev, frameRate: fps }));
          
          // Reset counter
          frameCounterRef.current.count = 0;
          frameCounterRef.current.lastTime = now;
        }
        
        // Request next frame
        if (video.readyState >= 2) {
          requestAnimationFrame(countFrame);
        }
      };
      
      // Start counting frames
      requestAnimationFrame(countFrame);
    }
  };

  // Start monitoring WebRTC stats
  const startStatsMonitoring = () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }
    
    statsIntervalRef.current = window.setInterval(async () => {
      if (!peerConnectionRef.current) return;
      
      try {
        const stats = await peerConnectionRef.current.getStats();
        
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            // Get resolution if available
            if (videoRef.current) {
              const width = videoRef.current.videoWidth;
              const height = videoRef.current.videoHeight;
              if (width && height) {
                setStats(prev => ({ ...prev, resolution: `${width}x${height}` }));
              }
            }
            
            // Get latency if available
            if (report.jitter) {
              // Estimate latency based on jitter (this is an approximation)
              const estimatedLatency = Math.round(report.jitter * 1000);
              setStats(prev => ({ ...prev, latency: estimatedLatency }));
            }
          }
        });
      } catch (err) {
        console.error('Error getting stats:', err);
      }
    }, 1000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-purple-600 text-white p-4 flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center text-white"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </button>
        <h1 className="text-xl font-bold">Windows PC (Receiver)</h1>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-full hover:bg-purple-700"
        >
          <Settings size={20} />
        </button>
      </header>
      
      <main className="flex-1 p-4 flex flex-col">
        {/* Video display */}
        <div className="bg-black rounded-lg overflow-hidden aspect-video mb-4 flex items-center justify-center">
          {isReceiving ? (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-white flex flex-col items-center">
              <Monitor size={48} className="mb-2" />
              <p>Video stream will appear here</p>
            </div>
          )}
        </div>
        
        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
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
                    setIsReceiving(false);
                    
                    if (peerConnectionRef.current) {
                      peerConnectionRef.current.close();
                      peerConnectionRef.current = null;
                    }
                    
                    if (videoRef.current) {
                      videoRef.current.srcObject = null;
                    }
                  }}
                  className="w-full md:w-auto px-4 py-2 bg-red-600 text-white rounded-md"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={connectToServer}
                  className="w-full md:w-auto px-4 py-2 bg-purple-600 text-white rounded-md"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Status and Stats */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="text-lg font-semibold mb-2">Status</h2>
          
          <div className="flex items-center mb-2">
            <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <p>{isConnected ? 'Connected to server' : 'Disconnected from server'}</p>
          </div>
          
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-2 ${isReceiving ? 'bg-green-500' : 'bg-gray-500'}`}></div>
            <p>{isReceiving ? 'Receiving video stream' : 'Not receiving video'}</p>
          </div>
          
          {error && (
            <div className="mt-2 p-2 bg-red-100 text-red-800 rounded">
              <p>{error}</p>
            </div>
          )}
          
          {isReceiving && (
            <div className="mt-4">
              <h3 className="font-medium mb-2">Stream Statistics</h3>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-gray-100 p-2 rounded">
                  <p className="font-medium">Resolution</p>
                  <p>{stats.resolution}</p>
                </div>
                <div className="bg-gray-100 p-2 rounded">
                  <p className="font-medium">Frame Rate</p>
                  <p>{stats.frameRate} fps</p>
                </div>
                <div className="bg-gray-100 p-2 rounded">
                  <p className="font-medium">Latency</p>
                  <p>{stats.latency} ms</p>
                </div>
              </div>
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
          </div>
        )}
      </main>
      
      <footer className="bg-gray-200 p-3 text-center text-sm text-gray-600">
        <p>Raspberry Pi Video Streaming - Receiver Application</p>
      </footer>
    </div>
  );
};

export default ReceiverApp;