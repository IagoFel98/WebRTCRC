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
    bitrate: number;
  }>({
    resolution: 'N/A',
    frameRate: 0,
    latency: 0,
    bitrate: 0
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const frameCounterRef = useRef<{ count: number, lastTime: number }>({ count: 0, lastTime: Date.now() });
  const bitrateRef = useRef<{ lastByteCount: number, lastTimestamp: number }>({ lastByteCount: 0, lastTimestamp: Date.now() });

  // Connect to signaling server
  const connectToServer = () => {
    try {
      socketRef.current = io(serverUrl, {
        transports: ['websocket'],
        upgrade: false,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        timeout: 10000
      });
      
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
            // Modify SDP for lower latency if needed
            if (offer.sdp) {
              let sdp = offer.sdp;
              
              // Prioritize video decoding
              sdp = sdp.replace(/(m=video.*\r\n)/g, '$1a=content:main\r\n');
              
              // Set transport-cc for congestion control
              sdp = sdp.replace(/(m=video.*\r\n)/g, '$1a=rtcp-fb:* transport-cc\r\n');
              
              offer.sdp = sdp;
            }
            
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await peerConnectionRef.current.createAnswer({
              voiceActivityDetection: false
            });
            
            // Modify answer SDP for lower latency
            if (answer.sdp) {
              let sdp = answer.sdp;
              
              // Set max bitrate
              sdp = sdp.replace(/(m=video.*\r\n)/g, '$1b=AS:2500\r\n');
              
              // Prioritize video
              sdp = sdp.replace(/(m=video.*\r\n)/g, '$1a=content:main\r\n');
              
              answer.sdp = sdp;
            }
            
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
        ],
        // Optimize for low latency
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 0,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        sdpSemantics: 'unified-plan'
      });
      
      peerConnectionRef.current = pc;
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          console.log('Sending ICE candidate');
          socketRef.current.emit('ice-candidate', event.candidate, socketRef.current.id);
        }
      };
      
      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError('WebRTC connection failed or disconnected. Trying to reconnect...');
          // Try to reconnect
          setTimeout(() => {
            if (socketRef.current && socketRef.current.connected) {
              socketRef.current.emit('join-room', roomId);
            }
          }, 2000);
        }
      };
      
      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log('Received track:', event.track.kind);
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          
          // Set video element properties for low latency
          videoRef.current.playsInline = true;
          videoRef.current.muted = true;
          videoRef.current.autoplay = true;
          
          // These attributes help reduce latency
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('muted', 'true');
          videoRef.current.setAttribute('autoplay', 'true');
          
          // Reduce buffering
          if ('mediaSettings' in videoRef.current) {
            // @ts-ignore - This is a non-standard property
            videoRef.current.mediaSettings = {
              lowLatency: true,
              preferLowLatency: true
            };
          }
          
          setIsReceiving(true);
          
          // Start monitoring stats
          startStatsMonitoring();
          
          // Setup frame counter for FPS calculation
          setupFrameCounter();
          
          // Reset bitrate calculation
          bitrateRef.current = { lastByteCount: 0, lastTimestamp: Date.now() };
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
            
            // Calculate bitrate
            if (report.bytesReceived && report.timestamp) {
              const now = report.timestamp;
              const bytes = report.bytesReceived;
              
              if (bitrateRef.current.lastTimestamp > 0) {
                const bitrate = 8 * (bytes - bitrateRef.current.lastByteCount) / 
                  (now - bitrateRef.current.lastTimestamp) * 1000;
                
                setStats(prev => ({ ...prev, bitrate: Math.round(bitrate / 1000) })); // kbps
              }
              
              bitrateRef.current.lastByteCount = bytes;
              bitrateRef.current.lastTimestamp = now;
            }
            
            // Get latency if available
            if (report.jitter) {
              // Calculate latency based on jitter and round-trip time
              let latency = report.jitter * 1000; // Convert to ms
              
              // Add network round-trip time if available
              stats.forEach(s => {
                if (s.type === 'remote-candidate' && s.roundTripTime) {
                  latency += s.roundTripTime * 1000;
                }
              });
              
              // Add decoding time if available
              if (report.totalDecodeTime && report.framesDecoded && report.framesDecoded > 0) {
                const avgDecodeTime = (report.totalDecodeTime / report.framesDecoded) * 1000;
                latency += avgDecodeTime;
              }
              
              setStats(prev => ({ ...prev, latency: Math.round(latency) }));
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
              muted
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
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
                  <p className={stats.latency <= 50 ? 'text-green-600 font-bold' : 'text-red-600'}>
                    {stats.latency} ms
                  </p>
                </div>
                <div className="bg-gray-100 p-2 rounded">
                  <p className="font-medium">Bitrate</p>
                  <p>{stats.bitrate} kbps</p>
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
            
            <div className="p-3 bg-blue-50 text-blue-800 rounded-md">
              <p className="text-sm">
                <strong>Tip for lowest latency:</strong> For sub-50ms latency, ensure both devices are on the same 5GHz WiFi network, keep them physically close, and use Chrome browser.
              </p>
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