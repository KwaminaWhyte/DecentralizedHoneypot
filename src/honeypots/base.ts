import { EventEmitter } from 'events';
import { AttackPredictor } from '../services/ai/predictor';
import { BlockchainLogger } from '../services/blockchain/logger';
import type { TrafficData, AttackClassification } from '../types';
import { v4 as uuidv4 } from 'uuid';

export abstract class BaseHoneypot extends EventEmitter {
    protected protocol: 'http' | 'dns' | 'smtp';
    protected port: number;
    protected trafficWindow: number = 60000; // 1 minute window for traffic analysis
    protected trafficData: Map<string, TrafficData> = new Map();
    protected aiPredictor: AttackPredictor;
    protected blockchainLogger: BlockchainLogger;

    constructor(protocol: 'http' | 'dns' | 'smtp', port: number) {
        super();
        this.protocol = protocol;
        this.port = port;
        this.aiPredictor = AttackPredictor.getInstance();
        this.blockchainLogger = BlockchainLogger.getInstance();

        // Clean up old traffic data every minute
        setInterval(() => this.cleanupTrafficData(), 60000);
    }

    protected async logTraffic(sourceIp: string, requestData: any = {}) {
        const now = Date.now();
        const windowStart = now - this.trafficWindow;

        // Get or create traffic data for this IP
        let data = this.trafficData.get(sourceIp);
        if (!data) {
            data = {
                protocol: this.protocol,
                requestCount: 0,
                timeWindow: this.trafficWindow,
                uniqueIps: new Set([sourceIp]),
                timestamp: now,
                sourceIp,
                ...requestData
            };
            this.trafficData.set(sourceIp, data);
        } else {
            data.uniqueIps.add(sourceIp);
            data.timestamp = now;
        }

        // Update traffic data
        data.requestCount++;
        if (requestData.paths) {
            data.paths = [...new Set([...(data.paths || []), ...requestData.paths])];
        }
        if (requestData.queryTypes) {
            data.queryTypes = [...new Set([...(data.queryTypes || []), ...requestData.queryTypes])];
        }

        // Convert Set to array for analysis
        const trafficDataForAnalysis = {
            ...data,
            uniqueIps: Array.from(data.uniqueIps)
        };

        // Analyze traffic for potential attacks
        await this.analyzeTraffic(trafficDataForAnalysis);
    }

    protected async analyzeTraffic(trafficData: TrafficData) {
        try {
            // Get attack classification from AI predictor
            const classification = await this.aiPredictor.predictAttack(trafficData);

            // If attack confidence is high enough, log to blockchain and emit alert
            if (classification.confidence > 0.5) {
                const attackId = uuidv4();
                await this.logAttack(attackId, classification, trafficData);
                this.emitAlert(classification, trafficData);
            }
        } catch (error) {
            console.error('Error analyzing traffic:', error);
        }
    }

    protected async logAttack(attackId: string, classification: AttackClassification, trafficData: TrafficData) {
        try {
            await this.blockchainLogger.logAttack(attackId, classification, {
                sourceIp: trafficData.sourceIp,
                protocol: this.protocol,
                requestCount: trafficData.requestCount
            });
        } catch (error) {
            console.error('Error logging attack to blockchain:', error);
        }
    }

    protected emitAlert(classification: AttackClassification, trafficData: TrafficData) {
        this.emit('attack', {
            timestamp: new Date(),
            sourceIp: trafficData.sourceIp,
            protocol: this.protocol,
            attackType: classification.attackType,
            confidence: classification.confidence,
            details: Object.entries(classification.details).map(([key, value]) => `${key}: ${value}`)
        });
    }

    private cleanupTrafficData() {
        const now = Date.now();
        const windowStart = now - this.trafficWindow;

        for (const [ip, data] of this.trafficData.entries()) {
            if (data.timestamp < windowStart) {
                this.trafficData.delete(ip);
            }
        }
    }

    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
}
