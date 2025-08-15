# Changelog

All notable changes to Portracker will be documented in this file.

## [1.0.6] - 2025-01-XX (Current)

### Frontend
- **Container Details Drawer**: New slide-out panel to show detailed information for Docker containers including stats, labels, mounts, and environment variables
- **Internal Port Display**: UI now correctly shows and differentiates internal-only ports from published ports with health status monitoring
- **Global Search**: Search bar now includes an option to search across all servers simultaneously
- **What's New Modal**: Automatic notification system to stay updated with new features when opening new versions

### Backend
- **Collector Caching**: Added caching mechanism to all data collectors to reduce duplicate requests and improve data refresh speed

## [1.0.5] - 2024-XX-XX

### Backend
- **Dockerode Integration**: Switched to use the dockerode library for more reliable Docker API interactions instead of shell commands
- **Centralized Logging**: All collectors now use a single Logger class for consistent and structured logging throughout the application

## [1.0.4] - 2024-XX-XX

### Frontend
- **Internal Port Visibility**: All ports are now visible, including internal-only ports that weren't previously shown in the interface
- **Enhanced Service Detection**: Improved identification and categorization of running services with Single Page Application (SPA) detection support
- **Port Status Indicators**: Added clear visual distinction between different types of ports (published vs internal) with detailed status information

### Backend
- **Removed network_mode: host Requirement**: Eliminated the need for Docker host networking mode by implementing direct /proc filesystem parsing for better security
- **Advanced Port Detection**: Enhanced system for more accurate container and system port identification using multiple detection methods
- **Improved Container Introspection**: Better error handling and fallback strategies across different platforms for reliable port collection

## [1.0.3] - 2024-XX-XX

### Infrastructure
- **Simplified Docker Dependencies**: Streamlined system requirements - no longer requires mounting additional system sockets for container information
- **Enhanced Data Accuracy**: Improved container information display with more accurate timestamps and metadata parsing

## [1.0.2] - 2024-XX-XX

### Security & Improvements
- **Security Hardening**: Key security aspects addressed
- **Data Collection**: Improved data collection accuracy

## [1.0.1] - 2024-XX-XX

### Initial Improvements
- Various fixes and improvements after initial release

## [1.0.0] - 2024-XX-XX

### Initial Release
- **Multi-platform Port Tracking**: Initial release of Portracker with support for monitoring ports across multiple servers
- **Docker Integration**: Native Docker container port monitoring
- **Web Interface**: Clean, responsive web interface for port management
- **Server Management**: Support for multiple server configurations
