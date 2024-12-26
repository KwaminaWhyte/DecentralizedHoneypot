import { Elysia } from "elysia";
import { connectDB } from './services/db';
import { HttpHoneypot } from './honeypots/http';
import { DnsHoneypot } from './honeypots/dns';
import { SmtpHoneypot } from './honeypots/smtp';
import { TrafficAnalyzer } from './services/traffic/analyzer';
import { RateLimiter } from './services/traffic/rateLimiter';
import { AlertService } from './services/alerts/alertService';
import config from './config';

async function main() {
    // Connect to MongoDB
    await connectDB();

    // Initialize services
    const trafficAnalyzer = TrafficAnalyzer.getInstance();
    const rateLimiter = RateLimiter.getInstance();
    const alertService = AlertService.getInstance();

    // Start honeypots
    const httpHoneypot = new HttpHoneypot();
    const dnsHoneypot = new DnsHoneypot();
    const smtpHoneypot = new SmtpHoneypot();

    await Promise.all([
        httpHoneypot.start(),
        dnsHoneypot.start(),
        smtpHoneypot.start()
    ]);

    // Start main API server
    const app = new Elysia()
        .get("/health", () => ({ status: "ok" }))
        .get("/metrics", async () => {
            // Get metrics for all protocols
            const [httpMetrics, dnsMetrics, smtpMetrics] = await Promise.all([
                trafficAnalyzer.getMetricsForTimeWindow('HTTP'),
                trafficAnalyzer.getMetricsForTimeWindow('DNS'),
                trafficAnalyzer.getMetricsForTimeWindow('SMTP')
            ]);
            
            return {
                http: httpMetrics,
                dns: dnsMetrics,
                smtp: smtpMetrics,
                timestamp: new Date(),
                summary: {
                    totalRequests: httpMetrics.requestCount + dnsMetrics.requestCount + smtpMetrics.requestCount,
                    uniqueIPs: new Set([
                        ...httpMetrics.recentRequests.map(r => r.sourceIp),
                        ...dnsMetrics.recentRequests.map(r => r.sourceIp),
                        ...smtpMetrics.recentRequests.map(r => r.sourceIp)
                    ]).size,
                    timeWindowMinutes: 5
                }
            };
        })
        .get("/alerts", () => {
            const activeAlerts = alertService.getActiveAlerts();
            return {
                alerts: activeAlerts,
                count: activeAlerts.length,
                timestamp: new Date()
            };
        })
        .listen(config.port);

    // Subscribe to alerts for console logging
    alertService.subscribe((alert) => {
        console.log('\n🚨 ATTACK DETECTED!');
        console.log(`Type: ${alert.attackType}`);
        console.log(`Source IP: ${alert.sourceIp}`);
        console.log(`Protocol: ${alert.protocol}`);
        console.log(`Confidence: ${(alert.confidence * 100).toFixed(1)}%`);
        console.log('Details:');
        alert.details.forEach(detail => console.log(`- ${detail}`));
        console.log('\n');
    });

    console.log(
        `🦊 Main API is running at ${app.server?.hostname}:${app.server?.port}\n` +
        `🍯 HTTP Honeypot is running at port ${config.honeypots.http.port}\n` +
        `🕸️ DNS Honeypot is running at port ${config.honeypots.dns.port}\n` +
        `📧 SMTP Honeypot is running at port ${config.honeypots.smtp.port}`
    );

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('Received SIGTERM. Shutting down gracefully...');
        await Promise.all([
            dnsHoneypot.stop(),
            smtpHoneypot.stop()
        ]);
        process.exit(0);
    });
}

main().catch(console.error);
