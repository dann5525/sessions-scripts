require('dotenv').config();
const { ethers } = require('ethers');
const { dag4 } = require('@stardust-collective/dag4');
const axios = require('axios');

// Message Builders
const buildNotarizeSessionMessage = (accessProvider, accessId, accessObj, endSnapshotOrdinal) => {
    return {
        NotarizeSession: {
            accessProvider: accessProvider,
            accessId: accessId,
            accessObj: accessObj,
            endSnapshotOrdinal: endSnapshotOrdinal,
            metadata: {
                startTime: new Date().toISOString(),
                data: {
                    "userId": { "StringValue": { "value": "user123" } },
                    "loginCount": { "NumberValue": { "value": 42 } },
                    "isActive": { "BooleanValue": { "value": true } }
                }
            }
        }
    };
};

const buildExtendSessionMessage = (sessionId, accessProvider, newEndSnapshotOrdinal) => {
    return {
        ExtendSession: {
            id: sessionId,
            accessProvider: accessProvider,
            endSnapshotOrdinal: newEndSnapshotOrdinal
        }
    };
};

const buildCloseSessionMessage = (sessionId, accessProvider) => {
    return {
        CloseSession: {
            id: sessionId,
            accessProvider: accessProvider
        }
    };
};

// Utility Functions
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
        return response.data;
    } catch (e) {
        if (e.response) {
            console.error('Error Response:', JSON.stringify(e.response.data, null, 2));
        } else {
            console.error('Error sending transaction', e.message);
        }
        throw e;
    }
};

// Session Operations
const createSession = async (account, walletPrivateKey, metagraphL1DataUrl) => {
    const accessProvider = account.address;
    const accessId = account.address;
    const accessObj = "Owner11";
    const endSnapshotOrdinal = 12000;

    const message = buildNotarizeSessionMessage(
        accessProvider, 
        accessId, 
        accessObj, 
        endSnapshotOrdinal
    );
    console.log(`Creating session with message: ${JSON.stringify(message, null, 2)}`);

    const proof = await generateDag4Proof(message, walletPrivateKey, account);
    return sendTransaction(message, proof, metagraphL1DataUrl);
};

const extendSession = async (sessionId, account, walletPrivateKey, metagraphL1DataUrl) => {
    const newEndSnapshotOrdinal = 24000; // Double the original duration
    
    const message = buildExtendSessionMessage(
        sessionId,
        account.address,
        newEndSnapshotOrdinal
    );
    console.log(`Extending session with message: ${JSON.stringify(message, null, 2)}`);

    const proof = await generateDag4Proof(message, walletPrivateKey, account);
    return sendTransaction(message, proof, metagraphL1DataUrl);
};

const closeSession = async (sessionId, account, walletPrivateKey, metagraphL1DataUrl) => {
    const message = buildCloseSessionMessage(
        sessionId,
        account.address
    );
    console.log(`Closing session with message: ${JSON.stringify(message, null, 2)}`);

    const proof = await generateDag4Proof(message, walletPrivateKey, account);
    return sendTransaction(message, proof, metagraphL1DataUrl);
};

// Main Execution
const main = async () => {
    // Environment Validation
    const dag4PrivateKey = process.env.WALLET_PRIVATE_KEY;
    const metagraphL1DataUrl = process.env.METAGRAPH_L1_DATA_URL;

    if (!dag4PrivateKey || !metagraphL1DataUrl) {
        console.error("Missing required environment variables");
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

    try {
        // Step 1: Create Session
        console.log("Step 1: Creating initial session...");
        const createResult = await createSession(account, dag4PrivateKey, metagraphL1DataUrl);
        console.log("Create session result:", createResult);
        
        const sessionId = createResult.hash;
        console.log("Session hash/id:", sessionId);

        // Step 2: Wait 20 seconds then extend the session
        console.log("Waiting 20 seconds before extending...");
        await new Promise(resolve => setTimeout(resolve, 20000));

        console.log("Step 2: Extending the session...");
        const extendResult = await extendSession(sessionId, account, dag4PrivateKey, metagraphL1DataUrl);
        console.log("Extend session result:", extendResult);

        // Step 3: Wait another 20 seconds then close the session
        console.log("Waiting 20 seconds before closing...");
        await new Promise(resolve => setTimeout(resolve, 60000));

        console.log("Step 3: Closing the session...");
        const closeResult = await closeSession(sessionId, account, dag4PrivateKey, metagraphL1DataUrl);
        console.log("Close session result:", closeResult);

    } catch (error) {
        console.error("Error in session operations:", error);
        process.exit(1);
    }
};

// Execute the main function
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    createSession,
    extendSession,
    closeSession,
    buildNotarizeSessionMessage,
    buildExtendSessionMessage,
    buildCloseSessionMessage,
    generateDag4Proof,
    sendTransaction
};