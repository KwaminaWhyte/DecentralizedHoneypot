import * as tf from '@tensorflow/tfjs';
import { TrafficPatternGenerator } from '../../traffic/patterns';
import type { TrafficData } from '../../../types';
import * as fs from 'fs';
import * as path from 'path';

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
            const modelsDir = path.join(process.cwd(), 'models');
            const files = fs.readdirSync(modelsDir);
            for (const file of files) {
                if (file.startsWith('model-v') && file.endsWith('-metadata.json')) {
                    const version = file.split('-v')[1].split('-metadata.json')[0];
                    const metadataPath = path.join(modelsDir, file);
                    const versionInfo = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as ModelVersion;
                    this.versions.set(version, versionInfo);
                    // Update current version if this is newer
                    if (this.compareVersions(version, this.currentVersion) > 0) {
                        this.currentVersion = version;
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
        console.log(`\nInitializing training for model version ${nextVersion}...`);

        // Default hyperparameters
        const params = {
            learningRate: 0.001,
            batchSize: 32,
            epochs: 20,
            layers: [32, 16, 8],
            ...hyperparameters
        };

        console.log('Generating training data...');
        // Generate training data
        const trainingData = await this.generateTrainingData();
        console.log(`Generated ${trainingData.features.shape[0]} training samples`);
        
        console.log('Creating model architecture...');
        // Create and train model
        const model = this.createModel(params);
        console.log('Model architecture created');

        console.log('\nStarting model training...');
        try {
            const { metrics, trainedModel } = await this.trainModel(model, trainingData, params);

            // Save model with version metadata
            const versionInfo: ModelVersion = {
                version: nextVersion,
                timestamp: Date.now(),
                metrics,
                hyperparameters: params
            };

            console.log('Saving model...');
            await this.saveModel(trainedModel, versionInfo);
            this.versions.set(nextVersion, versionInfo);
            this.currentVersion = nextVersion;

            return versionInfo;
        } catch (error) {
            console.error('Error during model training:', error);
            throw error;
        }
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
        console.log('Generating attack patterns...');
        const duration = 300000; // 5 minutes per pattern
        const patterns = ['HTTP_FLOOD', 'DNS_AMPLIFICATION', 'SMTP_BRUTE_FORCE', 'SLOW_LORIS'] as const;
        const trainingData: Array<{ input: TrafficData, label: string }> = [];

        // Generate attack patterns
        for (const pattern of patterns) {
            console.log(`Generating ${pattern} pattern...`);
            const data = TrafficPatternGenerator.generateTrafficData(pattern, duration);
            data.forEach(input => {
                trainingData.push({
                    input,
                    label: this.getLabel(pattern)
                });
            });
        }

        // Generate normal traffic
        console.log('Generating normal traffic pattern...');
        const normalTraffic = TrafficPatternGenerator.generateMixedTraffic(duration);
        normalTraffic.forEach(input => {
            trainingData.push({
                input,
                label: 'normal'
            });
        });

        console.log('Preprocessing training data...');
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

        // Progress tracking
        let startTime = Date.now();
        let lastLogTime = startTime;

        // Train model
        const history = await model.fit(trainFeatures, trainLabels, {
            epochs: params.epochs,
            batchSize: params.batchSize,
            validationData: [valFeatures, valLabels],
            callbacks: {
                onEpochBegin: (epoch) => {
                    if (epoch === 0) {
                        console.log('\nStarting training...');
                        console.log('Epochs:', params.epochs);
                        console.log('Batch size:', params.batchSize);
                        console.log('Learning rate:', params.learningRate);
                        console.log('Training samples:', trainFeatures.shape[0]);
                        console.log('Validation samples:', valFeatures.shape[0]);
                        console.log('\nTraining progress:');
                    }
                },
                onEpochEnd: (epoch, logs) => {
                    const currentTime = Date.now();
                    const elapsedMinutes = ((currentTime - startTime) / 1000 / 60).toFixed(1);
                    const epochsRemaining = params.epochs - (epoch + 1);
                    const timePerEpoch = (currentTime - startTime) / (epoch + 1);
                    const estimatedTimeRemaining = ((epochsRemaining * timePerEpoch) / 1000 / 60).toFixed(1);

                    // Log every 5 epochs or if more than 30 seconds passed
                    if (epoch % 5 === 0 || currentTime - lastLogTime > 30000) {
                        console.log(
                            `Epoch ${epoch + 1}/${params.epochs} - ` +
                            `loss: ${logs?.loss.toFixed(4)} - ` +
                            `accuracy: ${logs?.acc.toFixed(4)} - ` +
                            `val_loss: ${logs?.val_loss.toFixed(4)} - ` +
                            `val_accuracy: ${logs?.val_acc.toFixed(4)}`
                        );
                        console.log(
                            `Time elapsed: ${elapsedMinutes}m - ` +
                            `Estimated time remaining: ${estimatedTimeRemaining}m`
                        );
                        lastLogTime = currentTime;
                    }

                    // Early stopping if validation loss is not improving
                    if (epoch > 10 && logs?.val_loss > 1.0) {
                        console.log('\nStopping early due to high validation loss');
                        model.stopTraining = true;
                    }
                }
            }
        });

        // Calculate metrics
        console.log('\nCalculating final metrics...');
        const evaluation = await model.evaluate(valFeatures, valLabels) as tf.Scalar[];
        const predictions = model.predict(valFeatures) as tf.Tensor;
        const metrics = this.calculateMetrics(valLabels, predictions);

        console.log('\nTraining completed!');
        console.log('Final metrics:');
        console.log('- Accuracy:', metrics.accuracy.toFixed(4));
        console.log('- Precision:', metrics.precision.toFixed(4));
        console.log('- Recall:', metrics.recall.toFixed(4));
        console.log('- F1 Score:', metrics.f1Score.toFixed(4));
        console.log(`Total training time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);

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
        try {
            // Create models directory if it doesn't exist
            const modelsDir = path.join(process.cwd(), 'models');
            if (!fs.existsSync(modelsDir)) {
                fs.mkdirSync(modelsDir, { recursive: true });
            }

            // Save model files
            const modelPath = path.join(modelsDir, `model-v${versionInfo.version}`);
            await model.save(`file://${modelPath}`);

            // Save version metadata
            const metadataPath = path.join(modelsDir, `model-v${versionInfo.version}-metadata.json`);
            fs.writeFileSync(metadataPath, JSON.stringify(versionInfo, null, 2));

            console.log(`Model version ${versionInfo.version} saved successfully to ${modelPath}`);
            console.log(`Model metadata saved to ${metadataPath}`);
        } catch (error) {
            console.error('Error saving model:', error);
            throw error;
        }
    }

    private async loadModel(version?: string): Promise<{ model: tf.LayersModel, versionInfo: ModelVersion }> {
        try {
            const targetVersion = version || this.currentVersion;
            if (!targetVersion) {
                throw new Error('No model version specified and no current version set');
            }

            const modelsDir = path.join(process.cwd(), 'models');
            const modelPath = path.join(modelsDir, `model-v${targetVersion}`);
            const metadataPath = path.join(modelsDir, `model-v${targetVersion}-metadata.json`);

            // Load model
            const model = await tf.loadLayersModel(`file://${modelPath}/model.json`);
            
            // Load metadata
            const versionInfo = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as ModelVersion;

            console.log(`Model version ${targetVersion} loaded successfully from ${modelPath}`);
            return { model, versionInfo };
        } catch (error) {
            console.error('Error loading model:', error);
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
