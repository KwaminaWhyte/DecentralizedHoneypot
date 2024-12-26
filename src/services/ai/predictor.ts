import axios from 'axios';
import config from '../../config';
import type { TrafficData, AttackClassification } from '../../types';

export class AttackPredictor {
    private static instance: AttackPredictor;
    private readonly baseUrl: string;
    private readonly modelPath: string;

    private constructor() {
        this.baseUrl = config.ai.predictionEndpoint;
        this.modelPath = config.ai.modelPath;
    }

    public static getInstance(): AttackPredictor {
        if (!AttackPredictor.instance) {
            AttackPredictor.instance = new AttackPredictor();
        }
        return AttackPredictor.instance;
    }

    async predictAttack(trafficData: TrafficData): Promise<AttackClassification> {
        try {
            // For now, we'll use a simple rule-based system until the ML model is ready
            const classification = this.simpleRuleBasedClassification(trafficData);
            
            // Log the prediction
            console.log('Attack Classification:', {
                attackType: classification.attackType,
                confidence: classification.confidence,
                details: classification.details
            });

            return classification;
        } catch (error) {
            console.error('Error in predictAttack:', error);
            // Return a safe default classification
            return {
                attackType: 'unknown',
                confidence: 0,
                timestamp: new Date(),
                details: {
                    error: 'Failed to analyze traffic',
                    reason: error.message
                }
            };
        }
    }

    private simpleRuleBasedClassification(trafficData: TrafficData): AttackClassification {
        const { protocol, requestCount, timeWindow } = trafficData;
        
        // Handle uniqueIps whether it's an array or Set
        const uniqueIpsCount = Array.isArray(trafficData.uniqueIps) 
            ? trafficData.uniqueIps.length 
            : trafficData.uniqueIps?.size ?? 1;
        
        // Calculate requests per second
        const rps = requestCount / (timeWindow / 1000);
        
        // Calculate unique IP ratio (prevent division by zero)
        const ipRatio = requestCount > 0 ? uniqueIpsCount / requestCount : 1;

        // Initialize classification
        let attackType = 'normal';
        let confidence = 0;
        const details: Record<string, string | number | boolean> = {
            rps,
            ipRatio,
            uniqueIpCount: uniqueIpsCount,
            totalRequests: requestCount
        };

        // Protocol-specific thresholds
        const thresholds = {
            http: { normal: 5, suspicious: 10, attack: 20 },
            dns: { normal: 3, suspicious: 8, attack: 15 },
            smtp: { normal: 2, suspicious: 5, attack: 10 }
        };

        const threshold = thresholds[protocol as keyof typeof thresholds] ?? thresholds.http;

        // Classify based on RPS
        if (rps > threshold.attack) {
            attackType = 'ddos';
            confidence = Math.min((rps - threshold.attack) / threshold.attack, 1);
            details.reason = 'High request rate';
        } else if (rps > threshold.suspicious) {
            attackType = 'suspicious';
            confidence = (rps - threshold.suspicious) / (threshold.attack - threshold.suspicious);
            details.reason = 'Elevated request rate';
        }

        // Adjust based on IP ratio
        if (ipRatio < 0.1 && requestCount > 10) {
            // Low IP diversity suggests bot/automated traffic
            details.ipDiversity = 'low';
            if (attackType === 'normal') {
                attackType = 'suspicious';
                confidence = 0.6;
                details.reason = 'Low IP diversity';
            } else {
                confidence = Math.min(confidence + 0.2, 1);
            }
        }

        // Protocol-specific checks
        switch (protocol) {
            case 'http':
                if (trafficData.paths?.some(p => p.includes('admin') || p.includes('login'))) {
                    details.sensitiveEndpoints = true;
                    confidence = Math.min(confidence + 0.1, 1);
                }
                break;
            case 'dns':
                // Check for DNS amplification patterns
                if (trafficData.queryTypes?.includes('ANY')) {
                    details.dnsAmplification = true;
                    attackType = 'dns_amplification';
                    confidence = Math.max(confidence, 0.8);
                }
                break;
            case 'smtp':
                // Check for spam patterns
                if (rps > threshold.suspicious && ipRatio < 0.2) {
                    details.spamPattern = true;
                    attackType = 'spam';
                    confidence = Math.max(confidence, 0.7);
                }
                break;
        }

        return {
            attackType,
            confidence,
            timestamp: new Date(),
            details
        };
    }
}
