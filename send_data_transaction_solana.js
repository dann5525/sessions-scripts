// File: send_data_transaction_solana.js

require('dotenv').config();
const { dag4 } = require('@stardust-collective/dag4');
const axios = require('axios');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58').default;
const nacl = require('tweetnacl');

/**
 * Step 1: Generate or Import a Solana Wallet
 */
const getSolanaWallet = () => {
    const wallet = Keypair.generate();
    console.log(`Generated Solana Wallet Address: ${wallet.publicKey.toBase58()}`);
    // Convert Uint8Array to Buffer before encoding
    console.log(`Solana Wallet Private Key: ${bs58.encode(Buffer.from(wallet.secretKey))}`); 
    return wallet;
};

/**
 * Step 2: Create the CreateSolSession Message
 */
const buildCreateSolSessionMessage = (accessProvider, solanaAddress, accessObj, endSnapshotOrdinal) => {
    return {
        CreateSolSession: {
            accessProvider,
            solanaAddress,
            accessObj,
            endSnapshotOrdinal,
            solanaSignature: ""
        }
    };
};

/**
 * Step 3: Serialize the Message for Solana Signature
 */
const serializeForSolanaSignature = (message) => {
    const { solanaAddress, accessProvider, accessObj, endSnapshotOrdinal } = message.CreateSolSession;
    const dataToSign = `${solanaAddress}${accessProvider}${accessObj}${endSnapshotOrdinal}`;
    return Buffer.from(dataToSign, 'utf8');
};

/**
 * Step 4: Sign the Data with Solana Wallet
 */
const signWithSolana = (wallet, data) => {
    const signature = nacl.sign.detached(data, wallet.secretKey);
    return bs58.encode(Buffer.from(signature));  // Convert before encoding
};

/**
 * Step 5: Assign Solana Signature to `solanaSignature` Field
 */
const assignSolanaSignature = (message, signature) => {
    message.CreateSolSession.solanaSignature = signature;
    return message;
};

/**
 * Step 6: Generate DAG4 Proof
 */
const generateDag4Proof = async (message, walletPrivateKey, account) => {
    const serializedMessage = Buffer.from(JSON.stringify(message)).toString('base64');
    const signature = await dag4.keyStore.dataSign(walletPrivateKey, serializedMessage);
    const publicKey = account.publicKey;
    const uncompressedPublicKey =
        publicKey.length === 128 ? '04' + publicKey : publicKey;

    return {
        id: uncompressedPublicKey.substring(2),
        signature
    };
};

/**
 * Step 7: Send the Transaction
 */
const sendTransaction = async (message, proof, metagraphL1DataUrl) => {
    const body = {
        value: {
            ...message
        },
        proofs: [
            proof
        ]
    };
    try {
        console.log(`Transaction body: ${JSON.stringify(body, null, 2)}`);
        const response = await axios.post(`${metagraphL1DataUrl}/data`, body);
        console.log(`Response: ${JSON.stringify(response.data)}`);
    } catch (e) {
        if (e.response) {
            console.log('Error Response:', JSON.stringify(e.response.data, null, 2));
        } else {
            console.log('Error sending transaction', e.message);
        }
    }
};

/**
 * Main Execution Flow
 */
const main = async () => {
    try {
        // Step 1: Get Solana Wallet
        const solWallet = getSolanaWallet();

        // Step 2: Get DAG4 Wallet Private Key from Environment Variables
        const dag4PrivateKey = process.env.WALLET_PRIVATE_KEY;
        if (!dag4PrivateKey) {
            console.error("WALLET_PRIVATE_KEY is not set in the environment variables.");
            process.exit(1);
        }

        // Initialize DAG4 Account
        const account = dag4.createAccount();
        account.loginPrivateKey(dag4PrivateKey);

        account.connect({
            networkVersion: process.env.NETWORK_VERSION,
            l0Url: process.env.GLOBAL_L0_URL,
            testnet: process.env.TESTNET === 'true'
        });

        // Step 3: Build CreateSolSession Message
        const accessProvider = account.address;
        const solanaAddress = "QWERTYUIOPASDFGHJKLZXCVBNMQWERTY";
        const accessObj = "Owner1";
        const endSnapshotOrdinal = 750;

        let createSolSessionMessage = buildCreateSolSessionMessage(accessProvider, solanaAddress, accessObj, endSnapshotOrdinal);
        console.log(`Initial CreateSolSession Message: ${JSON.stringify(createSolSessionMessage, null, 2)}`);

        // Step 4: Serialize data for Solana signature
        const dataToSign = serializeForSolanaSignature(createSolSessionMessage);
        console.log(`Data to Sign with Solana Wallet (base58): ${bs58.encode(dataToSign)}`);

        // Step 5: Sign with Solana Wallet
        const solSignature = signWithSolana(solWallet, dataToSign);
        console.log(`Solana Signature: ${solSignature}`);

        // Step 6: Assign Solana Signature
        createSolSessionMessage = assignSolanaSignature(createSolSessionMessage, solSignature);
        console.log(`CreateSolSession Message with Solana Signature: ${JSON.stringify(createSolSessionMessage, null, 2)}`);

        // Step 7: DAG4 Proof
        const dag4Proof = await generateDag4Proof(createSolSessionMessage, dag4PrivateKey, account);
        console.log(`DAG4 Proof: ${JSON.stringify(dag4Proof, null, 2)}`);

        // Step 8: Send the Transaction
        const metagraphL1DataUrl = process.env.METAGRAPH_L1_DATA_URL;
        if (!metagraphL1DataUrl) {
            console.error("METAGRAPH_L1_DATA_URL is not set in the environment variables.");
            process.exit(1);
        }

        await sendTransaction(createSolSessionMessage, dag4Proof, metagraphL1DataUrl);
    } catch (error) {
        console.error('Error in main execution:', error);
        process.exit(1);
    }
};

// Execute the main function
main();
