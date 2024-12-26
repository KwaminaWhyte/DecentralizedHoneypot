import axios from 'axios';
import config from '../../config';
import type { TrafficData, AttackClassification } from '../../types';
import { DDoSModel } from './models/ddosModel';

export class AttackPredictor {
    private static instance: AttackPredictor;
    private readonly baseUrl: string;
    private readonly modelPath: string;
    private mlModel: DDoSModel;

    private constructor() {
        this.baseUrl = config.ai.predictionEndpoint;
        this.modelPath = config.ai.modelPath;
        this.mlModel = new DDoSModel();
    }

    public static getInstance(): AttackPredictor {
        if (!AttackPredictor.instance) {
            AttackPredictor.instance = new AttackPredictor();
        }
        return AttackPredictor.instance;
    }

    async predictAttack(trafficData: TrafficData): Promise<AttackClassification> {
        try {
            // Get ML model prediction
            const mlPrediction = await this.mlModel.predict(trafficData);
            
            // Get rule-based prediction as backup
            const rulePrediction = this.simpleRuleBasedClassification(trafficData);

            // Combine predictions (prefer ML if confidence is high)
            if (mlPrediction.confidence > 0.8) {
                return mlPrediction;
            } else {
                // Combine both predictions
                const combinedConfidence = (mlPrediction.confidence + rulePrediction.confidence) / 2;
                return {
                    ...mlPrediction,
                    confidence: combinedConfidence,
                    details: {
                        ...mlPrediction.details,
                        ruleBased: rulePrediction.details,
                        combinedPrediction: true
                    }
                };
            }
        } catch (error) {
            console.error('Error in predictAttack:', error);
            // Fallback to rule-based system
            return this.simpleRuleBasedClassification(trafficData);
        }
    }

    private calculatePatternScore(trafficData: TrafficData): number {
        const { requestCount, timeWindow } = trafficData;
        const rps = requestCount / (timeWindow / 1000);
        
        // Time-based pattern detection
        const timePatterns = {
            burstThreshold: 10,  // requests per second
            sustainedThreshold: 5,
            cooldownPeriod: 2000 // ms
        };

        // Calculate burst score
        const burstScore = rps > timePatterns.burstThreshold ? 
            (rps - timePatterns.burstThreshold) / timePatterns.burstThreshold : 0;

        // Calculate sustained attack score
        const sustainedScore = rps > timePatterns.sustainedThreshold ? 
            (rps - timePatterns.sustainedThreshold) / (timePatterns.burstThreshold - timePatterns.sustainedThreshold) : 0;

        return Math.max(burstScore, sustainedScore);
    }

    private detectAttackPattern(trafficData: TrafficData): {
        pattern: string,
        confidence: number,
        indicators: string[]
    } {
        const { protocol, requestCount, timeWindow } = trafficData;
        const rps = requestCount / (timeWindow / 1000);
        const patternScore = this.calculatePatternScore(trafficData);
        const indicators: string[] = [];

        // Protocol-specific patterns
        switch (protocol) {
            case 'http':
                if (trafficData.paths?.some(p => p.includes('admin') || p.includes('wp-') || p.includes('.php'))) {
                    indicators.push('Targeting sensitive endpoints');
                }
                if (trafficData.paths?.every(p => p === trafficData.paths[0])) {
                    indicators.push('Single endpoint targeting');
                }
                break;

            case 'dns':
                if (trafficData.queryTypes?.includes('ANY')) {
                    indicators.push('DNS amplification attempt');
                }
                if (trafficData.queryTypes?.every(q => q === trafficData.queryTypes[0])) {
                    indicators.push('Single query type pattern');
                }
                break;

            case 'smtp':
                // SMTP-specific patterns
                if (rps > 2) {
                    indicators.push('High email send rate');
                }
                break;
        }

        // Determine attack pattern
        let pattern = 'normal';
        let confidence = 0;

        if (patternScore > 0.8) {
            pattern = 'ddos';
            confidence = patternScore;
        } else if (indicators.length > 0) {
            pattern = 'targeted';
            confidence = 0.6 + (indicators.length * 0.1);
        } else if (patternScore > 0.4) {
            pattern = 'suspicious';
            confidence = patternScore;
        }

        return {
            pattern,
            confidence: Math.min(confidence, 1),
            indicators
        };
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

        // Get attack pattern analysis
        const patternAnalysis = this.detectAttackPattern(trafficData);

        // Initialize classification
        let attackType = patternAnalysis.pattern;
        let confidence = patternAnalysis.confidence;
        const details: Record<string, any> = {
            rps,
            ipRatio,
            uniqueIpCount: uniqueIpsCount,
            totalRequests: requestCount,
            indicators: patternAnalysis.indicators,
            patternScore: this.calculatePatternScore(trafficData)
        };

        // Adjust based on IP ratio
        if (ipRatio < 0.1 && requestCount > 10) {
            details.ipDiversity = 'low';
            confidence = Math.min(confidence + 0.2, 1);
            details.reason = 'Low IP diversity';
        }

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
