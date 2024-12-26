import type { TrafficData } from '../../types';

export class TrafficPatternGenerator {
    // Common attack patterns with real-world characteristics
    private static readonly ATTACK_PATTERNS = {
        // HTTP Flood pattern based on real attack data
        HTTP_FLOOD: {
            requestRate: 1600,          // ~1636 requests observed
            burstSize: { min: 6, max: 43 }, // Based on observed burst sizes
            burstDuration: { min: 55, max: 1562 }, // Based on observed durations
            burstInterval: { min: 100, max: 500 },
            ipSpread: 'low',   // Few source IPs (2 observed)
            paths: [
                '/wp-login.php',
                '/wp-admin',
                '/administrator',
                '/metrics',
                '/debug',
                '/api/v1/auth',
                '/user/login',
                '/console',
                '/xmlrpc.php',
                '/phpmyadmin',
                '/login',
                '/admin',
                '/.env',
                '/actuator',
                '/config.php'
            ],
            protocol: 'http'
        },
        // DNS Amplification with realistic parameters
        DNS_AMPLIFICATION: {
            requestRate: 800,
            burstSize: { min: 10, max: 50 },
            burstDuration: { min: 100, max: 1000 },
            burstInterval: { min: 200, max: 800 },
            ipSpread: 'medium',
            queryTypes: ['ANY', 'TXT', 'MX', 'NS', 'SOA'],
            protocol: 'dns'
        },
        // SMTP Brute Force with realistic timing
        SMTP_BRUTE_FORCE: {
            requestRate: 200,
            burstSize: { min: 5, max: 20 },
            burstDuration: { min: 200, max: 1500 },
            burstInterval: { min: 300, max: 1000 },
            ipSpread: 'low',
            protocol: 'smtp'
        },
        // Slow Loris attack pattern
        SLOW_LORIS: {
            requestRate: 100,
            burstSize: { min: 2, max: 10 },
            burstDuration: { min: 500, max: 2000 },
            burstInterval: { min: 1000, max: 3000 },
            ipSpread: 'very_low',
            paths: [
                '/api/v1/auth',
                '/login',
                '/admin',
                '/user/login'
            ],
            protocol: 'http'
        }
    };

    // Generate IPs with more realistic distribution
    private static generateIPs(count: number, spread: 'very_low' | 'low' | 'medium' | 'high'): Set<string> {
        const ips = new Set<string>();
        const spreadFactors = {
            very_low: 0.1,  // 10% of count (1-2 IPs)
            low: 0.2,       // 20% of count (2-3 IPs)
            medium: 0.5,    // 50% of count
            high: 0.9       // 90% of count
        };

        const targetCount = Math.ceil(count * spreadFactors[spread]);
        
        // Generate IPs from same subnet for more realism
        const baseIP = [
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256)
        ].join('.');
        
        while (ips.size < targetCount) {
            const lastOctet = Math.floor(Math.random() * 256);
            ips.add(`${baseIP}.${lastOctet}`);
        }

        return ips;
    }

    // Generate paths with realistic distribution
    private static generatePaths(config: any): string[] {
        const paths = config.paths || [
            '/wp-login.php',
            '/admin',
            '/wp-admin',
            '/login',
            '/administrator',
            '/phpmyadmin',
            '/xmlrpc.php',
            '/api/v1/auth',
            '/user/login',
            '/.env',
            '/config.php',
            '/debug',
            '/actuator',
            '/metrics',
            '/console'
        ];

        // Generate burst of similar paths
        const selectedPath = paths[Math.floor(Math.random() * paths.length)];
        const burstSize = Math.floor(Math.random() * 3) + 1;
        return Array(burstSize).fill(selectedPath);
    }

    // Generate traffic data with realistic burst patterns
    public static generateTrafficData(
        pattern: keyof typeof TrafficPatternGenerator.ATTACK_PATTERNS,
        duration: number = 60000 // default 1 minute
    ): TrafficData[] {
        console.log(`Generating ${pattern} traffic data for ${duration}ms...`);
        try {
            const patternConfig = TrafficPatternGenerator.ATTACK_PATTERNS[pattern];
            const data: TrafficData[] = [];
            
            let time = 0;
            while (time < duration) {
                // Generate burst
                const burstSize = Math.floor(
                    Math.random() * (patternConfig.burstSize.max - patternConfig.burstSize.min) + 
                    patternConfig.burstSize.min
                );
                
                // Generate requests for this burst
                for (let i = 0; i < burstSize; i++) {
                    const trafficData = this.generateSingleRequest(patternConfig);
                    data.push(trafficData);
                }
                
                // Wait for next burst
                const burstInterval = Math.floor(
                    Math.random() * (patternConfig.burstInterval.max - patternConfig.burstInterval.min) + 
                    patternConfig.burstInterval.min
                );
                time += burstInterval;
            }
            
            console.log(`Generated ${data.length} requests for ${pattern}`);
            return data;
        } catch (error) {
            console.error(`Error generating ${pattern} traffic:`, error);
            throw error;
        }
    }

    // Generate mixed traffic with more realistic background noise
    public static generateMixedTraffic(
        duration: number = 60000,
        attackType?: keyof typeof TrafficPatternGenerator.ATTACK_PATTERNS
    ): TrafficData[] {
        console.log(`Generating mixed traffic data for ${duration}ms...`);
        try {
            const data: TrafficData[] = [];
            
            // Generate normal background traffic
            const normalConfig = {
                protocol: ['http', 'dns', 'smtp'],
                paths: ['/api', '/data', '/public'],
                minBurstSize: 1,
                maxBurstSize: 5,
                minBurstInterval: 1000,
                maxBurstInterval: 5000,
                minUniqueIPs: 1,
                maxUniqueIPs: 3
            };
            
            let time = 0;
            while (time < duration) {
                const burstSize = Math.floor(
                    Math.random() * (normalConfig.maxBurstSize - normalConfig.minBurstSize) + 
                    normalConfig.minBurstSize
                );
                
                for (let i = 0; i < burstSize; i++) {
                    const protocol = normalConfig.protocol[
                        Math.floor(Math.random() * normalConfig.protocol.length)
                    ] as 'http' | 'dns' | 'smtp';
                    
                    const uniqueIps = new Set(
                        Array.from(
                            { length: Math.floor(Math.random() * 3) + 1 },
                            () => `192.168.1.${Math.floor(Math.random() * 255)}`
                        )
                    );
                    
                    data.push({
                        protocol,
                        requestCount: 1,
                        timeWindow: 60000,
                        uniqueIps,
                        paths: [normalConfig.paths[Math.floor(Math.random() * normalConfig.paths.length)]],
                        sourceIp: Array.from(uniqueIps)[0],
                        timestamp: Date.now() + time
                    });
                }
                
                const interval = Math.floor(
                    Math.random() * (normalConfig.maxBurstInterval - normalConfig.minBurstInterval) + 
                    normalConfig.minBurstInterval
                );
                time += interval;
            }
            
            console.log(`Generated ${data.length} requests for mixed traffic`);
            return data;
        } catch (error) {
            console.error('Error generating mixed traffic:', error);
            throw error;
        }
    }

    private static generateSingleRequest(patternConfig: any): TrafficData {
        const sourceIp = Array.from(this.generateIPs(patternConfig.requestRate, patternConfig.ipSpread))[0];
        const timestamp = Date.now();

        const data: TrafficData = {
            protocol: patternConfig.protocol as 'http' | 'dns' | 'smtp',
            requestCount: 1,
            timeWindow: 60000,
            uniqueIps: new Set([sourceIp]),
            sourceIp,
            timestamp
        };

        // Add protocol-specific data
        if (patternConfig.protocol === 'http') {
            data.paths = this.generatePaths(patternConfig);
        } else if (patternConfig.protocol === 'dns') {
            data.queryTypes = [
                patternConfig.queryTypes[Math.floor(Math.random() * patternConfig.queryTypes.length)]
            ];
        }

        return data;
    }
}
