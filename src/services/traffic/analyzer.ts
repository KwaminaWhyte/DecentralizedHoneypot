import { TrafficLogModel } from '../../models/TrafficLog';
import type { TrafficLog, BurstPeriod } from '../../types';

export interface TrafficMetrics {
    requestCount: number;
    averageRequestInterval: number;
    burstCount: number;
    uniquePaths: string[];
    suspiciousScore: number;
    recentRequests: Array<{
        timestamp: Date;
        sourceIp: string;
        protocol: 'HTTP' | 'DNS';
        path: string;
    }>;
    attackAnalysis: {
        isAttack: boolean;
        type: string;
        confidence: number;
        details: string[];
        burstPeriods: Array<BurstPeriod>;
    };
}

export class TrafficAnalyzer {
    private static instance: TrafficAnalyzer;

    private constructor() {}

    public static getInstance(): TrafficAnalyzer {
        if (!TrafficAnalyzer.instance) {
            TrafficAnalyzer.instance = new TrafficAnalyzer();
        }
        return TrafficAnalyzer.instance;
    }

    async getMetricsForTimeWindow(protocol: 'HTTP' | 'DNS', timeWindowMs: number = 5 * 60 * 1000): Promise<TrafficMetrics> {
        const startTime = new Date(Date.now() - timeWindowMs);
        
        const logs = await TrafficLogModel.find({
            protocol,
            timestamp: { $gte: startTime }
        }).sort({ timestamp: 1 });

        return this.calculateMetrics(logs);
    }

    private calculateMetrics(logs: TrafficLog[]): TrafficMetrics {
        if (logs.length === 0) {
            return {
                requestCount: 0,
                averageRequestInterval: 0,
                burstCount: 0,
                uniquePaths: [],
                suspiciousScore: 0,
                recentRequests: [],
                attackAnalysis: {
                    isAttack: false,
                    type: 'none',
                    confidence: 0,
                    details: [],
                    burstPeriods: []
                }
            };
        }

        const intervals: number[] = [];
        const paths = new Set<string>();
        let burstCount = 0;
        let consecutiveBursts = 0;
        let maxConsecutiveBursts = 0;
        let currentBurstStart: Date | null = null;
        const burstPeriods: BurstPeriod[] = [];

        for (let i = 1; i < logs.length; i++) {
            const interval = logs[i].timestamp.getTime() - logs[i-1].timestamp.getTime();
            intervals.push(interval);

            if (logs[i].requestData?.path) {
                paths.add(logs[i].requestData.path);
            }

            // Burst detection
            if (interval < 100) {
                burstCount++;
                consecutiveBursts++;
                if (!currentBurstStart) {
                    currentBurstStart = logs[i-1].timestamp;
                }
                maxConsecutiveBursts = Math.max(maxConsecutiveBursts, consecutiveBursts);
            } else {
                if (currentBurstStart && consecutiveBursts > 5) {
                    burstPeriods.push({
                        start: currentBurstStart,
                        end: logs[i-1].timestamp,
                        count: consecutiveBursts,
                        duration: logs[i-1].timestamp.getTime() - currentBurstStart.getTime()
                    });
                }
                consecutiveBursts = 0;
                currentBurstStart = null;
            }
        }

        const avgInterval = intervals.length > 0 
            ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
            : 0;

        // Calculate suspicious score and analyze attack patterns
        let suspiciousScore = 0;
        const attackIndicators: string[] = [];

        // Volume-based indicators
        if (logs.length > 100) {
            suspiciousScore += 30;
            attackIndicators.push('High request volume');
        } else if (logs.length > 50) {
            suspiciousScore += 20;
            attackIndicators.push('Moderate request volume');
        }

        // Timing-based indicators
        if (avgInterval < 50) {
            suspiciousScore += 30;
            attackIndicators.push('Extremely rapid requests');
        } else if (avgInterval < 100) {
            suspiciousScore += 20;
            attackIndicators.push('Very fast requests');
        }

        // Burst-based indicators
        if (burstCount > 20) {
            suspiciousScore += 40;
            attackIndicators.push(`High burst count: ${burstCount} bursts detected`);
        } else if (burstCount > 10) {
            suspiciousScore += 20;
            attackIndicators.push(`Moderate burst activity: ${burstCount} bursts detected`);
        }

        // Pattern analysis
        const uniquePathRatio = paths.size / logs.length;
        if (logs.length > 10 && uniquePathRatio < 0.1) {
            suspiciousScore += 10;
            attackIndicators.push('Repetitive request patterns');
        }

        // Determine attack type
        let attackType = 'none';
        let attackConfidence = 0;

        if (suspiciousScore >= 70) {
            attackConfidence = suspiciousScore / 100;
            if (logs[0].protocol === 'DNS') {
                attackType = 'DNS Amplification Attack';
            } else {
                if (maxConsecutiveBursts > 20) {
                    attackType = 'HTTP Flood Attack';
                } else if (paths.size === 1) {
                    attackType = 'Targeted Resource Attack';
                } else {
                    attackType = 'Distributed HTTP Flood';
                }
            }
        }

        return {
            requestCount: logs.length,
            averageRequestInterval: Math.round(avgInterval),
            burstCount,
            uniquePaths: Array.from(paths),
            suspiciousScore,
            recentRequests: logs.slice(-5).map(log => ({
                timestamp: log.timestamp,
                sourceIp: log.sourceIp,
                protocol: log.protocol,
                path: log.requestData?.path || 'N/A'
            })),
            attackAnalysis: {
                isAttack: suspiciousScore >= 70,
                type: attackType,
                confidence: attackConfidence,
                details: attackIndicators,
                burstPeriods
            }
        };
    }

    async analyzeTrafficForSource(sourceIp: string, protocol: 'HTTP' | 'DNS', timeWindowMs: number = 5 * 60 * 1000): Promise<TrafficMetrics> {
        const startTime = new Date(Date.now() - timeWindowMs);
        
        const logs = await TrafficLogModel.find({
            sourceIp,
            protocol,
            timestamp: { $gte: startTime }
        }).sort({ timestamp: 1 });

        return this.calculateMetrics(logs);
    }
}
