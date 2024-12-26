# Contributing to Decentralized Honeypots

First off, thank you for considering contributing to Decentralized Honeypots! It's people like you that make this project a great tool for the cybersecurity community.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Process](#development-process)
4. [Code Style Guidelines](#code-style-guidelines)
5. [Testing Guidelines](#testing-guidelines)
6. [Pull Request Process](#pull-request-process)
7. [Security Policy](#security-policy)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [project maintainers].

### Our Standards

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/DecentralizedHoneypots.git
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/KwaminaWhyte/DecentralizedHoneypot.git
   ```
4. Install dependencies:
   ```bash
   bun install
   ```

### Development Environment

- Bun >= 1.0.0
- Node.js >= 18.0.0
- MongoDB >= 5.0
- TypeScript
- Your favorite IDE with TypeScript support

## Development Process

1. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our [code style guidelines](#code-style-guidelines)

3. Test your changes following our [testing guidelines](#testing-guidelines)

4. Commit your changes:
   ```bash
   git commit -m "feat: add new feature" -m "Detailed description of changes"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

### Branch Naming Convention

- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation changes
- `test/*` - Test-related changes
- `refactor/*` - Code refactoring
- `chore/*` - Maintenance tasks

## Code Style Guidelines

### TypeScript Style Guide

- Use TypeScript strict mode
- Follow the [TypeScript ESLint rules](https://typescript-eslint.io/)
- Use interfaces over types when possible
- Document public APIs using JSDoc comments

### Example

```typescript
/**
 * Analyzes traffic patterns for potential attacks.
 * @param {TrafficData} data - The traffic data to analyze
 * @returns {Promise<AttackClassification>} The analysis results
 */
async function analyzeTraffic(data: TrafficData): Promise<AttackClassification> {
    // Implementation
}
```

### File Organization

```
src/
├── honeypots/      # Honeypot implementations
├── services/       # Core services
├── types/          # TypeScript types
├── utils/          # Utility functions
└── tests/          # Test files
```

## Testing Guidelines

### Test Requirements

1. All new features must include tests
2. Maintain or improve code coverage
3. Tests must be deterministic
4. Use meaningful test descriptions

### Test Structure

```typescript
describe('HoneypotService', () => {
    describe('analyzeTraffic', () => {
        it('should detect DDoS attacks correctly', async () => {
            // Test implementation
        });
    });
});
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/tests/honeypot.test.ts

# Run with coverage
bun test --coverage
```

## Pull Request Process

1. Update documentation for any new features
2. Add or update tests as needed
3. Ensure all tests pass
4. Update the CHANGELOG.md if applicable
5. Request review from maintainers

### PR Title Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add new feature`
- `fix: resolve bug`
- `docs: update documentation`
- `test: add tests`
- `refactor: improve code structure`

## Security Policy

### Reporting Security Issues

- **Do NOT** open issues for security vulnerabilities
- Email security concerns to [security contact]
- Include detailed steps to reproduce
- We will respond within 48 hours

### Security Best Practices

1. Never commit sensitive data (API keys, credentials)
2. Use environment variables for configuration
3. Follow OWASP security guidelines
4. Keep dependencies updated

## Additional Resources

- [Project Documentation](./docs)
- [API Reference](./docs/api)
- [Architecture Guide](./docs/architecture)
- [Security Guide](./docs/security)

## Questions or Need Help?

- Open a [Discussion](https://github.com/KwaminaWhyte/DecentralizedHoneypot/discussions)
- Join our [Discord Community](#)
- Check our [FAQ](./docs/faq.md)

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
