import { ModelManager } from './modelManager';
import { TrafficPatternGenerator } from '../../traffic/patterns';

async function main() {
    try {
        const modelManager = ModelManager.getInstance();

        // Train initial model with default hyperparameters
        console.log('Training initial model...');
        const initialVersion = await modelManager.trainNewVersion();
        console.log('Initial model metrics:', initialVersion.metrics);

        // Train model with different hyperparameters
        console.log('\nTraining model with custom hyperparameters...');
        const customVersion = await modelManager.trainNewVersion({
            learningRate: 0.0005,
            batchSize: 64,
            epochs: 100,
            layers: [128, 64, 32]
        });
        console.log('Custom model metrics:', customVersion.metrics);

        // Compare versions
        const versions = modelManager.getAllVersions();
        console.log('\nAll model versions:');
        versions.forEach(version => {
            console.log(`Version ${version.version}:`);
            console.log('- Accuracy:', version.metrics.accuracy.toFixed(4));
            console.log('- F1 Score:', version.metrics.f1Score.toFixed(4));
            console.log('- Hyperparameters:', JSON.stringify(version.hyperparameters, null, 2));
        });

        // Load best model
        const bestVersion = versions.reduce((a, b) => 
            a.metrics.f1Score > b.metrics.f1Score ? a : b
        );
        console.log(`\nBest model is version ${bestVersion.version} with F1 score ${bestVersion.metrics.f1Score.toFixed(4)}`);
        
        // Test model predictions
        console.log('\nTesting model predictions...');
        const model = await modelManager.loadModel(bestVersion.version);
        
        // Generate test traffic
        const patterns = ['HTTP_FLOOD', 'DNS_AMPLIFICATION', 'SMTP_BRUTE_FORCE', 'SLOW_LORIS'] as const;
        for (const pattern of patterns) {
            const testData = TrafficPatternGenerator.generateTrafficData(pattern, 60000);
            console.log(`\nPredicting ${pattern}:`);
            
            for (const data of testData.slice(0, 5)) { // Test first 5 samples
                const features = preprocessData(data);
                const prediction = model.predict(features) as tf.Tensor;
                const probabilities = await prediction.array() as number[][];
                const categories = ['normal', 'suspicious', 'targeted', 'ddos'];
                const predictedClass = categories[probabilities[0].indexOf(Math.max(...probabilities[0]))];
                
                console.log(`- Predicted: ${predictedClass} (confidence: ${Math.max(...probabilities[0]).toFixed(4)})`);
                
                features.dispose();
                prediction.dispose();
            }
        }

    } catch (error) {
        console.error('Error during model training:', error);
    }
}

function preprocessData(data: TrafficData): tf.Tensor2D {
    const { requestCount, timeWindow, uniqueIps } = data;
    const rps = requestCount / (timeWindow / 1000);
    const uniqueIpsCount = Array.isArray(uniqueIps) ? uniqueIps.length : uniqueIps?.size ?? 1;
    const ipRatio = requestCount > 0 ? uniqueIpsCount / requestCount : 1;

    const features = [
        rps,
        ipRatio,
        uniqueIpsCount,
        requestCount,
        data.protocol === 'http' ? 1 : 0,
        data.protocol === 'dns' ? 1 : 0,
        data.protocol === 'smtp' ? 1 : 0,
        data.paths?.some(p => p.includes('admin') || p.includes('wp-')) ? 1 : 0
    ];

    return tf.tensor2d([features]);
}

main();
