import * as tf from '@tensorflow/tfjs';
import { ModelManager } from '../training/modelManager';
import type { TrafficData, AttackClassification } from '../../../types';

export class DDoSModel {
    private model: tf.LayersModel | null = null;
    private modelManager: ModelManager;
    private readonly inputFeatures = 8; // Number of input features

    constructor() {
        this.modelManager = ModelManager.getInstance();
    }

    async loadModel(): Promise<void> {
        if (!this.model) {
            this.model = await this.modelManager.loadModel();
        }
    }

    private async initModel() {
        try {
            // Try to load existing model from IndexedDB
            await this.loadModel();
            console.log('Loaded existing DDoS detection model');
        } catch {
            // Create new model if none exists
            this.model = this.createModel();
            console.log('Created new DDoS detection model');
        }
    }

    private createModel(): tf.LayersModel {
        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [this.inputFeatures]
        }));

        // Hidden layers
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));

        // Output layer (multi-class classification)
        model.add(tf.layers.dense({
            units: 4, // normal, suspicious, targeted, ddos
            activation: 'softmax'
        }));

        // Compile model
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    private preprocessTrafficData(data: TrafficData): number[] {
        const { requestCount, timeWindow, uniqueIps } = data;
        const rps = requestCount / (timeWindow / 1000);
        const uniqueIpsCount = Array.isArray(uniqueIps) ? uniqueIps.length : uniqueIps?.size ?? 1;
        const ipRatio = requestCount > 0 ? uniqueIpsCount / requestCount : 1;

        // Feature vector:
        // [rps, ipRatio, uniqueIpsCount, requestCount, 
        //  isHTTP, isDNS, isSMTP, hasSensitivePaths]
        return [
            rps,
            ipRatio,
            uniqueIpsCount,
            requestCount,
            data.protocol === 'http' ? 1 : 0,
            data.protocol === 'dns' ? 1 : 0,
            data.protocol === 'smtp' ? 1 : 0,
            data.paths?.some(p => p.includes('admin') || p.includes('wp-')) ? 1 : 0
        ];
    }

    public async predict(trafficData: TrafficData): Promise<AttackClassification> {
        if (!this.model) {
            await this.initModel();
        }

        // Preprocess data
        const features = this.preprocessTrafficData(trafficData);
        
        // Make prediction
        const inputTensor = tf.tensor2d([features]);
        const prediction = this.model.predict(inputTensor) as tf.Tensor;
        const probabilities = await prediction.array() as number[][];

        // Cleanup tensors
        inputTensor.dispose();
        prediction.dispose();

        // Get prediction class and confidence
        const attackTypes = ['normal', 'suspicious', 'targeted', 'ddos'];
        const maxIndex = probabilities[0].indexOf(Math.max(...probabilities[0]));
        const confidence = probabilities[0][maxIndex];

        return {
            attackType: attackTypes[maxIndex],
            confidence,
            timestamp: new Date(),
            details: {
                probabilities: probabilities[0],
                features
            }
        };
    }

    public async train(trainingData: {
        input: TrafficData,
        label: string
    }[]): Promise<tf.History> {
        if (!this.model) {
            await this.initModel();
        }

        // Prepare training data
        const features = trainingData.map(d => this.preprocessTrafficData(d.input));
        const labels = trainingData.map(d => {
            const attackTypes = ['normal', 'suspicious', 'targeted', 'ddos'];
            const oneHot = new Array(attackTypes.length).fill(0);
            oneHot[attackTypes.indexOf(d.label)] = 1;
            return oneHot;
        });

        // Convert to tensors
        const xs = tf.tensor2d(features);
        const ys = tf.tensor2d(labels);

        // Train model
        const history = await this.model.fit(xs, ys, {
            epochs: 50,
            batchSize: 32,
            validationSplit: 0.2,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss.toFixed(4)}, accuracy = ${logs?.acc.toFixed(4)}`);
                }
            }
        });

        // Cleanup tensors
        xs.dispose();
        ys.dispose();

        // Save model
        await this.modelManager.saveModel(this.model);

        return history;
    }

    async getModelInfo(): Promise<{
        version: string;
        metrics: {
            accuracy: number;
            precision: number;
            recall: number;
            f1Score: number;
        };
    }> {
        const version = this.modelManager.getCurrentVersion();
        const info = this.modelManager.getVersionInfo(version);
        
        if (!info) {
            throw new Error('No model information available');
        }

        return {
            version: info.version,
            metrics: info.metrics
        };
    }
}
