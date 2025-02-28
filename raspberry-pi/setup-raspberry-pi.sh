#!/bin/bash

# Raspberry Pi WebRTC Streaming Setup Script
# This script sets up the Raspberry Pi for headless WebRTC streaming

echo "Setting up Raspberry Pi for WebRTC Streaming..."

# Update system
echo "Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Install required packages
echo "Installing required packages..."
sudo apt install -y nodejs npm chromium-browser

# Create project directory
echo "Setting up project directory..."
mkdir -p ~/webRTCpi
cd ~/webRTCpi

# Clone the repository (if git is available)
if command -v git &> /dev/null; then
  echo "Cloning repository..."
  git clone https://github.com/IagoFel98/webRTCpi.git .
else
  echo "Git not found. Please manually copy the project files to ~/webRTCpi"
fi

# Install dependencies
echo "Installing Node.js dependencies..."
npm install

# Build the project
echo "Building the project..."
npm run build

# Copy service files
echo "Setting up systemd services..."
sudo cp raspberry-pi/webrtc-stream.service /etc/systemd/system/
sudo cp raspberry-pi/autostart-chrome.service /etc/systemd/system/

# Enable and start services
echo "Enabling and starting services..."
sudo systemctl enable webrtc-stream.service
sudo systemctl enable autostart-chrome.service
sudo systemctl start webrtc-stream.service
sudo systemctl start autostart-chrome.service

# Get IP address
IP_ADDRESS=$(hostname -I | awk '{print $1}')

echo "Setup complete!"
echo "Your Raspberry Pi streaming server is running at: http://$IP_ADDRESS:3000"
echo "Connect from your Windows notebook using this address"
echo ""
echo "To check service status:"
echo "  sudo systemctl status webrtc-stream.service"
echo "  sudo systemctl status autostart-chrome.service"
echo ""
echo "To view logs:"
echo "  sudo journalctl -u webrtc-stream.service -f"
echo "  sudo journalctl -u autostart-chrome.service -f"