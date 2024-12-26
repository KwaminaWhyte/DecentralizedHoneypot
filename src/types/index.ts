// Common type definitions
export interface TrafficLog {
    sourceIp: string;
    timestamp: Date;
    protocol: 'HTTP' | 'DNS';
    requestData: {
        method?: string;
        path?: string;
        headers?: Record<string, string>;
        payload?: any;
    };
    responseData?: {
        statusCode?: number;
        headers?: Record<string, string>;
        body?: any;
    };
}

export interface AttackClassification {
    attackType: string;
    confidence: number;
    timestamp: Date;
    details: Record<string, any>;
}

export interface BlockchainLog {
    hash: string;
    attackId: string;
    timestamp: Date;
    classification: AttackClassification;
    trafficSummary: {
        sourceIp: string;
        requestCount: number;
        protocol: string;
    };
}

export interface AttackAlert {
    id: string;
    timestamp: Date;
    sourceIp: string;
    protocol: 'HTTP' | 'DNS';
    attackType: string;
    confidence: number;
    details: string[];
    metrics: {
        requestCount: number;
        burstCount: number;
        averageInterval: number;
    };
    status: 'active' | 'resolved';
    mitigation?: {
        action: 'rate-limit' | 'block' | 'challenge';
        appliedAt: Date;
        result?: string;
    };
}

export interface BurstPeriod {
    start: Date;
    end: Date;
    count: number;
    duration: number;
}
