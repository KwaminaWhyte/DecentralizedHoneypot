import * as tf from '@tensorflow/tfjs';
import { TrafficPatternGenerator } from '../../traffic/patterns';
import type { TrafficData } from '../../../types';

interface ModelVersion {
    version: string;
    timestamp: number;
    metrics: {
        accuracy: number;
        precision: number;
        recall: number;
        f1Score: number;
    };
    hyperparameters: {
        learningRate: number;
        batchSize: number;
        epochs: number;
        layers: number[];
    };
}

export class ModelManager {
    private static instance: ModelManager;
    private currentVersion: string;
    private versions: Map<string, ModelVersion>;
    private readonly storageKey = 'ddos-model';

    private constructor() {
        this.versions = new Map();
        this.currentVersion = '1.0.0';
        this.loadVersionHistory();
    }

    public static getInstance(): ModelManager {
        if (!ModelManager.instance) {
            ModelManager.instance = new ModelManager();
        }
        return ModelManager.instance;
    }

    private async loadVersionHistory() {
        try {
            const history = await tf.io.listModels();
            for (const [key, value] of Object.entries(history)) {
                if (key.startsWith(`indexeddb://${this.storageKey}`)) {
                    const version = key.split('-v')[1];
                    const metadata = value.modelTopologyBytes ? 
                        JSON.parse(new TextDecoder().decode(value.modelTopologyBytes)) : 
                        {};
                    
                    if (metadata.version) {
                        this.versions.set(version, metadata);
                        // Update current version if this is newer
                        if (this.compareVersions(version, this.currentVersion) > 0) {
                            this.currentVersion = version;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading model version history:', error);
        }
    }

    private compareVersions(v1: string, v2: string): number {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        
        for (let i = 0; i < 3; i++) {
            if (parts1[i] > parts2[i]) return 1;
            if (parts1[i] < parts2[i]) return -1;
        }
        return 0;
    }

    private generateNextVersion(): string {
        const parts = this.currentVersion.split('.').map(Number);
        parts[2]++; // Increment patch version
        if (parts[2] > 99) {
            parts[2] = 0;
            parts[1]++; // Increment minor version
            if (parts[1] > 99) {
                parts[1] = 0;
                parts[0]++; // Increment major version
            }
        }
        return parts.join('.');
    }

    public async trainNewVersion(hyperparameters?: Partial<ModelVersion['hyperparameters']>) {
        const nextVersion = this.generateNextVersion();
        console.log(`Training model version ${nextVersion}...`);

        // Default hyperparameters
        const params = {
            learningRate: 0.001,
            batchSize: 32,
            epochs: 50,
            layers: [64, 32, 16],
            ...hyperparameters
        };

        // Generate training data
        const trainingData = await this.generateTrainingData();
        
        // Create and train model
        const model = this.createModel(params);
        const { metrics, trainedModel } = await this.trainModel(model, trainingData, params);

        // Save model with version metadata
        const versionInfo: ModelVersion = {
            version: nextVersion,
            timestamp: Date.now(),
            metrics,
            hyperparameters: params
        };

        await this.saveModel(trainedModel, versionInfo);
        this.versions.set(nextVersion, versionInfo);
        this.currentVersion = nextVersion;

        return versionInfo;
    }

    private createModel(params: ModelVersion['hyperparameters']): tf.LayersModel {
        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.dense({
            units: params.layers[0],
            activation: 'relu',
            inputShape: [8] // Number of features
        }));

        // Hidden layers
        for (let i = 1; i < params.layers.length; i++) {
            model.add(tf.layers.dropout({ rate: 0.2 }));
            model.add(tf.layers.dense({
                units: params.layers[i],
                activation: 'relu'
            }));
        }

        // Output layer
        model.add(tf.layers.dense({
            units: 4, // normal, suspicious, targeted, ddos
            activation: 'softmax'
        }));

        model.compile({
            optimizer: tf.train.adam(params.learningRate),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    private async generateTrainingData() {
        const duration = 300000; // 5 minutes per pattern
        const patterns = ['HTTP_FLOOD', 'DNS_AMPLIFICATION', 'SMTP_BRUTE_FORCE', 'SLOW_LORIS'] as const;
        const trainingData: Array<{ input: TrafficData, label: string }> = [];

        // Generate attack patterns
        for (const pattern of patterns) {
            const data = TrafficPatternGenerator.generateTrafficData(pattern, duration);
            data.forEach(input => {
                trainingData.push({
                    input,
                    label: this.getLabel(pattern)
                });
            });
        }

        // Generate normal traffic
        const normalTraffic = TrafficPatternGenerator.generateMixedTraffic(duration);
        normalTraffic.forEach(input => {
            trainingData.push({
                input,
                label: 'normal'
            });
        });

        return this.preprocessTrainingData(trainingData);
    }

    private getLabel(pattern: string): string {
        switch (pattern) {
            case 'HTTP_FLOOD':
            case 'DNS_AMPLIFICATION':
                return 'ddos';
            case 'SLOW_LORIS':
                return 'targeted';
            case 'SMTP_BRUTE_FORCE':
                return 'suspicious';
            default:
                return 'normal';
        }
    }

    private preprocessTrainingData(data: Array<{ input: TrafficData, label: string }>) {
        // Convert data to tensors
        const features = data.map(item => {
            const { requestCount, timeWindow, uniqueIps } = item.input;
            const rps = requestCount / (timeWindow / 1000);
            const uniqueIpsCount = Array.isArray(uniqueIps) ? uniqueIps.length : uniqueIps?.size ?? 1;
            const ipRatio = requestCount > 0 ? uniqueIpsCount / requestCount : 1;

            return [
                rps,
                ipRatio,
                uniqueIpsCount,
                requestCount,
                item.input.protocol === 'http' ? 1 : 0,
                item.input.protocol === 'dns' ? 1 : 0,
                item.input.protocol === 'smtp' ? 1 : 0,
                item.input.paths?.some(p => p.includes('admin') || p.includes('wp-')) ? 1 : 0
            ];
        });

        const labels = data.map(item => {
            const categories = ['normal', 'suspicious', 'targeted', 'ddos'];
            const oneHot = new Array(categories.length).fill(0);
            oneHot[categories.indexOf(item.label)] = 1;
            return oneHot;
        });

        return {
            features: tf.tensor2d(features),
            labels: tf.tensor2d(labels)
        };
    }

    private async trainModel(
        model: tf.LayersModel,
        data: { features: tf.Tensor2D, labels: tf.Tensor2D },
        params: ModelVersion['hyperparameters']
    ) {
        const { features, labels } = data;

        // Split into training and validation sets
        const splitIdx = Math.floor(features.shape[0] * 0.8);
        const trainFeatures = features.slice([0, 0], [splitIdx, -1]);
        const trainLabels = labels.slice([0, 0], [splitIdx, -1]);
        const valFeatures = features.slice([splitIdx, 0], [-1, -1]);
        const valLabels = labels.slice([splitIdx, 0], [-1, -1]);

        // Train model
        const history = await model.fit(trainFeatures, trainLabels, {
            epochs: params.epochs,
            batchSize: params.batchSize,
            validationData: [valFeatures, valLabels],
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss.toFixed(4)}, accuracy = ${logs?.acc.toFixed(4)}`);
                }
            }
        });

        // Calculate metrics
        const evaluation = await model.evaluate(valFeatures, valLabels) as tf.Scalar[];
        const predictions = model.predict(valFeatures) as tf.Tensor;
        const metrics = this.calculateMetrics(valLabels, predictions);

        // Cleanup
        features.dispose();
        labels.dispose();
        trainFeatures.dispose();
        trainLabels.dispose();
        valFeatures.dispose();
        valLabels.dispose();
        predictions.dispose();

        return {
            metrics,
            trainedModel: model
        };
    }

    private calculateMetrics(actual: tf.Tensor2D, predicted: tf.Tensor): ModelVersion['metrics'] {
        const actualArray = actual.arraySync() as number[][];
        const predictedArray = predicted.arraySync() as number[][];

        let tp = 0, fp = 0, fn = 0;
        let correct = 0;
        const total = actualArray.length;

        for (let i = 0; i < total; i++) {
            const actualClass = actualArray[i].indexOf(1);
            const predictedClass = predictedArray[i].indexOf(Math.max(...predictedArray[i]));

            if (actualClass === predictedClass) {
                correct++;
                if (actualClass !== 0) tp++; // Not normal class
            } else {
                if (predictedClass !== 0) fp++; // False positive
                if (actualClass !== 0) fn++; // False negative
            }
        }

        const accuracy = correct / total;
        const precision = tp / (tp + fp) || 0;
        const recall = tp / (tp + fn) || 0;
        const f1Score = 2 * (precision * recall) / (precision + recall) || 0;

        return {
            accuracy,
            precision,
            recall,
            f1Score
        };
    }

    private async saveModel(model: tf.LayersModel, versionInfo: ModelVersion) {
        const modelPath = `indexeddb://${this.storageKey}-v${versionInfo.version}`;
        await model.save(modelPath);
        console.log(`Model version ${versionInfo.version} saved successfully`);
    }

    public async loadModel(version?: string): Promise<tf.LayersModel> {
        const targetVersion = version || this.currentVersion;
        const modelPath = `indexeddb://${this.storageKey}-v${targetVersion}`;
        
        try {
            const model = await tf.loadLayersModel(modelPath);
            console.log(`Loaded model version ${targetVersion}`);
            return model;
        } catch (error) {
            console.error(`Error loading model version ${targetVersion}:`, error);
            throw error;
        }
    }

    public getVersionInfo(version?: string): ModelVersion | undefined {
        return this.versions.get(version || this.currentVersion);
    }

    public getAllVersions(): ModelVersion[] {
        return Array.from(this.versions.values())
            .sort((a, b) => this.compareVersions(b.version, a.version));
    }

    public getCurrentVersion(): string {
        return this.currentVersion;
    }
}
