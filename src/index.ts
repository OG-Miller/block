import * as readline from "node:readline";
import fs from "node:fs";

const blockchainJson = fs.readFileSync("./blockchain.json", {
  encoding: "utf8",
});
const parsedBlockchain: Blockchain = JSON.parse(blockchainJson);

const blockchain = parsedBlockchain.blockchain;

import {
  createHash,
  randomFill,
  createCipheriv,
  generateKeyPairSync,
  KeyObject,
  sign,
  verify,
} from "node:crypto";

interface Blockchain {
  blockchain: Array<Block | GenesisBlock>;
}

interface GenesisBlock {
  blockNumber: number;
  timestamp: number;
  hash: string | null;
}

interface Block {
  blockNumber: number;
  timestamp: number;
  prevHash: string;
  hash: string | null;
}

async function createGenesisBlock(): Promise<GenesisBlock> {
  const genesisBlock: GenesisBlock = {
    blockNumber: 1,
    timestamp: Date.now(), // leave this for now. For searching by date we could write a function that parses it
    hash: null,
  };

  const hashedBlock: string = await hashBlock(genesisBlock);

  return { ...genesisBlock, hash: hashedBlock };
}

async function hashBlock(block: Block | GenesisBlock): Promise<string> {
  let hash = createHash("sha256").update(block.toString());

  return hash.digest("hex");
}

/* Create Genesis block */
let genesis: GenesisBlock;

if (blockchain.length === 0) {
  genesis = await createGenesisBlock();
  blockchain.push(genesis);
  console.log("Genesis block created 🗿 ", genesis);

  /* Write Genesis block to blockchain.json */
  fs.writeFile(
    "blockchain.json",
    JSON.stringify({ blockchain: [...blockchain] }),
    (err) => {
      if (err) {
        console.log("sorry, err: ", err);
      }
      console.log(`
      genesis block added to chain 🗿⛓️
      `);
    },
  );
}

/* Set up i/o interface */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let entryInput = "";

/* Get new journal entry input */
rl.question("Add new journal entry: ", (entry) => {
  entryInput = entry;
  console.log(`Registered entry 📋 "${entry.trim()}"`);

  main();
  rl.close();
});

interface EncryptedJournalEntry {
  entry: string;
  signature: string;
}

interface KeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

/* async function specifically for generateKeyPair */
function getKeyPair(): Promise<KeyPair> {
  const options = {
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  };

  /* Generate ed25519 key pair */
  return new Promise((resolve) => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519", options);
    resolve({ publicKey, privateKey });
  });
}

function getArrayBuffer(length: number): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve) => {
    randomFill(new Uint8Array(length), (err, iv) => {
      if (err) throw err;
      resolve(iv);
    });
  });
}

async function encryptJournalEntry(
  entry: string,
): Promise<EncryptedJournalEntry> {
  /* Create pub/priv key for encryption */
  let { publicKey, privateKey } = await getKeyPair();

  /* Encrypt the journal entry */
  const algo = "aes-192-cbc";

  let newIv: Uint8Array<ArrayBuffer> = await getArrayBuffer(16);
  let newSymmetricKey: Uint8Array<ArrayBuffer> = await getArrayBuffer(24);

  let entryBuffer = Buffer.from(entry, "utf8");

  /* Create a signature */
  const signature = sign(null, entryBuffer, privateKey);
  let stringSignature = signature.toString("base64");
  console.log("Signature created 🖋️ ", stringSignature);

  /* Verify the data */
  let verified = verify(null, entryBuffer, publicKey, signature);
  console.log("Signature verified ✅ ", verified);

  const cipher = createCipheriv(algo, newSymmetricKey, newIv);
  let encrypted = cipher.update(entry, "utf8", "hex");
  encrypted += cipher.final("hex");
  console.log("Entry encrypted 🔒 ", encrypted);

  return { entry: encrypted, signature: stringSignature };
}

// function addEncryptedEntryToDatabase() {}

async function main() {
  let encryptedJournalEntry = await encryptJournalEntry(entryInput);
  console.log({ encryptedJournalEntry });
}
