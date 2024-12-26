import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import config from '../config';

async function main() {
    // Connect to the network
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const wallet = new ethers.Wallet(config.blockchain.privateKey, provider);

    console.log('Deploying contract from account:', wallet.address);

    // Read the contract artifact
    const contractPath = path.join(__dirname, '../contracts/AttackLogger.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    // Compile the contract
    const solc = require('solc');
    const input = {
        language: 'Solidity',
        sources: {
            'AttackLogger.sol': {
                content: source,
            },
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['*'],
                },
            },
        },
    };

    console.log('Compiling contract...');
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const artifact = output.contracts['AttackLogger.sol'].AttackLogger;

    // Deploy the contract
    console.log('Deploying contract...');
    const factory = new ethers.ContractFactory(
        artifact.abi,
        artifact.evm.bytecode.object,
        wallet
    );

    const contract = await factory.deploy();
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log('Contract deployed to:', address);

    // Save the contract address and ABI
    const deployment = {
        address,
        abi: artifact.abi,
        network: config.blockchain.network,
        deployedAt: new Date().toISOString()
    };

    const deploymentPath = path.join(__dirname, '../contracts/deployment.json');
    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log('Deployment info saved to:', deploymentPath);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
