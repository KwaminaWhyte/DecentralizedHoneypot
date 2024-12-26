import { SMTPServer } from 'smtp-server';
import { TrafficLogModel } from '../models/TrafficLog';
import { AttackPredictor } from '../services/ai/predictor';
import { AlertService } from '../services/alerts/alertService';
import { RateLimiter } from '../services/traffic/rateLimiter';
import config from '../config';

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
        const sourceIp = session.remoteAddress;

        // Check if IP is blocked
        if (this.blockedIPs.has(sourceIp)) {
            return callback(new Error('Access Denied'));
        }

        // Check rate limit
        if (this.rateLimiter.isRateLimited(sourceIp)) {
            return callback(new Error('Too Many Requests'));
        }

        try {
            await this.logConnection(session);
            callback(); // Accept the connection
        } catch (error) {
            console.error('Error handling SMTP connection:', error);
            callback(new Error('Error processing connection'));
        }
    }

    private async handleMailFrom(from: any, session: any, callback: Function) {
        try {
            await this.logMailFrom(from, session);
            
            // Random delay to simulate processing
            setTimeout(() => {
                callback(); // Accept the sender
            }, Math.random() * 1000);
        } catch (error) {
            console.error('Error handling MAIL FROM:', error);
            callback(new Error('Error processing sender'));
        }
    }

    private async handleRcptTo(to: any, session: any, callback: Function) {
        try {
            await this.logRcptTo(to, session);
            
            // Randomly reject some recipients to appear more realistic
            if (Math.random() < 0.2) {
                return callback(new Error('User not found'));
            }
            
            callback(); // Accept the recipient
        } catch (error) {
            console.error('Error handling RCPT TO:', error);
            callback(new Error('Error processing recipient'));
        }
    }

    private async handleData(stream: any, session: any, callback: Function) {
        let messageData = '';
        
        stream.on('data', (chunk: Buffer) => {
            messageData += chunk;
        });

        stream.on('end', async () => {
            try {
                await this.logMessageData(messageData, session);
                
                // Analyze recent traffic for potential attacks
                const sourceIp = session.remoteAddress;
                const recentTraffic = await TrafficLogModel.find({
                    sourceIp,
                    protocol: 'SMTP',
                    timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
                }).sort({ timestamp: -1 }).limit(100);

                if (recentTraffic.length > 10) {
                    const classification = await this.predictor.predictAttack(recentTraffic);
                    
                    if (classification.confidence > 0.7) {
                        await this.alertService.raiseAlert({
                            sourceIp,
                            protocol: 'SMTP',
                            attackType: classification.attackType,
                            confidence: classification.confidence,
                            details: classification.details.indicators || [],
                            metrics: {
                                requestCount: recentTraffic.length,
                                burstCount: classification.details.burstCount || 0,
                                averageInterval: classification.details.avgInterval || 0
                            }
                        });
                    }
                }

                // Randomly generate different responses
                const responses = [
                    { success: true, message: 'Message queued for delivery' },
                    { success: false, message: 'Temporary failure, please try again later' },
                    { success: false, message: 'Mailbox full' },
                    { success: false, message: 'Service temporarily unavailable' }
                ];

                const response = responses[Math.floor(Math.random() * responses.length)];
                
                if (response.success) {
                    callback(null, 'Message accepted');
                } else {
                    callback(new Error(response.message));
                }
            } catch (error) {
                console.error('Error handling message data:', error);
                callback(new Error('Error processing message'));
            }
        });
    }

    private async logConnection(session: any) {
        const trafficLog = {
            sourceIp: session.remoteAddress,
            timestamp: new Date(),
            protocol: 'SMTP' as const,
            requestData: {
                method: 'CONNECT',
                headers: session.openingCommand || {},
                payload: {
                    clientHostname: session.clientHostname,
                    transmissionType: session.transmissionType
                }
            }
        };

        await TrafficLogModel.create(trafficLog);
        console.log(`SMTP Connection from ${trafficLog.sourceIp}`);
    }

    private async logMailFrom(from: any, session: any) {
        const trafficLog = {
            sourceIp: session.remoteAddress,
            timestamp: new Date(),
            protocol: 'SMTP' as const,
            requestData: {
                method: 'MAIL FROM',
                headers: {},
                payload: {
                    from: from.address,
                    args: from.args
                }
            }
        };

        await TrafficLogModel.create(trafficLog);
    }

    private async logRcptTo(to: any, session: any) {
        const trafficLog = {
            sourceIp: session.remoteAddress,
            timestamp: new Date(),
            protocol: 'SMTP' as const,
            requestData: {
                method: 'RCPT TO',
                headers: {},
                payload: {
                    to: to.address,
                    args: to.args
                }
            }
        };

        await TrafficLogModel.create(trafficLog);
    }

    private async logMessageData(data: string, session: any) {
        const trafficLog = {
            sourceIp: session.remoteAddress,
            timestamp: new Date(),
            protocol: 'SMTP' as const,
            requestData: {
                method: 'DATA',
                headers: {},
                payload: {
                    size: data.length,
                    // Store only metadata, not actual content for security
                    metadata: {
                        hasAttachments: data.includes('Content-Disposition: attachment'),
                        contentType: data.match(/Content-Type: ([^\r\n]+)/)?.[1] || 'unknown'
                    }
                }
            }
        };

        await TrafficLogModel.create(trafficLog);
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
