// Common type definitions
export interface TrafficLog {
    sourceIp: string;
    timestamp: Date;
    protocol: 'http' | 'dns' | 'smtp';
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

export interface TrafficData {
    protocol: 'http' | 'dns' | 'smtp';
    requestCount: number;
    timeWindow: number;
    uniqueIps: string[] | Set<string>;
    paths?: string[];
    queryTypes?: string[];
    sourceIp: string;
    timestamp: number;
}

export interface AttackClassification {
    attackType: string;
    confidence: number;
    timestamp: Date;
    details: Record<string, string | number | boolean>;
}

export interface BlockchainLog {
    hash: string;
    attackId: string;
    timestamp: Date;
    classification: AttackClassification;
    trafficSummary: any;
}

export interface AttackAlert {
    id: string;
    timestamp: Date;
    sourceIp: string;
    protocol: 'http' | 'dns' | 'smtp';
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

export interface HoneypotConfig {
    http: {
        port: number;
    };
    dns: {
        port: number;
    };
    smtp: {
        port: number;
    };
}
