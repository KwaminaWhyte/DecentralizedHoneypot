import { createSocket, Socket, RemoteInfo } from 'dgram';
import { TrafficLogModel } from '../models/TrafficLog';
import { AttackPredictor } from '../services/ai/predictor';
import config from '../config';

export class DnsHoneypot {
    private server: Socket;
    private predictor: AttackPredictor;

    constructor() {
        this.server = createSocket('udp4');
        this.predictor = AttackPredictor.getInstance();
        this.setupEventHandlers();
    }

    private setupEventHandlers() {
        this.server.on('error', (err) => {
            console.error('DNS Honeypot error:', err);
            this.server.close();
        });

        this.server.on('message', this.handleDnsQuery.bind(this));

        this.server.on('listening', () => {
            const address = this.server.address();
            console.log(`DNS Honeypot listening on port ${address.port}`);
        });
    }

    private async handleDnsQuery(msg: Buffer, rinfo: RemoteInfo) {
        const trafficLog = {
            sourceIp: rinfo.address,
            timestamp: new Date(),
            protocol: 'DNS' as const,
            requestData: {
                payload: msg.toString('hex'),
                size: rinfo.size,
            }
        };

        // Log the traffic
        await TrafficLogModel.create(trafficLog);

        // Get recent traffic from this IP for analysis
        const recentTraffic = await TrafficLogModel.find({
            sourceIp: rinfo.address,
            protocol: 'DNS',
            timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        }).sort({ timestamp: -1 }).limit(100);

        // Analyze for potential attacks
        if (recentTraffic.length > 10) {
            try {
                const classification = await this.predictor.predictAttack(recentTraffic);
                console.log('Attack classification:', classification);
                // TODO: Implement attack response strategy based on classification
            } catch (error) {
                console.error('Error analyzing DNS traffic:', error);
            }
        }

        // Send a random response to keep the attacker engaged
        const response = Buffer.from(this.generateRandomDnsResponse());
        this.server.send(response, rinfo.port, rinfo.address);
    }

    private generateRandomDnsResponse(): string {
        // Generate a random IP address
        const ip = Array(4).fill(0).map(() => Math.floor(Math.random() * 256)).join('.');
        // Simple DNS response format (hex)
        return `81800001000100000000047465737404636f6d0000010001c00c000100010000003c0004${ip.split('.').map(n => parseInt(n).toString(16).padStart(2, '0')).join('')}`;
    }

    async start() {
        return new Promise<void>((resolve, reject) => {
            this.server.bind(config.honeypots.dns.port, () => {
                console.log(`DNS Honeypot started on port ${config.honeypots.dns.port}`);
                resolve();
            });
        });
    }

    async stop() {
        return new Promise<void>((resolve) => {
            this.server.close(() => {
                console.log('DNS Honeypot stopped');
                resolve();
            });
        });
    }
}
