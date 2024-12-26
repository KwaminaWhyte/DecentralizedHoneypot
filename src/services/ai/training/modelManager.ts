import * as tf from '@tensorflow/tfjs';
import { TrafficPatternGenerator } from '../../traffic/patterns';
import type { TrafficData } from '../../../types';
import * as fs from 'fs';
import * as path from 'path';

// Initialize TensorFlow.js with CPU backend
tf.setBackend('cpu');

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
    private readonly modelsDir = path.join(process.cwd(), 'models');
    private fullDataset?: { features: tf.Tensor2D, labels: tf.Tensor2D };

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
            const files = fs.readdirSync(this.modelsDir);
            for (const file of files) {
                if (file.startsWith('model-v') && file.endsWith('.json')) {
                    const version = file.split('-v')[1].split('.json')[0];
                    const metadataPath = path.join(this.modelsDir, file);
                    const versionInfo = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')).metadata as ModelVersion;
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
        try {
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
            console.log('Using hyperparameters:', JSON.stringify(params, null, 2));

            console.log('\nGenerating training data...');
            // Generate training data
            const trainingData = await this.generateTrainingData();
            if (!trainingData || !trainingData.features || !trainingData.labels) {
                throw new Error('Failed to generate training data');
            }
            console.log('Training data shape:', {
                features: trainingData.features.shape,
                labels: trainingData.labels.shape
            });
            
            console.log('\nCreating model architecture...');
            // Create and train model
            const model = this.createModel([10], 5, params.layers);
            if (!model) {
                throw new Error('Failed to create model');
            }
            model.summary();
            console.log('Model architecture created');

            console.log('\nStarting model training...');
            try {
                const { metrics, trainedModel } = await this.trainModel(model, trainingData, params);
                console.log('\nTraining completed successfully');
                console.log('Metrics:', metrics);

                // Save model with version metadata
                const versionInfo: ModelVersion = {
                    version: nextVersion,
                    timestamp: Date.now(),
                    metrics,
                    hyperparameters: params
                };

                console.log('\nSaving model...');
                await this.saveModel(trainedModel, versionInfo.version);
                this.versions.set(nextVersion, versionInfo);
                this.currentVersion = nextVersion;

                console.log('Model saved successfully');
                return versionInfo;
            } catch (error) {
                console.error('Error during model training:', error);
                throw error;
            }
        } catch (error) {
            console.error('Fatal error in trainNewVersion:', error);
            throw error;
        }
    }

    private async saveModel(model: tf.LayersModel, version: string): Promise<void> {
        const modelDir = path.join(this.modelsDir, `model-v${version}`);
        
        try {
            // Ensure directory exists
            await fs.promises.mkdir(modelDir, { recursive: true });
            
            // Save model architecture and weights separately
            const modelPath = path.join(modelDir, 'model.json');
            const weightsPath = path.join(modelDir, 'weights.bin');
            
            // Convert model to format compatible with tfjs-node
            const saveFormat = {
                modelTopology: {
                    class_name: "Sequential",
                    config: {
                        name: "sequential",
                        layers: model.layers.map(layer => ({
                            class_name: layer.getClassName(),
                            config: {
                                ...layer.getConfig(),
                                // Remove regularizers from saved config
                                kernelRegularizer: null,
                                biasRegularizer: null,
                                activityRegularizer: null
                            }
                        }))
                    }
                },
                format: 'layers-model',
                generatedBy: 'TensorFlow.js tfjs-layers v4.22.0',
                convertedBy: null,
                weightsManifest: [{
                    paths: ['weights.bin'],
                    weights: []
                }]
            };
            
            // Save model architecture
            await fs.promises.writeFile(modelPath, JSON.stringify(saveFormat, null, 2));
            
            // Save weights
            const weightData = await model.getWeights();
            const weightSpecs = weightData.map(w => ({
                name: w.name || '',
                shape: w.shape,
                dtype: w.dtype
            }));
            
            // Write weights to binary file
            const writer = await fs.promises.open(weightsPath, 'w');
            for (const weight of weightData) {
                const data = await weight.data();
                await writer.write(Buffer.from(data.buffer));
                weight.dispose();
            }
            await writer.close();
            
            // Update weights manifest
            saveFormat.weightsManifest[0].weights = weightSpecs;
            await fs.promises.writeFile(modelPath, JSON.stringify(saveFormat, null, 2));
            
            console.log('Model saved successfully');
        } catch (error) {
            console.error('Error saving model:', error);
            throw error;
        }
    }

    private async loadModel(version: string): Promise<tf.LayersModel> {
        const modelDir = path.join(this.modelsDir, `model-v${version}`);
        const modelPath = `file://${modelDir}/model.json`;
        
        try {
            // Load model using tf.loadLayersModel
            const model = await tf.loadLayersModel(modelPath);
            return model;
        } catch (error) {
            console.error('Error loading model:', error);
            throw error;
        }
    }

    private createModel(inputShape: number[], numClasses: number, layers: number[]): tf.LayersModel {
        const model = tf.sequential();

        // Input layer with correct shape specification
        model.add(tf.layers.dense({
            units: layers[0],
            inputShape: inputShape,
            kernelInitializer: 'glorotNormal',
            kernelRegularizer: tf.regularizers.l1l2({l1: 0.01, l2: 0.01})
        }));

        // Add regularization to prevent overfitting
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.activation({activation: 'relu'}));
        model.add(tf.layers.dropout({rate: 0.5}));

        // Hidden layers with stronger regularization
        for (let i = 1; i < layers.length; i++) {
            model.add(tf.layers.dense({
                units: layers[i],
                kernelInitializer: 'glorotNormal',
                kernelRegularizer: tf.regularizers.l1l2({l1: 0.01, l2: 0.01})
            }));
            model.add(tf.layers.batchNormalization());
            model.add(tf.layers.activation({activation: 'relu'}));
            model.add(tf.layers.dropout({rate: 0.5}));
        }

        // Output layer
        model.add(tf.layers.dense({
            units: numClasses,
            activation: 'softmax',
            kernelInitializer: 'glorotNormal'
        }));

        // Compile with better optimizer settings
        model.compile({
            optimizer: tf.train.adamax(0.0002),  // Use Adamax for better stability
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        // Print model summary
        console.log('\nModel Summary:');
        model.summary();

        return model;
    }

    private async generateTrainingData() {
        try {
            console.log('Starting training data generation...');
            const duration = 300000; // 5 minutes per pattern
            const patterns = ['HTTP_FLOOD', 'DNS_AMPLIFICATION', 'SMTP_BRUTE_FORCE', 'SLOW_LORIS'] as const;
            const trainingData: Array<{ input: TrafficData, label: string }> = [];

            // Generate attack patterns
            for (const pattern of patterns) {
                console.log(`\nGenerating ${pattern} pattern...`);
                const data = TrafficPatternGenerator.generateTrafficData(pattern, duration);
                console.log(`Generated ${data.length} samples for ${pattern}`);
                data.forEach(input => {
                    trainingData.push({
                        input,
                        label: pattern
                    });
                });
            }

            // Generate normal traffic
            console.log('\nGenerating normal traffic pattern...');
            const normalTraffic = TrafficPatternGenerator.generateMixedTraffic(duration);
            console.log(`Generated ${normalTraffic.length} samples for normal traffic`);
            normalTraffic.forEach(input => {
                trainingData.push({
                    input,
                    label: 'NORMAL'
                });
            });

            console.log('\nPreprocessing training data...');
            console.log(`Total samples: ${trainingData.length}`);

            // Convert to tensors
            const features = tf.tensor2d(
                trainingData.map(sample => this.extractFeatures(sample.input)),
                [trainingData.length, 10] // Feature dimension
            );

            const labels = tf.tensor2d(
                trainingData.map(sample => this.oneHotEncode(sample.label)),
                [trainingData.length, 5] // 4 attack types + normal
            );

            console.log('Data preprocessing completed');
            return { features, labels };
        } catch (error) {
            console.error('Error generating training data:', error);
            throw error;
        }
    }

    private extractFeatures(data: TrafficData): number[] {
        // Extract relevant features from traffic data
        return [
            data.requestCount,
            data.timeWindow,
            data.uniqueIps.size,
            data.protocol === 'http' ? 1 : 0,
            data.protocol === 'dns' ? 1 : 0,
            data.protocol === 'smtp' ? 1 : 0,
            data.paths ? data.paths.length : 0,
            data.queryTypes ? 1 : 0,
            data.timestamp % 86400000, // Time of day
            1 // Bias term
        ];
    }

    private oneHotEncode(label: string): number[] {
        const labels = ['HTTP_FLOOD', 'DNS_AMPLIFICATION', 'SMTP_BRUTE_FORCE', 'SLOW_LORIS', 'NORMAL'];
        return labels.map(l => l === label ? 1 : 0);
    }

    private async trainModel(
        model: tf.LayersModel,
        data: { features: tf.Tensor2D, labels: tf.Tensor2D },
        params: ModelVersion['hyperparameters']
    ) {
        const { features, labels } = data;

        // Validate data shapes
        const featureShape = features.shape;
        const labelShape = labels.shape;
        console.log('\nValidating data shapes:');
        console.log('Features shape:', featureShape);
        console.log('Labels shape:', labelShape);

        if (featureShape[1] !== 10) {
            throw new Error(`Expected features to have 10 dimensions, but got ${featureShape[1]}`);
        }
        if (labelShape[1] !== 5) {
            throw new Error(`Expected labels to have 5 classes, but got ${labelShape[1]}`);
        }
        if (featureShape[0] !== labelShape[0]) {
            throw new Error(`Number of examples mismatch: features ${featureShape[0]}, labels ${labelShape[0]}`);
        }

        // Reduce dataset size with balanced sampling
        const maxSamples = 10000;
        let trainFeatures, trainLabels, valFeatures, valLabels;

        if (features.shape[0] > maxSamples) {
            console.log(`\nReducing dataset size with balanced sampling`);
            
            // Convert labels to indices
            const labelIndices = tf.argMax(labels, 1);
            const labelsArray = await labelIndices.array();
            labelIndices.dispose();

            // Count samples per class
            const classCounts = new Array(5).fill(0);
            labelsArray.forEach(label => classCounts[label]++);
            console.log('Original class distribution:', classCounts);

            // Find minimum samples per class (at least 100)
            const minSamplesPerClass = Math.max(100, Math.min(...classCounts));
            const targetSamplesPerClass = Math.min(minSamplesPerClass, Math.floor(maxSamples / 5));
            console.log('Target samples per class:', targetSamplesPerClass);
            
            // Group indices by class
            const classIndices = Array.from({ length: 5 }, () => [] as number[]);
            labelsArray.forEach((label, idx) => {
                classIndices[label].push(idx);
            });

            // Sample with replacement for underrepresented classes
            const selectedIndices: number[] = [];
            classIndices.forEach((indices, classIdx) => {
                if (indices.length === 0) {
                    console.log(`Warning: No samples for class ${classIdx}`);
                    return;
                }

                // If we have fewer samples than needed, sample with replacement
                if (indices.length < targetSamplesPerClass) {
                    console.log(`Class ${classIdx}: Sampling ${targetSamplesPerClass} with replacement from ${indices.length} samples`);
                    for (let i = 0; i < targetSamplesPerClass; i++) {
                        const randomIdx = Math.floor(Math.random() * indices.length);
                        selectedIndices.push(indices[randomIdx]);
                    }
                } else {
                    // If we have enough samples, sample without replacement
                    const shuffled = [...indices];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    selectedIndices.push(...shuffled.slice(0, targetSamplesPerClass));
                }
            });

            // Shuffle selected indices
            for (let i = selectedIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [selectedIndices[i], selectedIndices[j]] = [selectedIndices[j], selectedIndices[i]];
            }

            // Convert to tensor and gather samples
            const indicesTensor = tf.tensor1d(selectedIndices, 'int32');
            const selectedFeatures = tf.gather(features, indicesTensor);
            const selectedLabels = tf.gather(labels, indicesTensor);

            // Split into training and validation
            const splitIdx = Math.floor(selectedIndices.length * 0.8);
            trainFeatures = selectedFeatures.slice([0, 0], [splitIdx, -1]);
            trainLabels = selectedLabels.slice([0, 0], [splitIdx, -1]);
            valFeatures = selectedFeatures.slice([splitIdx, 0], [-1, -1]);
            valLabels = selectedLabels.slice([splitIdx, 0], [-1, -1]);

            // Store full dataset for final validation
            this.fullDataset = {
                features: features.clone(),
                labels: labels.clone()
            };

            // Cleanup
            indicesTensor.dispose();
            selectedFeatures.dispose();
            selectedLabels.dispose();

            console.log('\nFinal dataset sizes:');
            console.log('Training samples:', trainFeatures.shape[0]);
            console.log('Validation samples:', valFeatures.shape[0]);
            console.log('Full dataset samples:', features.shape[0]);
        } else {
            // If dataset is already small enough, use it all
            const splitIdx = Math.floor(features.shape[0] * 0.8);
            trainFeatures = features.slice([0, 0], [splitIdx, -1]);
            trainLabels = labels.slice([0, 0], [splitIdx, -1]);
            valFeatures = features.slice([splitIdx, 0], [-1, -1]);
            valLabels = labels.slice([splitIdx, 0], [-1, -1]);
            
            this.fullDataset = {
                features: features.clone(),
                labels: labels.clone()
            };
        }

        // Train model with early stopping and progress tracking
        console.log('\nStarting training...');
        let bestValLoss = Infinity;
        let patience = 5;
        let patienceCounter = 0;
        let startTime = Date.now();

        const history = await model.fit(trainFeatures, trainLabels, {
            epochs: Math.min(params.epochs, 20),
            batchSize: params.batchSize,
            validationData: [valFeatures, valLabels],
            shuffle: true,
            verbose: 1,
            callbacks: {
                onEpochEnd: async (epoch, logs) => {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(
                        `Epoch ${epoch + 1}/${Math.min(params.epochs, 20)} - ` +
                        `loss: ${logs.loss.toFixed(4)} - ` +
                        `accuracy: ${logs.acc.toFixed(4)} - ` +
                        `val_loss: ${logs.val_loss.toFixed(4)} - ` +
                        `val_accuracy: ${logs.val_acc.toFixed(4)} - ` +
                        `time: ${elapsed}s`
                    );

                    // Early stopping
                    if (logs.val_loss < bestValLoss) {
                        bestValLoss = logs.val_loss;
                        patienceCounter = 0;
                    } else {
                        patienceCounter++;
                        if (patienceCounter >= patience) {
                            console.log('\nStopping early due to no improvement in validation loss');
                            model.stopTraining = true;
                        }
                    }
                }
            }
        });

        // Calculate metrics on validation set
        console.log('\nCalculating validation metrics...');
        const valPredictions = model.predict(valFeatures) as tf.Tensor;
        const valMetrics = this.calculateMetrics(valLabels, valPredictions);
        valPredictions.dispose();

        // Calculate metrics on full dataset
        console.log('\nCalculating metrics on full dataset...');
        const fullPredictions = model.predict(this.fullDataset.features) as tf.Tensor;
        const fullMetrics = this.calculateMetrics(this.fullDataset.labels, fullPredictions);
        
        console.log('\nValidation set metrics:', valMetrics);
        console.log('Full dataset metrics:', fullMetrics);

        // Cleanup
        trainFeatures.dispose();
        trainLabels.dispose();
        valFeatures.dispose();
        valLabels.dispose();
        fullPredictions.dispose();
        this.fullDataset.features.dispose();
        this.fullDataset.labels.dispose();

        return {
            metrics: fullMetrics,
            trainedModel: model
        };
    }

    private calculateMetrics(actual: tf.Tensor, predicted: tf.Tensor): ModelVersion['metrics'] {
        try {
            // Convert predictions to class indices
            const predictedClasses = predicted.argMax(-1);
            const actualClasses = actual.argMax(-1);
            
            // Calculate accuracy
            const correct = predictedClasses.equal(actualClasses);
            const accuracy = correct.mean().dataSync()[0];

            // Calculate per-class metrics
            const confusionMatrix = Array(5).fill(0).map(() => Array(5).fill(0));
            const predArray = predictedClasses.arraySync() as number[];
            const actualArray = actualClasses.arraySync() as number[];

            // Build confusion matrix
            for (let i = 0; i < predArray.length; i++) {
                confusionMatrix[actualArray[i]][predArray[i]]++;
            }

            // Calculate precision, recall for each class
            let totalPrecision = 0;
            let totalRecall = 0;
            let validClasses = 0;

            for (let i = 0; i < 5; i++) {
                const truePositives = confusionMatrix[i][i];
                const falsePositives = confusionMatrix.reduce((sum, row, idx) => 
                    idx !== i ? sum + row[i] : sum, 0);
                const falseNegatives = confusionMatrix[i].reduce((sum, val, idx) => 
                    idx !== i ? sum + val : sum, 0);

                if (truePositives + falsePositives > 0 && truePositives + falseNegatives > 0) {
                    const precision = truePositives / (truePositives + falsePositives);
                    const recall = truePositives / (truePositives + falseNegatives);
                    totalPrecision += precision;
                    totalRecall += recall;
                    validClasses++;
                }
            }

            // Calculate macro-averaged metrics
            const precision = validClasses > 0 ? totalPrecision / validClasses : 0;
            const recall = validClasses > 0 ? totalRecall / validClasses : 0;
            const f1Score = precision + recall > 0 
                ? 2 * (precision * recall) / (precision + recall)
                : 0;

            // Cleanup
            predictedClasses.dispose();
            actualClasses.dispose();

            return {
                accuracy,
                precision,
                recall,
                f1Score
            };
        } catch (error) {
            console.error('Error calculating metrics:', error);
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
