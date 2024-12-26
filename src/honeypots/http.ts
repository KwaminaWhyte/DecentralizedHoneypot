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
        const ip = context.request.headers['x-forwarded-for'] || context.request.ip;
        
        if (this.blockedIPs.has(ip)) {
            return new Response('Access Denied', { status: 403 });
        }

        // Enhanced rate limiting with burst allowance
        const rateLimit = await this.rateLimiter.checkLimit(ip, {
            windowMs: 60000,
            maxRequests: 100,
            burstAllowance: 20,
            burstDuration: 5000
        });

        if (!rateLimit.allowed) {
            this.blockedIPs.add(ip);
            setTimeout(() => this.blockedIPs.delete(ip), 300000); // 5-minute block
            return new Response('Rate limit exceeded', { status: 429 });
        }

        // Enhanced traffic logging with path analysis
        const path = new URL(context.request.url).pathname;
        const data: TrafficData = {
            protocol: 'http',
            requestCount: 1,
            timeWindow: 60000,
            uniqueIps: new Set([ip]),
            paths: [path],
            sourceIp: ip,
            timestamp: Date.now(),
            headers: Object.fromEntries(context.request.headers.entries()),
            method: context.request.method,
            queryParams: Object.fromEntries(new URL(context.request.url).searchParams),
            payloadSize: parseInt(context.request.headers['content-length'] || '0')
        };

        this.logTraffic(data);

        // Real-time attack prediction
        const prediction = await this.predictor.predict(data);
        
        if (prediction.confidence > 0.85) {
            this.alertService.emit('attack', {
                type: prediction.attackType,
                confidence: prediction.confidence,
                sourceIp: ip,
                timestamp: new Date(),
                details: {
                    path,
                    method: context.request.method,
                    headers: data.headers,
                    queryParams: data.queryParams
                }
            });

            if (prediction.attackType === 'ddos') {
                this.blockedIPs.add(ip);
                return new Response('Access Denied', { status: 403 });
            }
        }

        // Generate realistic response
        return this.generateResponse(path);
    }

    private generateResponse(path: string): Response {
        // Enhanced response generation based on path
        const responses = {
            '/': {
                status: 200,
                body: '<html><body><h1>Welcome</h1></body></html>',
                headers: { 'Content-Type': 'text/html' }
            },
            '/api': {
                status: 200,
                body: JSON.stringify({ status: 'ok' }),
                headers: { 'Content-Type': 'application/json' }
            },
            '/admin': {
                status: 401,
                body: 'Unauthorized',
                headers: { 'WWW-Authenticate': 'Basic' }
            }
        };

        const defaultResponse = {
            status: 404,
            body: 'Not Found',
            headers: { 'Content-Type': 'text/plain' }
        };

        const response = responses[path] || defaultResponse;
        return new Response(response.body, {
            status: response.status,
            headers: {
                ...response.headers,
                'Server': 'Apache/2.4.41 (Unix)',
                'X-Powered-By': 'PHP/7.4.3',
                'Date': new Date().toUTCString()
            }
        });
    }

    private async logTraffic(data: TrafficData) {
        try {
            await TrafficLogModel.create(data);
            console.log(`HTTP Request logged from ${data.sourceIp}: ${data.method} ${data.paths[0]}`);
        } catch (error) {
            console.error('Error logging HTTP request:', error);
        }
    }

    async start() {
        await this.app.listen(config.honeypots.http.port);
        console.log(`HTTP Honeypot listening on port ${config.honeypots.http.port}`);
    }
}

interface TrafficData {
    protocol: string;
    requestCount: number;
    timeWindow: number;
    uniqueIps: Set<string>;
    paths: string[];
    sourceIp: string;
    timestamp: number;
    headers: { [key: string]: string };
    method: string;
    queryParams: { [key: string]: string };
    payloadSize: number;
}
