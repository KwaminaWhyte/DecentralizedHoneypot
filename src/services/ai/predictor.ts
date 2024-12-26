import type { TrafficLog, AttackClassification } from '../../types';
import config from '../../config';

export class AttackPredictor {
    private static instance: AttackPredictor;

    private constructor() {}

    public static getInstance(): AttackPredictor {
        if (!AttackPredictor.instance) {
            AttackPredictor.instance = new AttackPredictor();
        }
        return AttackPredictor.instance;
    }

    async predictAttack(trafficLogs: TrafficLog[]): Promise<AttackClassification> {
        try {
            const response = await fetch(config.ai.predictionEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ trafficLogs }),
            });

            if (!response.ok) {
                throw new Error(`AI prediction failed: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error predicting attack:', error);
            throw error;
        }
    }
}
