import type { TrafficData } from "../../types";

export class TrafficPatternGenerator {
  // Common attack patterns with real-world characteristics
  private static readonly ATTACK_PATTERNS = {
    // HTTP Flood pattern based on real attack data
    HTTP_FLOOD: {
      protocol: 'http',
      burstSize: { min: 50, max: 200 },
      burstInterval: { min: 100, max: 500 },
      requestRate: 'high',
      ipSpread: 'low',
      paths: ['/login', '/admin', '/wp-login.php', '/administrator'],
      queryTypes: []
    },
    DNS_AMPLIFICATION: {
      protocol: 'dns',
      burstSize: { min: 30, max: 100 },
      burstInterval: { min: 200, max: 1000 },
      requestRate: 'medium',
      ipSpread: 'medium',
      paths: [],
      queryTypes: ['ANY', 'TXT', 'MX']
    },
    SMTP_BRUTE_FORCE: {
      protocol: 'smtp',
      burstSize: { min: 10, max: 50 },
      burstInterval: { min: 500, max: 2000 },
      requestRate: 'low',
      ipSpread: 'high',
      paths: [],
      queryTypes: []
    },
    SLOW_LORIS: {
      protocol: 'http',
      burstSize: { min: 5, max: 20 },
      burstInterval: { min: 2000, max: 5000 },
      requestRate: 'very_low',
      ipSpread: 'very_high',
      paths: ['/'],
      queryTypes: []
    }
  };

  // Generate IPs with more realistic distribution
  private static generateIPs(rate: string, spread: string): Set<string> {
    const counts = {
      very_low: { min: 1, max: 5 },
      low: { min: 5, max: 20 },
      medium: { min: 20, max: 50 },
      high: { min: 50, max: 200 },
      very_high: { min: 200, max: 500 }
    };

    const count = counts[rate] || counts.medium;
    const uniqueCount = Math.floor(
      Math.random() * (count.max - count.min) + count.min
    );

    return new Set(
      Array.from(
        { length: uniqueCount },
        () => `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
      )
    );
  }

  // Generate paths with realistic distribution
  private static generatePaths(config: any): string[] {
    if (!config.paths || config.paths.length === 0) {
      return ['/'];
    }

    const numPaths = Math.floor(Math.random() * 3) + 1;
    const paths = [];
    for (let i = 0; i < numPaths; i++) {
      paths.push(config.paths[Math.floor(Math.random() * config.paths.length)]);
    }
    return paths;
  }

  // Generate traffic data with realistic burst patterns
  public static generateTrafficData(
    pattern: keyof typeof TrafficPatternGenerator.ATTACK_PATTERNS,
    duration: number = 60000 // default 1 minute
  ): TrafficData[] {
    console.log(`Generating ${pattern} traffic data...`);
    try {
      const patternConfig = TrafficPatternGenerator.ATTACK_PATTERNS[pattern];
      const data: TrafficData[] = [];

      // Calculate total number of bursts
      const avgBurstInterval =
        (patternConfig.burstInterval.min + patternConfig.burstInterval.max) / 2;
      const totalBursts = Math.ceil(duration / avgBurstInterval);

      // Generate all bursts at once
      for (let burst = 0; burst < totalBursts; burst++) {
        const burstSize = Math.floor(
          Math.random() *
            (patternConfig.burstSize.max - patternConfig.burstSize.min) +
            patternConfig.burstSize.min
        );

        // Generate requests for this burst
        const burstTime = burst * avgBurstInterval;
        for (let i = 0; i < burstSize; i++) {
          const trafficData = this.generateSingleRequest(patternConfig);
          trafficData.timestamp =
            Date.now() + burstTime + Math.floor(Math.random() * 1000);
          console.log(trafficData);

          data.push(trafficData);
        }
      }

      console.log(`Generated ${data.length} requests for ${pattern}`);
      return data;
    } catch (error) {
      console.error(`Error generating ${pattern} traffic:`, error);
      throw error;
    }
  }

  // Generate mixed traffic with more realistic background noise
  public static generateMixedTraffic(duration: number = 60000): TrafficData[] {
    console.log(`Generating mixed traffic data...`);
    try {
      const data: TrafficData[] = [];

      // Generate normal background traffic
      const normalConfig = {
        protocol: ["http", "dns", "smtp"],
        paths: ["/api", "/data", "/public"],
        minBurstSize: 1,
        maxBurstSize: 5,
        burstInterval: 1000,
      };

      // Calculate total number of bursts
      const totalBursts = Math.ceil(duration / normalConfig.burstInterval);

      // Generate all bursts at once
      for (let burst = 0; burst < totalBursts; burst++) {
        const burstSize = Math.floor(
          Math.random() *
            (normalConfig.maxBurstSize - normalConfig.minBurstSize) +
            normalConfig.minBurstSize
        );

        const burstTime = burst * normalConfig.burstInterval;
        for (let i = 0; i < burstSize; i++) {
          const protocol = normalConfig.protocol[
            Math.floor(Math.random() * normalConfig.protocol.length)
          ] as "http" | "dns" | "smtp";

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
            paths: [
              normalConfig.paths[
                Math.floor(Math.random() * normalConfig.paths.length)
              ],
            ],
            sourceIp: Array.from(uniqueIps)[0],
            timestamp:
              Date.now() + burstTime + Math.floor(Math.random() * 1000),
          });
        }
      }

      console.log(`Generated ${data.length} requests for mixed traffic`);
      return data;
    } catch (error) {
      console.error("Error generating mixed traffic:", error);
      throw error;
    }
  }

  private static generateSingleRequest(patternConfig: any): TrafficData {
    const sourceIp = Array.from(
      this.generateIPs(patternConfig.requestRate, patternConfig.ipSpread)
    )[0];
    const timestamp = Date.now();

    const data: TrafficData = {
      protocol: patternConfig.protocol as "http" | "dns" | "smtp",
      requestCount: 1,
      timeWindow: 60000,
      uniqueIps: new Set([sourceIp]),
      sourceIp,
      timestamp,
    };

    // Add protocol-specific data
    if (patternConfig.protocol === "http") {
      data.paths = this.generatePaths(patternConfig);
    } else if (patternConfig.protocol === "dns") {
      data.queryTypes = [
        patternConfig.queryTypes[
          Math.floor(Math.random() * patternConfig.queryTypes.length)
        ],
      ];
    }

    return data;
  }
}
