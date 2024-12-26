import mongoose from 'mongoose';
import type { TrafficLog } from '../types';

const trafficLogSchema = new mongoose.Schema({
    sourceIp: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    protocol: { type: String, required: true, enum: ['HTTP', 'DNS'] },
    requestData: {
        method: String,
        path: String,
        headers: mongoose.Schema.Types.Mixed,
        payload: mongoose.Schema.Types.Mixed
    },
    responseData: {
        statusCode: Number,
        headers: mongoose.Schema.Types.Mixed,
        body: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Index for efficient querying of recent traffic
trafficLogSchema.index({ timestamp: -1, sourceIp: 1 });

export const TrafficLogModel = mongoose.model<TrafficLog>('TrafficLog', trafficLogSchema);
