# Required Accounts & API Keys

## Blockchain
1. **Polygon Mumbai Testnet**
   - Create a MetaMask wallet
   - Get test MATIC from [Mumbai Faucet](https://faucet.polygon.technology/)
   - Add to `.env`:
     ```
     BLOCKCHAIN_NETWORK=polygon-mumbai
     BLOCKCHAIN_RPC_URL=https://rpc-mumbai.maticvigil.com
     BLOCKCHAIN_PRIVATE_KEY=your_private_key_here
     ```

## Database
1. **MongoDB Atlas** (Optional - for production)
   - Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a new cluster
   - Add to `.env`:
     ```
     MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/honeypots
     ```
   - For local development, use:
     ```
     MONGO_URI=mongodb://localhost:27017/honeypots
     ```

## Future Integrations (Phase 5+)

### Geolocation
1. **MaxMind GeoIP2**
   - Create account at [MaxMind](https://www.maxmind.com/en/geolite2/signup)
   - Download GeoLite2 database
   - Add to `.env`:
     ```
     MAXMIND_LICENSE_KEY=your_license_key
     MAXMIND_ACCOUNT_ID=your_account_id
     ```

### Threat Intelligence
1. **AbuseIPDB** (Optional)
   - Sign up at [AbuseIPDB](https://www.abuseipdb.com/register)
   - Add to `.env`:
     ```
     ABUSEIPDB_API_KEY=your_api_key
     ```

2. **VirusTotal** (Optional)
   - Create account at [VirusTotal](https://www.virustotal.com/gui/join-us)
   - Add to `.env`:
     ```
     VIRUSTOTAL_API_KEY=your_api_key
     ```

## Development Tools
1. **GitHub**
   - Create account at [GitHub](https://github.com)
   - Generate Personal Access Token for CI/CD
   - Add to repository secrets:
     ```
     GITHUB_TOKEN=your_personal_access_token
     ```

## Monitoring & Analytics (Phase 6)
1. **Grafana Cloud** (Optional)
   - Sign up at [Grafana Cloud](https://grafana.com/products/cloud/)
   - Add to `.env`:
     ```
     GRAFANA_API_KEY=your_api_key
     GRAFANA_ENDPOINT=your_grafana_endpoint
     ```

## Security Notes
1. **NEVER commit `.env` file to git**
2. **Use environment variables in production**
3. **Rotate API keys regularly**
4. **Use separate keys for development and production**

## Key Management Best Practices
1. Use a secure password manager
2. Enable 2FA on all accounts
3. Use separate API keys for different environments
4. Monitor API key usage
5. Implement key rotation policies

## Local Development Setup
1. Copy `.env.example` to `.env`
2. Fill in required keys
3. Use test/development API keys
4. Keep production keys secure

## Production Deployment
1. Use secure key management service
2. Encrypt sensitive data
3. Use separate accounts/keys
4. Monitor key usage
5. Implement automated key rotation
