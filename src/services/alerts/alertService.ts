import { EventEmitter } from 'events';
import type { AttackAlert } from '../../types';

export class AlertService {
    private static instance: AlertService;
    private eventEmitter: EventEmitter;
    private activeAlerts: Map<string, AttackAlert>;
    private readonly ALERT_COOLDOWN = 60 * 1000; // 1 minute cooldown between similar alerts

    private constructor() {
        this.eventEmitter = new EventEmitter();
        this.activeAlerts = new Map();
    }

    public static getInstance(): AlertService {
        if (!AlertService.instance) {
            AlertService.instance = new AlertService();
        }
        return AlertService.instance;
    }

    public subscribe(callback: (alert: AttackAlert) => void) {
        this.eventEmitter.on('attack-alert', callback);
    }

    public unsubscribe(callback: (alert: AttackAlert) => void) {
        this.eventEmitter.off('attack-alert', callback);
    }

    public async raiseAlert(alert: Omit<AttackAlert, 'id' | 'timestamp'>) {
        const alertKey = `${alert.sourceIp}-${alert.protocol}-${alert.attackType}`;
        const existingAlert = this.activeAlerts.get(alertKey);

        // Check if we should suppress this alert
        if (existingAlert && 
            Date.now() - existingAlert.timestamp.getTime() < this.ALERT_COOLDOWN) {
            return;
        }

        const fullAlert: AttackAlert = {
            id: this.generateAlertId(),
            timestamp: new Date(),
            status: 'active',
            ...alert
        };

        // Store the alert
        this.activeAlerts.set(alertKey, fullAlert);

        // Emit the alert
        this.eventEmitter.emit('attack-alert', fullAlert);

        // Clean up old alerts
        this.cleanupOldAlerts();
    }

    private generateAlertId(): string {
        return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private cleanupOldAlerts() {
        const now = Date.now();
        for (const [key, alert] of this.activeAlerts.entries()) {
            if (now - alert.timestamp.getTime() > this.ALERT_COOLDOWN) {
                this.activeAlerts.delete(key);
            }
        }
    }

    public getActiveAlerts(): AttackAlert[] {
        return Array.from(this.activeAlerts.values());
    }
}
