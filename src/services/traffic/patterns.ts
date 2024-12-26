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
        const config = this.ATTACK_PATTERNS[pattern];
        const trafficData: TrafficData[] = [];
        const startTime = Date.now();
        const uniqueIps = this.generateIPs(config.requestRate, config.ipSpread);

        let currentTime = startTime;
        while (currentTime < startTime + duration) {
            // Generate burst
            const burstSize = Math.floor(
                Math.random() * (config.burstSize.max - config.burstSize.min) + 
                config.burstSize.min
            );
            
            const burstDuration = Math.floor(
                Math.random() * (config.burstDuration.max - config.burstDuration.min) + 
                config.burstDuration.min
            );

            // Generate requests within burst
            for (let i = 0; i < burstSize; i++) {
                const timestamp = currentTime + Math.floor(Math.random() * burstDuration);
                const sourceIp = Array.from(uniqueIps)[Math.floor(Math.random() * uniqueIps.size)];

                const data: TrafficData = {
                    protocol: config.protocol as 'http' | 'dns' | 'smtp',
                    requestCount: 1,
                    timeWindow: duration,
                    uniqueIps: new Set([sourceIp]),
                    sourceIp,
                    timestamp
                };

                // Add protocol-specific data
                if (config.protocol === 'http') {
                    data.paths = this.generatePaths(config);
                } else if (config.protocol === 'dns') {
                    data.queryTypes = [
                        config.queryTypes[Math.floor(Math.random() * config.queryTypes.length)]
                    ];
                }

                trafficData.push(data);
            }

            // Move to next burst
            const burstInterval = Math.floor(
                Math.random() * (config.burstInterval.max - config.burstInterval.min) + 
                config.burstInterval.min
            );
            currentTime += burstInterval;
        }

        return trafficData.sort((a, b) => a.timestamp - b.timestamp);
    }

    // Generate mixed traffic with more realistic background noise
    public static generateMixedTraffic(
        duration: number = 60000,
        attackType?: keyof typeof TrafficPatternGenerator.ATTACK_PATTERNS
    ): TrafficData[] {
        // Generate low-volume background traffic
        const normalTraffic = this.generateNormalTraffic(duration);
        
        // If attack type specified, add attack traffic
        if (attackType) {
            const attackTraffic = this.generateTrafficData(attackType, duration);
            return [...normalTraffic, ...attackTraffic].sort((a, b) => a.timestamp - b.timestamp);
        }

        return normalTraffic;
    }

    // Generate normal background traffic with realistic patterns
    private static generateNormalTraffic(duration: number): TrafficData[] {
        const trafficData: TrafficData[] = [];
        const protocols: Array<'http' | 'dns' | 'smtp'> = ['http', 'dns', 'smtp'];
        const startTime = Date.now();

        protocols.forEach(protocol => {
            // Normal traffic rates
            const requestRate = {
                http: { min: 2, max: 10 },  // 2-10 requests per second
                dns: { min: 1, max: 5 },    // 1-5 requests per second
                smtp: { min: 0.1, max: 1 }  // 0.1-1 requests per second
            }[protocol];

            const totalRequests = Math.floor(
                (Math.random() * (requestRate.max - requestRate.min) + requestRate.min) * 
                (duration / 1000)
            );

            const uniqueIps = this.generateIPs(totalRequests, 'medium');

            for (let i = 0; i < totalRequests; i++) {
                const timestamp = startTime + Math.floor(Math.random() * duration);
                const sourceIp = Array.from(uniqueIps)[Math.floor(Math.random() * uniqueIps.size)];

                const data: TrafficData = {
                    protocol,
                    requestCount: 1,
                    timeWindow: duration,
                    uniqueIps: new Set([sourceIp]),
                    sourceIp,
                    timestamp
                };

                if (protocol === 'http') {
                    data.paths = ['/'].concat(Math.random() < 0.2 ? this.generatePaths({}) : []);
                } else if (protocol === 'dns') {
                    data.queryTypes = ['A', 'AAAA', 'MX'][Math.floor(Math.random() * 3)];
                }

                trafficData.push(data);
            }
        });

        return trafficData.sort((a, b) => a.timestamp - b.timestamp);
    }
}
