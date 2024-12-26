# Decentralized Honeypots for DDoS Detection

A cutting-edge cybersecurity solution that uses decentralized honeypots to detect, analyze, and track DDoS attacks using AI and blockchain technology.

## Features

- **Multiple Honeypot Protocols**
  - HTTP Honeypot (Port 8080)
  - DNS Honeypot (Port 53)
  - Extensible architecture for adding more protocols

- **Real-time Traffic Analysis**
  - Pattern recognition
  - Rate limiting
  - Burst detection
  - Suspicious behavior scoring

- **AI-Powered Attack Detection**
  - Real-time traffic classification
  - Pattern analysis
  - Anomaly detection

- **Blockchain Integration**
  - Immutable attack logs
  - Transparent reporting
  - Polygon network integration

## Prerequisites

- [Bun](https://bun.sh) runtime
- MongoDB
- Node.js 18+ (for blockchain tools)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/DecentralizedHoneypots.git
cd DecentralizedHoneypots
```

2. Install dependencies:
```bash
bun install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Development

Start the development server:
```bash
bun run dev
```

The following services will start:
- Main API: http://localhost:3000
- HTTP Honeypot: http://localhost:8080
- DNS Honeypot: UDP port 53

## API Endpoints

- `GET /health` - Service health check
- `GET /metrics` - Real-time traffic metrics and analysis

## Architecture

```
src/
├── config/          # Configuration management
├── models/          # MongoDB models
├── services/        # Core services
│   ├── ai/         # AI prediction service
│   ├── blockchain/ # Blockchain logging
│   ├── traffic/    # Traffic analysis
│   └── db.ts       # Database connection
├── honeypots/      # Honeypot implementations
├── types/          # TypeScript type definitions
└── index.ts        # Application entry point
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.