import axios from 'axios';
import dns from 'dns/promises';
import { SMTPClient } from 'emailjs';
import { createSocket } from 'dgram';
import config from '../config';

// Simulate different traffic patterns
const patterns = {
    normal: { minDelay: 500, maxDelay: 2000, burstProbability: 0.1 },
    suspicious: { minDelay: 100, maxDelay: 500, burstProbability: 0.3 },
    attack: { minDelay: 10, maxDelay: 100, burstProbability: 0.8 }
};

// Test endpoints for HTTP
const endpoints = ['/api', '/data', '/admin', '/test', '/login'];

// Test domains for DNS
const domains = ['test.com', 'example.com', 'honeypot.local', 'attack.test'];

// Test email addresses for SMTP
const emailAddresses = [
    'test@example.com',
    'admin@test.com',
    'user@honeypot.local',
    'spam@attack.test'
];

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class TrafficSimulator {
    private httpEndpoint: string;
    private dnsEndpoint: string;
    private dnsClient: ReturnType<typeof createSocket>;
    private smtpClient: SMTPClient;

    constructor() {
        this.httpEndpoint = `http://localhost:${config.honeypots.http.port}`;
        this.dnsEndpoint = 'localhost';
        this.dnsClient = createSocket('udp4');
        
        this.smtpClient = new SMTPClient({
            user: 'test@example.com',
            password: 'password123',
            host: 'localhost',
            port: config.honeypots.smtp.port,
            tls: false,
            timeout: 5000
        });

        // Handle DNS client errors
        this.dnsClient.on('error', (err) => {
            console.error('DNS client error:', err);
        });
    }

    async simulateHttpTraffic(pattern: any) {
        try {
            const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
            const response = await axios.get(`${this.httpEndpoint}${endpoint}`, {
                validateStatus: () => true // Accept any status code
            });
            console.log(`HTTP Request to ${endpoint}: ${response.status}`);
        } catch (error) {
            console.error('HTTP Request failed:', error.message);
        }
    }

    async simulateDnsTraffic(pattern: any) {
        try {
            const domain = domains[Math.floor(Math.random() * domains.length)];
            const query = this.createDnsQuery(domain);
            
            return new Promise<void>((resolve) => {
                this.dnsClient.send(query, 53, this.dnsEndpoint, (err) => {
                    if (err) {
                        console.error('DNS Query failed:', err.message);
                    } else {
                        console.log(`DNS Query for ${domain}`);
                    }
                    resolve();
                });
            });
        } catch (error) {
            console.error('DNS Query failed:', error.message);
        }
    }

    async simulateSmtpTraffic(pattern: any) {
        try {
            const from = emailAddresses[Math.floor(Math.random() * emailAddresses.length)];
            const to = emailAddresses[Math.floor(Math.random() * emailAddresses.length)];
            
            await this.smtpClient.sendAsync({
                from,
                to,
                subject: 'Test Email',
                text: 'This is a test email from the honeypot traffic simulator.'
            });
            
            console.log(`SMTP: Sent email from ${from} to ${to}`);
        } catch (error) {
            // Expected to sometimes fail as the honeypot randomly rejects
            console.log('SMTP: Email send attempt (expected random response)');
        }
    }

    private createDnsQuery(domain: string): Buffer {
        // Simple DNS query format
        const header = Buffer.from([
            0x00, 0x01, // ID
            0x01, 0x00, // Flags
            0x00, 0x01, // QDCOUNT
            0x00, 0x00, // ANCOUNT
            0x00, 0x00, // NSCOUNT
            0x00, 0x00  // ARCOUNT
        ]);

        // Convert domain to DNS format
        const parts = domain.split('.');
        let domainBuffer = Buffer.alloc(domain.length + 2);
        let offset = 0;
        for (const part of parts) {
            domainBuffer[offset] = part.length;
            domainBuffer.write(part, offset + 1);
            offset += part.length + 1;
        }
        domainBuffer[offset] = 0;

        // Query type (A) and class (IN)
        const footer = Buffer.from([0x00, 0x01, 0x00, 0x01]);

        return Buffer.concat([header, domainBuffer, footer]);
    }

    async simulateTrafficBurst(pattern: any, count: number) {
        const promises = [];
        for (let i = 0; i < count; i++) {
            // Randomly choose between protocols
            const protocol = Math.random();
            if (protocol < 0.4) {
                promises.push(this.simulateHttpTraffic(pattern));
            } else if (protocol < 0.7) {
                promises.push(this.simulateDnsTraffic(pattern));
            } else {
                promises.push(this.simulateSmtpTraffic(pattern));
            }
        }
        await Promise.all(promises);
    }

    async start(duration: number = 60, patternType: 'normal' | 'suspicious' | 'attack' = 'normal') {
        const pattern = patterns[patternType];
        const startTime = Date.now();
        
        console.log(`Starting ${patternType} traffic simulation for ${duration} seconds...`);

        while (Date.now() - startTime < duration * 1000) {
            if (Math.random() < pattern.burstProbability) {
                // Simulate a burst of 5-15 requests
                const burstSize = Math.floor(Math.random() * 10) + 5;
                await this.simulateTrafficBurst(pattern, burstSize);
            } else {
                // Single request
                const protocol = Math.random();
                if (protocol < 0.4) {
                    await this.simulateHttpTraffic(pattern);
                } else if (protocol < 0.7) {
                    await this.simulateDnsTraffic(pattern);
                } else {
                    await this.simulateSmtpTraffic(pattern);
                }
            }

            // Random delay between requests
            const delay = Math.random() * (pattern.maxDelay - pattern.minDelay) + pattern.minDelay;
            await sleep(delay);
        }
    }

    cleanup() {
        this.dnsClient.close();
        this.smtpClient.close();
    }
}

// Start simulation
const args = process.argv.slice(2);
const duration = parseInt(args[0]) || 60;
const patternType = (args[1] as 'normal' | 'suspicious' | 'attack') || 'normal';

const simulator = new TrafficSimulator();
simulator.start(duration, patternType)
    .catch(console.error)
    .finally(() => simulator.cleanup());
