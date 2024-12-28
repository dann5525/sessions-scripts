// File: send_data_transaction.js

require('dotenv').config();
const { ethers } = require('ethers'); // Ethers.js for Ethereum wallet operations
const { dag4 } = require('@stardust-collective/dag4'); // DAG4 library
const axios = require('axios');

/**
 * Step 1: Generate or Import an Ethereum Wallet
 * - For testing, generate a random wallet.
 * - In production, import an existing wallet using a private key.
 */
const getEthereumWallet = () => {
    // Option 1: Generate a new random Ethereum wallet
    const wallet = ethers.Wallet.createRandom();
    console.log(`Generated Ethereum Wallet Address: ${wallet.address}`);
    console.log(`Ethereum Wallet Private Key: ${wallet.privateKey}`); // **Caution**: Avoid logging in production
    return wallet;

    // Option 2: Import an existing Ethereum wallet using a private key from environment variables
    /*
    const privateKey = process.env.ETH_PRIVATE_KEY;
    if (!privateKey) {
        console.error("ETH_PRIVATE_KEY is not set in the environment variables.");
        process.exit(1);
    }
    const wallet = new ethers.Wallet(privateKey);
    console.log(`Imported Ethereum Wallet Address: ${wallet.address}`);
    return wallet;
    */
};

/**
 * Step 2: Create the CreateSession Message
 */
const buildCreateSessionMessage = (accessProvider, accessId, accessObj, endSnapshotOrdinal) => {
    return {
        CreateSession: {
            accessProvider: accessProvider,        // DAG4 address
            accessId: accessId,                    // Ethereum address
            accessObj: accessObj,                  // Some object data
            endSnapshotOrdinal: endSnapshotOrdinal, // Long integer
            hash: ""                                // To be filled with Ethereum signature
        }
    };
};

/**
 * Step 3: Serialize the Message for Ethereum Signature
 * - Define what parts of the message the Ethereum wallet will sign.
 * - For this example, we'll sign the concatenation of accessId, accessObj, and endSnapshotOrdinal.
 */
const serializeForEthereumSignature = (message) => {
    const { accessId, accessProvider, accessObj, endSnapshotOrdinal } = message.CreateSession;
    // Concatenate the fields as a single string
    const dataToSign = `${accessId}${accessProvider}${accessObj}${endSnapshotOrdinal}`;
    return ethers.utils.toUtf8Bytes(dataToSign);
};

/**
 * Step 4: Sign the Data with Ethereum Wallet
 */
const signWithEthereum = async (wallet, data) => {
    // Sign the data using signMessage, which adds the Ethereum prefix
    const signature = await wallet.signMessage(data);
    return signature;
};

/**
 * Step 5: Assign Ethereum Signature to `hash` Field
 */
const assignEthereumSignature = (message, signature) => {
    message.CreateSession.hash = signature;
    return message;
};

/**
 * Step 6: Generate DAG4 Proof
 */
const generateDag4Proof = async (message, walletPrivateKey, account) => {
    // Serialize the entire message as JSON and encode it in base64
    const serializedMessage = Buffer.from(JSON.stringify(message)).toString('base64');
    // Sign the serialized message with DAG4 wallet
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
    // Step 1: Get Ethereum Wallet
    const ethWallet = getEthereumWallet();

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

    // Step 3: Build CreateSession Message without `hash`
    const accessProvider = account.address; // DAG4 address
    const accessId = ethWallet.address;      // Ethereum address
    const accessObj = "Owner1";              // Replace with actual object data
    const endSnapshotOrdinal = 750;         // Replace with actual ordinal

    let createSessionMessage = buildCreateSessionMessage(accessProvider, accessId, accessObj, endSnapshotOrdinal);
    console.log(`Initial CreateSession Message: ${JSON.stringify(createSessionMessage, null, 2)}`);

    // Step 4: Serialize data for Ethereum signature
    const dataToSign = serializeForEthereumSignature(createSessionMessage);
    console.log(`Data to Sign with Ethereum Wallet (hex): ${ethers.utils.hexlify(dataToSign)}`);

    // Step 5: Sign with Ethereum Wallet
    const ethSignature = await signWithEthereum(ethWallet, dataToSign);
    console.log(`Ethereum Signature: ${ethSignature}`);

    // Step 6: Assign Ethereum Signature to `hash` field
    createSessionMessage = assignEthereumSignature(createSessionMessage, ethSignature);
    console.log(`CreateSession Message with Ethereum Signature: ${JSON.stringify(createSessionMessage, null, 2)}`);

    // Step 7: Sign the entire message with DAG4 Wallet
    const dag4Proof = await generateDag4Proof(createSessionMessage, dag4PrivateKey, account);
    console.log(`DAG4 Proof: ${JSON.stringify(dag4Proof, null, 2)}`);

    // Step 8: Send the Transaction
    const metagraphL1DataUrl = process.env.METAGRAPH_L1_DATA_URL;
    if (!metagraphL1DataUrl) {
        console.error("METAGRAPH_L1_DATA_URL is not set in the environment variables.");
        process.exit(1);
    }

    await sendTransaction(createSessionMessage, dag4Proof, metagraphL1DataUrl);
};

// Execute the main function
main();
