import { createSocket, Socket } from 'dgram';
import { BaseHoneypot } from './base';
import config from '../config';
import type { TrafficData } from '../types';

export class DNSHoneypot extends BaseHoneypot {
    private server: Socket;
    private queryTypes: Map<string, number>;

    constructor() {
        super('dns');
        this.server = createSocket('udp4');
        this.queryTypes = new Map();
        this.setupServer();
    }

    private setupServer() {
        this.server.on('error', (err) => {
            console.error(`DNS Honeypot error:\n${err.stack}`);
            this.server.close();
        });

        this.server.on('message', (msg, rinfo) => {
            try {
                const queryType = this.parseQueryType(msg);
                this.updateQueryTypes(queryType);
                
                // Log traffic
                const trafficData: TrafficData = {
                    protocol: 'dns',
                    requestCount: 1,
                    timeWindow: 60000, // 1 minute window
                    uniqueIps: new Set([rinfo.address]),
                    queryTypes: Array.from(this.queryTypes.keys()),
                    sourceIp: rinfo.address,
                    timestamp: Date.now()
                };

                this.logTraffic(trafficData);

                // Send a simulated response
                const response = this.createDNSResponse(msg);
                this.server.send(response, rinfo.port, rinfo.address);
            } catch (error) {
                console.error('Error handling DNS query:', error);
            }
        });

        this.server.on('listening', () => {
            const address = this.server.address();
            console.log(`DNS Honeypot started on port ${address.port}`);
        });
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

    private updateQueryTypes(queryType: string) {
        const count = this.queryTypes.get(queryType) || 0;
        this.queryTypes.set(queryType, count + 1);
    }

    private createDNSResponse(query: Buffer): Buffer {
        // Basic DNS response
        const response = Buffer.alloc(query.length + 16);
        
        // Copy query to response
        query.copy(response);
        
        // Modify header flags (response, authoritative)
        response[2] = 0x84; // Response + Authoritative
        response[3] = 0x00; // No error
        
        // Set answer count to 1
        response.writeUInt16BE(1, 6);
        
        // Add a simple A record response
        const answerOffset = query.length;
        response.writeUInt16BE(0xc00c, answerOffset); // Name pointer
        response.writeUInt16BE(0x0001, answerOffset + 2); // Type A
        response.writeUInt16BE(0x0001, answerOffset + 4); // Class IN
        response.writeUInt32BE(300, answerOffset + 6); // TTL 300s
        response.writeUInt16BE(4, answerOffset + 10); // Data length
        response.writeUInt32BE(0x0a000001, answerOffset + 12); // IP 10.0.0.1

        return response;
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
