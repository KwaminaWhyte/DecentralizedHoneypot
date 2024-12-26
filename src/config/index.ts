import { config } from 'dotenv';
config();

export default {
    port: process.env.PORT || 3000,
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/honeypots',
    blockchain: {
        rpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'http://localhost:8545',
        privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY || '',
        network: process.env.BLOCKCHAIN_NETWORK || 'localhost'
    },
    ai: {
        modelPath: process.env.AI_MODEL_PATH || './models',
        predictionEndpoint: process.env.AI_PREDICTION_ENDPOINT || 'http://localhost:5000/predict',
    },
    honeypots: {
        http: {
            enabled: true,
            port: process.env.HTTP_HONEYPOT_PORT ? parseInt(process.env.HTTP_HONEYPOT_PORT) : 8080
        },
        dns: {
            enabled: true,
            port: process.env.DNS_HONEYPOT_PORT ? parseInt(process.env.DNS_HONEYPOT_PORT) : 53
        },
        smtp: {
            port: process.env.SMTP_HONEYPOT_PORT ? parseInt(process.env.SMTP_HONEYPOT_PORT) : 25
        }
    }
};
