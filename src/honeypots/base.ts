import { EventEmitter } from 'events';
import { AttackPredictor } from '../services/ai/predictor';
import { BlockchainLogger } from '../services/blockchain/logger';
import type { TrafficData } from '../types';
import { v4 as uuidv4 } from 'uuid';

export abstract class BaseHoneypot extends EventEmitter {
    protected protocol: 'http' | 'dns' | 'smtp';
    protected trafficData: Map<string, TrafficData>;

    constructor(protocol: 'http' | 'dns' | 'smtp') {
        super();
        this.protocol = protocol;
        this.trafficData = new Map();
    }

    protected logTraffic(data: TrafficData) {
        const id = uuidv4();
        this.trafficData.set(id, {
            ...data,
            timestamp: Date.now()
        });

        // Clean old data (older than 5 minutes)
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        for (const [key, value] of this.trafficData.entries()) {
            if (value.timestamp < fiveMinutesAgo) {
                this.trafficData.delete(key);
            }
        }

        // Emit traffic event for monitoring
        this.emit('traffic', data);
    }

    abstract start(): void;
    abstract stop(): Promise<void>;
}
