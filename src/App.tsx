import React, { useState } from 'react';
import { Camera, Monitor } from 'lucide-react';
import SenderApp from './components/SenderApp';
import ReceiverApp from './components/ReceiverApp';

function App() {
  const [mode, setMode] = useState<'sender' | 'receiver' | null>(null);

  if (mode === 'sender') {
    return <SenderApp onBack={() => setMode(null)} />;
  }

  if (mode === 'receiver') {
    return <ReceiverApp onBack={() => setMode(null)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Raspberry Pi Video Streaming
        </h1>
        
        <div className="space-y-4">
          <button
            onClick={() => setMode('sender')}
            className="w-full flex items-center justify-between bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors"
          >
            <span className="text-xl">Raspberry Pi (Sender)</span>
            <Camera size={24} />
          </button>
          
          <button
            onClick={() => setMode('receiver')}
            className="w-full flex items-center justify-between bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors"
          >
            <span className="text-xl">Windows PC (Receiver)</span>
            <Monitor size={24} />
          </button>
        </div>
        
        <p className="mt-8 text-sm text-gray-600 text-center">
          Choose the appropriate mode based on which device you're using.
          <br />
          Both devices must be connected to the same network.
        </p>
      </div>
    </div>
  );
}

export default App;