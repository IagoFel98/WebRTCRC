import React, { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getServerUrl } from '../utils/serverUrl';

const AutoSenderApp: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  
  // Get configuration from URL parameters or use defaults
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('roomId') || 'raspberry-pi-stream';
  const width = parseInt(urlParams.get('width') || '640', 10);
  const height = parseInt(urlParams.get('height') || '480', 10);
  const frameRate = parseInt(urlParams.get('frameRate') || '30', 10);
  
  const videoConstraints = {
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: frameRate }
  };

  // Connect to signaling server and start streaming automatically
  useEffect(() => {
    console.log('Auto Sender initializing...');
    console.log(`Room ID: ${roomId}, Resolution: ${width}x${height}, FPS: ${frameRate}`);
    
    const connectAndStream = async () => {
      try {
        // Connect to signaling server
        const serverUrl = getServerUrl();
        console.log(`Connecting to server: ${serverUrl}`);
        
        socketRef.current = io(serverUrl, {
          transports: ['websocket'],
          upgrade: false,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          timeout: 10000
        });
        
        socketRef.current.on('connect', () => {
          console.log('Connected to signaling server with ID:', socketRef.current?.id);
          
          // Join room
          socketRef.current?.emit('join-room', roomId);
          
          // Start streaming immediately
          startStream();
        });
        
        socketRef.current.on('connect_error', (err) => {
          console.error('Connection error:', err);
          // Try to reconnect after a delay
          setTimeout(connectAndStream, 2000);
        });
        
        socketRef.current.on('user-connected', (userId) => {
          console.log('User connected:', userId);
          createPeerConnection(userId);
        });
        
        socketRef.current.on('user-disconnected', (userId) => {
          console.log('User disconnected:', userId);
          
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
        console.error('Error in connectAndStream:', err);
        // Try to reconnect after a delay
        setTimeout(connectAndStream, 2000);
      }
    };
    
    connectAndStream();
    
    // Cleanup on unmount
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    };
  }, [roomId, width, height, frameRate]);

  // Create a peer connection for a specific user
  const createPeerConnection = async (userId: string) => {
    try {
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
      
      peerConnectionsRef.current[userId] = pc;
      
      // Add local stream tracks to peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          const sender = pc.addTrack(track, localStreamRef.current!);
          
          // Set encoding parameters for low latency
          if (sender.setParameters && sender.getParameters) {
            const parameters = sender.getParameters();
            if (parameters.encodings && parameters.encodings.length > 0) {
              parameters.encodings.forEach(encoding => {
                encoding.maxBitrate = 2500000; // 2.5 Mbps
                encoding.maxFramerate = frameRate;
                encoding.networkPriority = 'high';
                encoding.priority = 'high';
                encoding.scaleResolutionDownBy = 1.0;
              });
              sender.setParameters(parameters).catch(e => 
                console.error('Error setting encoding parameters:', e)
              );
            }
          }
        });
      }
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate to:', userId);
          socketRef.current?.emit('ice-candidate', event.candidate, userId);
        }
      };
      
      // Create and send offer with low latency options
      const offerOptions = {
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
        voiceActivityDetection: false,
        iceRestart: false
      };
      
      const offer = await pc.createOffer(offerOptions);
      
      // Modify SDP for lower latency
      let sdp = offer.sdp;
      if (sdp) {
        // Set max bitrate
        sdp = sdp.replace(/(m=video.*\r\n)/g, '$1b=AS:2500\r\n');
        
        // Disable RTCP (reduces overhead)
        sdp = sdp.replace(/(a=rtcp-fb.*\r\n)/g, '');
        
        // Set transport-cc for congestion control
        sdp = sdp.replace(/(m=video.*\r\n)/g, '$1a=rtcp-fb:* transport-cc\r\n');
        
        // Update the offer with modified SDP
        offer.sdp = sdp;
      }
      
      await pc.setLocalDescription(offer);
      
      console.log('Sending offer to:', userId);
      socketRef.current?.emit('offer', offer, roomId, userId);
      
    } catch (err) {
      console.error('Error creating peer connection:', err);
    }
  };

  // Start streaming video
  const startStream = async () => {
    try {
      console.log('Requesting camera access with constraints:', videoConstraints);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...videoConstraints,
          // Additional constraints for low latency
          facingMode: 'environment', // Use back camera if available
          resizeMode: 'crop-and-scale'
        },
        audio: false
      });
      
      // Apply track constraints for low latency
      stream.getVideoTracks().forEach(track => {
        const capabilities = track.getCapabilities();
        const settings: MediaTrackConstraints = {};
        
        // Set lowest possible latency mode if available
        if (capabilities.latencyMode) {
          settings.latencyMode = 'lowLatency';
        }
        
        // Apply constraints if we have any
        if (Object.keys(settings).length > 0) {
          track.applyConstraints(settings)
            .catch(e => console.error('Error applying track constraints:', e));
        }
      });
      
      localStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      console.log('Camera stream started successfully');
      
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
      // Try again after a delay
      setTimeout(startStream, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="w-full h-full object-contain"
      />
      <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
        Streaming: {roomId} ({width}x{height} @ {frameRate}fps)
      </div>
    </div>
  );
};

export default AutoSenderApp;