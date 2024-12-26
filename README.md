# Decentralized Honeypots for DDoS Detection

A decentralized network of honeypots designed to detect, analyze, and log DDoS attacks using AI and blockchain technology.

## Features

- **Multiple Honeypot Protocols**
  - HTTP Honeypot (Port 8080)
  - DNS Honeypot (Port 5353)
  - SMTP Honeypot (Port 2525)
  - Base honeypot class for easy protocol extension

- **Real-time Traffic Analysis**
  - Pattern recognition
  - Rate limiting
  - Burst detection
  - Protocol-specific metrics
  - IP-based tracking
  - Unique visitor analysis

- **AI-Powered Attack Detection**
  - Real-time traffic classification
  - Rule-based analysis system
  - Protocol-specific attack patterns
  - Traffic anomaly detection
  - Confidence scoring
  - Attack type classification

- **Blockchain Integration**
  - Immutable attack logs
  - Smart contract integration
  - Ethereum/Polygon support
  - Decentralized storage
  - Attack verification

- **Traffic Simulation**
  - Multi-protocol testing
  - Configurable patterns
  - Burst simulation
  - Attack scenarios
  - Protocol-specific payloads

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0.0
- [Node.js](https://nodejs.org/) >= 18.0.0
- [MongoDB](https://www.mongodb.com/) >= 5.0
- [MetaMask](https://metamask.io/) or similar Web3 wallet

## Installation

1. Clone the repository:

```bash
git clone https://github.com/KwaminaWhyte/DecentralizedHoneypot.git
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
- DNS Honeypot: UDP port 5353
- SMTP Honeypot: TCP port 2525

## Testing

1. Run all tests:
```bash
bun test
```

2. Simulate traffic:
```bash
# Normal traffic for 60 seconds
bun run test:traffic 60 normal

# Suspicious traffic for 30 seconds
bun run test:traffic 30 suspicious

# Attack traffic for 15 seconds
bun run test:traffic 15 attack
```

## Project Structure

```
src/
├── honeypots/           # Honeypot implementations
│   ├── base.ts         # Base honeypot class
│   ├── http.ts         # HTTP honeypot
│   ├── dns.ts          # DNS honeypot
│   └── smtp.ts         # SMTP honeypot
├── services/           # Core services
│   ├── ai/            # AI prediction service
│   └── blockchain/    # Blockchain integration
├── contracts/         # Smart contracts
├── tests/            # Test suites
└── types/            # TypeScript types
```

## API Documentation

### Honeypot Endpoints

- `GET /api/metrics` - Get real-time metrics
- `GET /api/attacks` - List detected attacks
- `GET /api/logs` - View traffic logs

### Management API

- `POST /api/honeypots/start` - Start honeypots
- `POST /api/honeypots/stop` - Stop honeypots
- `GET /api/honeypots/status` - Get honeypot status

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
