import axios from 'axios';
import dns from 'dns/promises';
import { SMTPClient } from 'emailjs';
import { createSocket } from 'dgram';
import config from '../config';
import { TrafficPatternGenerator } from '../services/traffic/patterns';

// Simulate different traffic patterns
const patterns = {
    normal: { minDelay: 500, maxDelay: 2000, burstProbability: 0.1 },
    suspicious: { minDelay: 100, maxDelay: 500, burstProbability: 0.3 },
    attack: { minDelay: 10, maxDelay: 100, burstProbability: 0.8 }
};

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class TrafficSimulator {
    private httpEndpoint: string;
    private dnsClient: ReturnType<typeof createSocket>;
    private smtpClient: SMTPClient;

    constructor() {
        this.httpEndpoint = `http://localhost:${config.honeypots.http.port}`;
        this.dnsClient = createSocket('udp4');
        
        this.smtpClient = new SMTPClient({
            user: 'test@example.com',
            password: 'password123',
            host: 'localhost',
            port: config.honeypots.smtp.port,
            tls: false,
            timeout: 5000
        });
    }

    private async simulateHTTPTraffic(trafficData: any) {
        const { paths = ['/'], sourceIp } = trafficData;
        
        for (const path of paths) {
            try {
                await axios.get(`${this.httpEndpoint}${path}`, {
                    headers: {
                        'X-Forwarded-For': sourceIp,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
            } catch (error) {
                // Ignore errors as honeypot may return various status codes
            }
        }
    }

    private async simulateDNSTraffic(trafficData: any) {
        const { queryTypes = ['A'], sourceIp } = trafficData;
        const domains = [
            'test.com',
            'example.com',
            'honeypot.local',
            'attack.test'
        ];

        for (const queryType of queryTypes) {
            const domain = domains[Math.floor(Math.random() * domains.length)];
            const dnsQuery = this.createDNSQuery(domain, queryType);
            
            this.dnsClient.send(dnsQuery, config.honeypots.dns.port, 'localhost');
        }
    }

    private async simulateSMTPTraffic(trafficData: any) {
        const { sourceIp } = trafficData;
        const emailAddresses = [
            'test@example.com',
            'admin@test.com',
            'user@honeypot.local',
            'spam@attack.test'
        ];

        try {
            await this.smtpClient.send({
                from: emailAddresses[Math.floor(Math.random() * emailAddresses.length)],
                to: emailAddresses[Math.floor(Math.random() * emailAddresses.length)],
                subject: 'Test Email',
                text: 'This is a test email from the traffic simulator.',
                headers: {
                    'X-Originating-IP': sourceIp
                }
            });
        } catch (error) {
            // Ignore errors as honeypot may reject connections
        }
    }

    private createDNSQuery(domain: string, type: string): Buffer {
        // Simple DNS query format
        const buffer = Buffer.alloc(512);
        let offset = 0;

        // Transaction ID
        buffer.writeUInt16BE(Math.floor(Math.random() * 65535), offset);
        offset += 2;

        // Flags (standard query)
        buffer.writeUInt16BE(0x0100, offset);
        offset += 2;

        // Questions count
        buffer.writeUInt16BE(1, offset);
        offset += 2;

        // Answer RRs, Authority RRs, Additional RRs
        buffer.writeUInt16BE(0, offset);
        offset += 2;
        buffer.writeUInt16BE(0, offset);
        offset += 2;
        buffer.writeUInt16BE(0, offset);
        offset += 2;

        // Query name
        const labels = domain.split('.');
        for (const label of labels) {
            buffer.writeUInt8(label.length, offset++);
            buffer.write(label, offset);
            offset += label.length;
        }
        buffer.writeUInt8(0, offset++);

        // Query type
        const types: { [key: string]: number } = {
            A: 1,
            NS: 2,
            CNAME: 5,
            SOA: 6,
            PTR: 12,
            MX: 15,
            TXT: 16,
            AAAA: 28,
            ANY: 255
        };
        buffer.writeUInt16BE(types[type] || 1, offset);
        offset += 2;

        // Query class (IN)
        buffer.writeUInt16BE(1, offset);
        offset += 2;

        return buffer.slice(0, offset);
    }

    public async simulatePattern(pattern: keyof typeof TrafficPatternGenerator.ATTACK_PATTERNS, duration: number = 60000) {
        console.log(`Starting ${pattern} traffic simulation for ${duration/1000} seconds...`);
        
        const trafficData = TrafficPatternGenerator.generateTrafficData(pattern, duration);
        
        for (const data of trafficData) {
            switch (data.protocol) {
                case 'http':
                    await this.simulateHTTPTraffic(data);
                    break;
                case 'dns':
                    await this.simulateDNSTraffic(data);
                    break;
                case 'smtp':
                    await this.simulateSMTPTraffic(data);
                    break;
            }

            // Add small delay between requests
            await sleep(Math.random() * 100);
        }
    }

    public async simulateMixedTraffic(duration: number = 60000, attackType?: keyof typeof TrafficPatternGenerator.ATTACK_PATTERNS) {
        console.log(`Starting mixed traffic simulation for ${duration/1000} seconds...`);
        
        const trafficData = TrafficPatternGenerator.generateMixedTraffic(duration, attackType);
        
        for (const data of trafficData) {
            switch (data.protocol) {
                case 'http':
                    await this.simulateHTTPTraffic(data);
                    break;
                case 'dns':
                    await this.simulateDNSTraffic(data);
                    break;
                case 'smtp':
                    await this.simulateSMTPTraffic(data);
                    break;
            }

            // Add small delay between requests
            await sleep(Math.random() * 100);
        }
    }

    public cleanup() {
        this.dnsClient.close();
        this.smtpClient.close();
    }
}

// Start simulation
const args = process.argv.slice(2);
const duration = parseInt(args[0]) || 60000; // Duration in milliseconds
const patternType = args[1] as keyof typeof TrafficPatternGenerator.ATTACK_PATTERNS | undefined;

const simulator = new TrafficSimulator();

if (patternType) {
    simulator.simulatePattern(patternType, duration)
        .then(() => simulator.cleanup())
        .catch(console.error);
} else {
    simulator.simulateMixedTraffic(duration)
        .then(() => simulator.cleanup())
        .catch(console.error);
}
