import { createSocket, Socket } from 'dgram';
import { BaseHoneypot } from './base';
import config from '../config';
import type { TrafficData } from '../types';

export class DNSHoneypot extends BaseHoneypot {
    private server: Socket;
    private queryTypes: Map<string, number>;
    private predictor: any;
    private alertService: any;
    private blockedIPs: Set<string>;

    constructor() {
        super('dns');
        this.server = createSocket('udp4');
        this.queryTypes = new Map();
        this.predictor = new Predictor(); // Initialize predictor
        this.alertService = new AlertService(); // Initialize alert service
        this.blockedIPs = new Set(); // Initialize blocked IPs set
        this.setupServer();
    }

    private setupServer() {
        this.server.on('error', (err) => {
            console.error(`DNS Honeypot error:\n${err.stack}`);
            this.server.close();
        });

        this.server.on('message', (msg, rinfo) => {
            this.handleQuery(msg, rinfo);
        });

        this.server.on('listening', () => {
            const address = this.server.address();
            console.log(`DNS Honeypot started on port ${address.port}`);
        });
    }

    private handleQuery(msg: Buffer, rinfo: any) {
        try {
            const queryType = this.parseQueryType(msg);
            this.updateQueryTypes(queryType);

            const data: TrafficData = {
                protocol: 'dns',
                requestCount: 1,
                timeWindow: 60000,
                uniqueIps: new Set([rinfo.address]),
                sourceIp: rinfo.address,
                timestamp: Date.now(),
                queryType,
                querySize: msg.length,
                port: rinfo.port
            };

            this.logTraffic(data);

            // Real-time attack prediction
            this.predictor.predict(data).then(prediction => {
                if (prediction.confidence > 0.85) {
                    this.alertService.emit('attack', {
                        type: prediction.attackType,
                        confidence: prediction.confidence,
                        sourceIp: rinfo.address,
                        timestamp: new Date(),
                        details: {
                            queryType,
                            querySize: msg.length,
                            port: rinfo.port
                        }
                    });

                    if (prediction.attackType === 'dns_amplification') {
                        this.blockedIPs.add(rinfo.address);
                        return;
                    }
                }
            });

            // Enhanced response generation
            const response = this.createDNSResponse(msg, queryType);
            this.server.send(response, rinfo.port, rinfo.address);

        } catch (error) {
            console.error('Error handling DNS query:', error);
        }
    }

    private createDNSResponse(query: Buffer, queryType: string): Buffer {
        const response = Buffer.alloc(query.length + 16); // Additional space for response
        query.copy(response); // Copy query to response

        // Set response bit and response code
        response[2] |= 0x80; // Set QR bit to 1 (response)
        response[3] = 0x00; // No error

        // Add answer section based on query type
        const answers = {
            'A': Buffer.from([0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04, 0x0a, 0x00, 0x00, 0x01]),
            'AAAA': Buffer.from([0xc0, 0x0c, 0x00, 0x1c, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x10, 0x20, 0x01, 0x0d, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]),
            'MX': Buffer.from([0xc0, 0x0c, 0x00, 0x0f, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04, 0x00, 0x0a, 0xc0, 0x0c]),
            'TXT': Buffer.from([0xc0, 0x0c, 0x00, 0x10, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x05, 0x04, 0x74, 0x65, 0x73, 0x74])
        };

        const answer = answers[queryType] || answers['A'];
        answer.copy(response, query.length);

        // Update answer count in header
        response[7] = 0x01; // One answer

        return response;
    }

    private updateQueryTypes(queryType: string) {
        const count = this.queryTypes.get(queryType) || 0;
        this.queryTypes.set(queryType, count + 1);

        // Log query type distribution periodically
        if (this.queryTypes.size > 0 && count % 100 === 0) {
            console.log('DNS Query Type Distribution:');
            for (const [type, count] of this.queryTypes.entries()) {
                console.log(`${type}: ${count}`);
            }
        }
    }

    private parseQueryType(msg: Buffer): string {
        // Basic DNS query type parsing
        // Skip header (12 bytes) and name
        let offset = 12;
        while (msg[offset] !== 0) offset++;
        offset++; // Skip the terminating zero
        
        // Get query type (2 bytes after name)
        const queryType = msg.readUInt16BE(offset);
        return this.getQueryTypeName(queryType);
    }

    private getQueryTypeName(type: number): string {
        const types: { [key: number]: string } = {
            1: 'A',
            2: 'NS',
            5: 'CNAME',
            6: 'SOA',
            12: 'PTR',
            15: 'MX',
            16: 'TXT',
            28: 'AAAA',
            255: 'ANY'
        };
        return types[type] || 'UNKNOWN';
    }

    start() {
        const port = config.honeypots.dns.port;
        this.server.bind(port);
        console.log(`🕸️ DNS Honeypot is running at port ${port}`);
    }

    stop() {
        return new Promise<void>((resolve) => {
            this.server.close(() => {
                console.log('DNS Honeypot stopped');
                resolve();
            });
        });
    }
}

class Predictor {
    predict(data: TrafficData): Promise<any> {
        // Implement prediction logic here
        return Promise.resolve({ confidence: 0.5, attackType: 'dns_amplification' });
    }
}

class AlertService {
    emit(event: string, data: any): void {
        // Implement alert service logic here
        console.log(`Alert: ${event} - ${JSON.stringify(data)}`);
    }
}
