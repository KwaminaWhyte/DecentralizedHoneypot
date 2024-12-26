import { ethers } from 'ethers';
import config from '../../config';
import type { AttackClassification, BlockchainLog } from '../../types';
import fs from 'fs';
import path from 'path';

export class BlockchainLogger {
    private static instance: BlockchainLogger;
    private provider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet;
    private contract: ethers.Contract;
    
    private constructor() {
        if (!config.blockchain.rpcUrl) {
            throw new Error('Blockchain RPC URL not configured');
        }
        this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
        
        if (!config.blockchain.privateKey) {
            throw new Error('Blockchain private key not configured');
        }
        this.wallet = new ethers.Wallet(config.blockchain.privateKey, this.provider);

        // Load contract deployment info
        const deploymentPath = path.join(__dirname, '../../contracts/deployment.json');
        if (!fs.existsSync(deploymentPath)) {
            throw new Error('Contract deployment info not found. Please deploy the contract first.');
        }

        const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        this.contract = new ethers.Contract(
            deployment.address,
            deployment.abi,
            this.wallet
        );
    }

    public static getInstance(): BlockchainLogger {
        if (!BlockchainLogger.instance) {
            BlockchainLogger.instance = new BlockchainLogger();
        }
        return BlockchainLogger.instance;
    }

    async logAttack(attackId: string, classification: AttackClassification, trafficSummary: any): Promise<BlockchainLog> {
        try {
            console.log('Logging attack to blockchain:', {
                attackId,
                classification,
                trafficSummary
            });
            
            // Convert confidence to uint8 (0-100)
            const confidence = Math.round(classification.confidence * 100);

            // Prepare indicators array
            const indicators = Object.entries(classification.details)
                .map(([key, value]) => `${key}: ${value}`)
                .filter(indicator => indicator.length < 100); // Limit string length for gas efficiency

            // Log the attack to the blockchain
            const tx = await this.contract.logAttack(
                attackId,
                classification.attackType,
                confidence,
                trafficSummary.sourceIp,
                trafficSummary.protocol,
                trafficSummary.requestCount,
                indicators
            );

            // Wait for transaction confirmation
            const receipt = await tx.wait();
            
            return {
                hash: receipt.hash,
                attackId,
                timestamp: new Date(),
                classification,
                trafficSummary
            };
        } catch (error) {
            console.error('Error logging to blockchain:', error);
            throw error;
        }
    }

    async getAttack(attackId: string): Promise<any> {
        try {
            const attack = await this.contract.getAttack(attackId);
            return {
                attackId: attack.attackId,
                reporter: attack.reporter,
                timestamp: new Date(Number(attack.timestamp) * 1000),
                attackType: attack.attackType,
                confidence: Number(attack.confidence) / 100,
                sourceIp: attack.sourceIp,
                protocol: attack.protocol,
                requestCount: Number(attack.requestCount),
                indicators: attack.indicators
            };
        } catch (error) {
            console.error('Error fetching attack from blockchain:', error);
            throw error;
        }
    }

    async getRecentAttacks(limit: number = 10): Promise<any[]> {
        try {
            const count = await this.contract.getAttackCount();
            const start = count > limit ? count - limit : 0;
            
            const attackIds = await this.contract.getAttackIds(start, limit);
            const attacks = await Promise.all(
                attackIds.map(id => this.getAttack(id))
            );

            return attacks;
        } catch (error) {
            console.error('Error fetching recent attacks:', error);
            throw error;
        }
    }
}
