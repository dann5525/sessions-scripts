require('dotenv').config();
const { dag4 } = require('@stardust-collective/dag4');
const jsSha256 = require('js-sha256');
const axios = require('axios');

const buildMessage = (creator, sessionId, endSnapshotOrdinal) => {
    return {
        CreateSession: {
            creator: creator,
            id: sessionId,
            endSnapshotOrdinal: endSnapshotOrdinal
        }
    };
};

const buildCreateSessionMessage = () => {
    return buildMessage(
        process.env.CREATOR,
        process.env.SESSION_ID,
        parseInt(process.env.END_SNAPSHOT_ORDINAL, 10)
    );
};

/** Encode message according with serializeUpdate on your template module l1 */
const getEncoded = (value) => {
    const energyValue = JSON.stringify(value);
    return energyValue;
};

const serialize = (msg) => {
    const coded = Buffer.from(msg, 'utf8').toString('hex');
    return coded;
};

const generateProof = async (message, walletPrivateKey, account) => {
    const encodedMessage = Buffer.from(JSON.stringify(message)).toString('base64');
    const signature = await dag4.keyStore.dataSign(walletPrivateKey, encodedMessage);

    const publicKey = account.publicKey;
    const uncompressedPublicKey =
        publicKey.length === 128 ? '04' + publicKey : publicKey;

    return {
        id: uncompressedPublicKey.substring(2),
        signature
    };
};

const sendDataTransactionsUsingUrls = async (
    globalL0Url,
    metagraphL1DataUrl
) => {
    const walletPrivateKey = process.env.WALLET_PRIVATE_KEY;

    const account = dag4.createAccount();
    account.loginPrivateKey(walletPrivateKey);

    account.connect({
        networkVersion: process.env.NETWORK_VERSION,
        l0Url: globalL0Url,
        testnet: process.env.TESTNET === 'true'
    });

    const message = buildCreateSessionMessage();
    const proof = await generateProof(message, walletPrivateKey, account);
    const body = {
        value: {
            ...message
        },
        proofs: [
            proof
        ]
    };
    try {
        console.log(`Transaction body: ${JSON.stringify(body)}`);
        const response = await axios.post(`${metagraphL1DataUrl}/data`, body);
        console.log(`Response: ${JSON.stringify(response.data)}`);
    } catch (e) {
        console.log('Error sending transaction', e.message);
    }
    return;
};

const sendDataTransaction = async () => {
    const globalL0Url = process.env.GLOBAL_L0_URL;
    const metagraphL1DataUrl = process.env.METAGRAPH_L1_DATA_URL;

    await sendDataTransactionsUsingUrls(globalL0Url, metagraphL1DataUrl);
};

sendDataTransaction();
