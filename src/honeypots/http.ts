import { Elysia } from 'elysia';
import { TrafficLogModel } from '../models/TrafficLog';
import { AttackPredictor } from '../services/ai/predictor';
import { AlertService } from '../services/alerts/alertService';
import { RateLimiter } from '../services/traffic/rateLimiter';
import config from '../config';

export class HttpHoneypot {
    private app: Elysia;
    private predictor: AttackPredictor;
    private alertService: AlertService;
    private rateLimiter: RateLimiter;
    private blockedIPs: Set<string>;

    constructor() {
        this.predictor = AttackPredictor.getInstance();
        this.alertService = AlertService.getInstance();
        this.rateLimiter = RateLimiter.getInstance();
        this.blockedIPs = new Set();

        this.app = new Elysia()
            .onRequest(this.logRequest.bind(this))
            .get('*', this.handleRequest.bind(this))
            .post('*', this.handleRequest.bind(this))
            .put('*', this.handleRequest.bind(this))
            .delete('*', this.handleRequest.bind(this));

        // Subscribe to attack alerts
        this.alertService.subscribe(this.handleAlert.bind(this));
    }

    private async handleAlert(alert: any) {
        if (alert.protocol === 'HTTP' && alert.confidence > 0.8) {
            this.blockedIPs.add(alert.sourceIp);
            console.log(`🚫 Blocking IP ${alert.sourceIp} due to detected ${alert.attackType}`);
        }
    }

    private async logRequest(context: any) {
        const sourceIp = context.request.headers.get('x-forwarded-for') || 
                     context.request.headers.get('x-real-ip') || 
                     context.request.headers.get('cf-connecting-ip') ||
                     context.request.socket?.remoteAddress || '0.0.0.0';

        // Check if IP is blocked
        if (this.blockedIPs.has(sourceIp)) {
            return new Response(JSON.stringify({ error: 'Access Denied' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Check rate limit
        if (this.rateLimiter.isRateLimited(sourceIp)) {
            return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const trafficLog = {
            sourceIp,
            timestamp: new Date(),
            protocol: 'HTTP' as const,
            requestData: {
                method: context.request.method,
                path: new URL(context.request.url).pathname,
                headers: Object.fromEntries(context.request.headers.entries()),
                payload: context.body
            }
        };

        try {
            await TrafficLogModel.create(trafficLog);
            console.log(`HTTP Request logged from ${trafficLog.sourceIp}: ${trafficLog.requestData.method} ${trafficLog.requestData.path}`);
        } catch (error) {
            console.error('Error logging HTTP request:', error);
        }
    }

    private async handleRequest(context: any) {
        try {
            const sourceIp = context.request.headers.get('x-forwarded-for') || 
                           context.request.headers.get('x-real-ip') || 
                           context.request.headers.get('cf-connecting-ip') ||
                           context.request.socket?.remoteAddress || '0.0.0.0';

            const recentTraffic = await TrafficLogModel.find({
                sourceIp,
                protocol: 'HTTP',
                timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
            }).sort({ timestamp: -1 }).limit(100);

            // Analyze for potential attacks if we have enough traffic
            if (recentTraffic.length > 10) {
                try {
                    const classification = await this.predictor.predictAttack(recentTraffic);
                    
                    if (classification.confidence > 0.7) {
                        // Raise an alert
                        await this.alertService.raiseAlert({
                            sourceIp,
                            protocol: 'HTTP',
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
                } catch (error) {
                    console.error('Error analyzing traffic:', error);
                }
            }

            // Return random responses to keep attacker engaged
            const responses = [
                { status: 200, body: { message: 'Success', data: { id: Math.random() } } },
                { status: 503, body: { error: 'Service Temporarily Unavailable' } },
                { status: 429, body: { error: 'Too Many Requests' } },
                { status: 403, body: { error: 'Forbidden' } }
            ];

            const response = responses[Math.floor(Math.random() * responses.length)];
            return new Response(JSON.stringify(response.body), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Error handling request:', error);
            return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    async start() {
        await this.app.listen(config.honeypots.http.port);
        console.log(`HTTP Honeypot listening on port ${config.honeypots.http.port}`);
    }
}
