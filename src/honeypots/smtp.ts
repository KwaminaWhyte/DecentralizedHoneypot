import { SMTPServer } from 'smtp-server';
import { TrafficLogModel } from '../models/TrafficLog';
import { AttackPredictor } from '../services/ai/predictor';
import { AlertService } from '../services/alerts/alertService';
import { RateLimiter } from '../services/traffic/rateLimiter';
import config from '../config';

interface TrafficData {
    protocol: string;
    requestCount: number;
    timeWindow: number;
    uniqueIps: Set<string>;
    sourceIp: string;
    timestamp: number;
    connectionCount: number;
    authAttempts: number;
    mailFrom: string;
    rcptTo: string[];
    messageSize?: number;
}

export class SmtpHoneypot {
    private server: SMTPServer;
    private predictor: AttackPredictor;
    private alertService: AlertService;
    private rateLimiter: RateLimiter;
    private blockedIPs: Set<string>;

    constructor() {
        this.predictor = AttackPredictor.getInstance();
        this.alertService = AlertService.getInstance();
        this.rateLimiter = RateLimiter.getInstance();
        this.blockedIPs = new Set();

        this.server = new SMTPServer({
            secure: false,
            disabledCommands: ['STARTTLS'], // Prevent encryption to capture all traffic
            size: 1024 * 1024, // 1MB max message size
            onConnect: this.handleConnection.bind(this),
            onMailFrom: this.handleMailFrom.bind(this),
            onRcptTo: this.handleRcptTo.bind(this),
            onData: this.handleData.bind(this),
            authOptional: true
        });

        // Subscribe to attack alerts
        this.alertService.subscribe(this.handleAlert.bind(this));
    }

    private async handleAlert(alert: any) {
        if (alert.protocol === 'SMTP' && alert.confidence > 0.8) {
            this.blockedIPs.add(alert.sourceIp);
            console.log(`🚫 Blocking IP ${alert.sourceIp} due to detected ${alert.attackType}`);
        }
    }

    private async handleConnection(session: any, callback: Function) {
        const ip = session.remoteAddress;

        if (this.blockedIPs.has(ip)) {
            return callback(new Error('Connection refused'));
        }

        // Enhanced rate limiting
        const rateLimit = await this.rateLimiter.checkLimit(ip, {
            windowMs: 60000,
            maxRequests: 50,
            burstAllowance: 10,
            burstDuration: 5000
        });

        if (!rateLimit.allowed) {
            this.blockedIPs.add(ip);
            setTimeout(() => this.blockedIPs.delete(ip), 300000); // 5-minute block
            return callback(new Error('Too many connections'));
        }

        const data: TrafficData = {
            protocol: 'smtp',
            requestCount: 1,
            timeWindow: 60000,
            uniqueIps: new Set([ip]),
            sourceIp: ip,
            timestamp: Date.now(),
            connectionCount: 1,
            authAttempts: 0,
            mailFrom: '',
            rcptTo: []
        };

        this.logTraffic(data);
        callback();
    }

    private async handleMailFrom(address: string, session: any, callback: Function) {
        const ip = session.remoteAddress;
        
        // Update traffic data
        const data: TrafficData = {
            protocol: 'smtp',
            requestCount: 1,
            timeWindow: 60000,
            uniqueIps: new Set([ip]),
            sourceIp: ip,
            timestamp: Date.now(),
            mailFrom: address,
            rcptTo: [],
            authAttempts: session.authAttempts || 0
        };

        this.logTraffic(data);

        // Check for spam patterns
        if (this.isSpamPattern(address)) {
            this.alertService.emit('attack', {
                type: 'spam',
                confidence: 0.9,
                sourceIp: ip,
                timestamp: new Date(),
                details: {
                    mailFrom: address,
                    indicators: ['suspicious_sender']
                }
            });
            return callback(new Error('Sender rejected'));
        }

        callback();
    }

    private async handleRcptTo(address: string, session: any, callback: Function) {
        const ip = session.remoteAddress;
        
        // Update traffic data with recipient
        const data: TrafficData = {
            protocol: 'smtp',
            requestCount: 1,
            timeWindow: 60000,
            uniqueIps: new Set([ip]),
            sourceIp: ip,
            timestamp: Date.now(),
            mailFrom: session.envelope.mailFrom?.address || '',
            rcptTo: [address],
            authAttempts: session.authAttempts || 0
        };

        this.logTraffic(data);

        // Check for recipient harvesting
        if (this.isHarvestingAttempt(session)) {
            this.alertService.emit('attack', {
                type: 'harvesting',
                confidence: 0.95,
                sourceIp: ip,
                timestamp: new Date(),
                details: {
                    rcptCount: session.rcptCount || 0,
                    timeframe: Date.now() - (session.startTime || Date.now())
                }
            });
            return callback(new Error('Recipient rejected'));
        }

        callback();
    }

    private async handleData(stream: any, session: any, callback: Function) {
        const ip = session.remoteAddress;
        let messageSize = 0;
        let chunks: Buffer[] = [];

        stream.on('data', (chunk: Buffer) => {
            messageSize += chunk.length;
            chunks.push(chunk);

            // Check for message size limits
            if (messageSize > 1024 * 1024) { // 1MB limit
                stream.emit('error', new Error('Message too large'));
            }
        });

        stream.on('end', async () => {
            const message = Buffer.concat(chunks).toString();
            
            // Update traffic data with message details
            const data: TrafficData = {
                protocol: 'smtp',
                requestCount: 1,
                timeWindow: 60000,
                uniqueIps: new Set([ip]),
                sourceIp: ip,
                timestamp: Date.now(),
                mailFrom: session.envelope.mailFrom?.address || '',
                rcptTo: session.envelope.rcptTo?.map((r: any) => r.address) || [],
                messageSize,
                authAttempts: session.authAttempts || 0
            };

            this.logTraffic(data);

            // Analyze message for attacks
            const prediction = await this.predictor.predict(data);
            
            if (prediction.confidence > 0.85) {
                this.alertService.emit('attack', {
                    type: prediction.attackType,
                    confidence: prediction.confidence,
                    sourceIp: ip,
                    timestamp: new Date(),
                    details: {
                        messageSize,
                        mailFrom: session.envelope.mailFrom?.address,
                        rcptCount: session.envelope.rcptTo?.length,
                        headers: this.extractHeaders(message)
                    }
                });

                if (prediction.attackType === 'spam' || prediction.attackType === 'malware') {
                    this.blockedIPs.add(ip);
                    return callback(new Error('Message rejected'));
                }
            }

            callback();
        });
    }

    private isSpamPattern(address: string): boolean {
        const spamPatterns = [
            /^(?!.*@(?:gmail|yahoo|hotmail|outlook)\.com$).+@.+$/i, // Non-standard domains
            /\d{6,}@/i, // Many numbers in local part
            /[a-z0-9]{12,}@/i // Very long local part
        ];

        return spamPatterns.some(pattern => pattern.test(address));
    }

    private isHarvestingAttempt(session: any): boolean {
        const rcptCount = session.rcptCount || 0;
        const timeframe = Date.now() - (session.startTime || Date.now());
        
        // More than 10 recipients in less than 1 minute
        return rcptCount > 10 && timeframe < 60000;
    }

    private extractHeaders(message: string): Record<string, string> {
        const headers: Record<string, string> = {};
        const headerSection = message.split('\r\n\r\n')[0];
        
        headerSection.split('\r\n').forEach(line => {
            const [key, ...values] = line.split(':');
            if (key && values.length) {
                headers[key.trim().toLowerCase()] = values.join(':').trim();
            }
        });

        return headers;
    }

    private async logTraffic(data: TrafficData) {
        await TrafficLogModel.create(data);
    }

    async start() {
        return new Promise<void>((resolve, reject) => {
            this.server.listen(config.honeypots.smtp.port, () => {
                console.log(`SMTP Honeypot listening on port ${config.honeypots.smtp.port}`);
                resolve();
            });

            this.server.on('error', (err) => {
                console.error('SMTP Server error:', err);
                reject(err);
            });
        });
    }

    async stop() {
        return new Promise<void>((resolve) => {
            this.server.close(() => {
                console.log('SMTP Honeypot stopped');
                resolve();
            });
        });
    }
}
