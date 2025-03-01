#!/bin/bash

# Raspberry Pi WebRTC Streaming Setup Script
# This script sets up the Raspberry Pi for headless WebRTC streaming

echo "Setting up Raspberry Pi for Ultra-Low Latency WebRTC Streaming..."

# Update system
echo "Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Install required packages
echo "Installing required packages..."
sudo apt install -y nodejs npm chromium-browser v4l-utils

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

# Optimize camera settings for low latency
echo "Optimizing camera settings for low latency..."
if [ -e /dev/video0 ]; then
  # Disable auto exposure and set manual exposure for lower latency
  v4l2-ctl --set-ctrl=exposure_auto=1
  v4l2-ctl --set-ctrl=exposure_absolute=100
  
  # Set focus to infinity to avoid focus hunting
  v4l2-ctl --set-ctrl=focus_auto=0
  v4l2-ctl --set-ctrl=focus_absolute=0
  
  echo "Camera settings optimized for low latency"
else
  echo "Camera not detected at /dev/video0, skipping camera optimization"
fi

# Optimize network settings
echo "Optimizing network settings for low latency..."
sudo sysctl -w net.ipv4.tcp_fastopen=3
sudo sysctl -w net.ipv4.tcp_low_latency=1
sudo sysctl -w net.ipv4.tcp_notsent_lowat=16384

# Make network settings persistent
if ! grep -q "net.ipv4.tcp_fastopen" /etc/sysctl.conf; then
  echo "net.ipv4.tcp_fastopen=3" | sudo tee -a /etc/sysctl.conf
  echo "net.ipv4.tcp_low_latency=1" | sudo tee -a /etc/sysctl.conf
  echo "net.ipv4.tcp_notsent_lowat=16384" | sudo tee -a /etc/sysctl.conf
fi

# Disable WiFi power management for better performance
echo "Disabling WiFi power management..."
sudo iwconfig wlan0 power off

# Make WiFi power management setting persistent
if ! grep -q "iwconfig wlan0 power off" /etc/rc.local; then
  sudo sed -i '/^exit 0/i iwconfig wlan0 power off' /etc/rc.local
fi

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
echo ""
echo "For SSH access, use:"
echo "  ssh pi@$IP_ADDRESS"
echo ""
echo "For ultra-low latency (<50ms), ensure your Windows notebook is connected to the same 5GHz WiFi network"