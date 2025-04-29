import * as readline from "node:readline";
import fs from "node:fs";
import {
  createHash,
  randomFill,
  createCipheriv,
  KeyObject,
  sign,
  verify,
  generateKeyPair,
} from "node:crypto";

let currentHash: string = "default";

const blockchainJson = fs.readFileSync("./blockchain.json", {
  encoding: "utf8",
});
const parsedBlockchain: BlockchainLedger = JSON.parse(blockchainJson);
const blockchain = parsedBlockchain.blockchain;

const databaseJson = fs.readFileSync("./database.json", {
  encoding: "utf8",
});
const database: Database = JSON.parse(databaseJson);

// error msg styling
const RED = "\x1b[1m\x1b[31m";
const RESET = "\x1b[0m";

type Blockchain = (Block | GenesisBlock)[];
interface BlockchainLedger {
  blockchain: Blockchain;
}

interface EncryptedJournalEntry {
  entry: string;
  signature: string;
}

type Database = Record<string, EncryptedJournalEntry>;

interface GenesisBlock {
  type: "genesis";
  blockNumber: number;
  timestamp: number;
  prevHash: string | null;
  hash: string | null;
}

interface Block {
  type: "standard";
  blockNumber: number;
  timestamp: number;
  prevHash: string;
  hash: string | null;
}

interface KeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

async function addBlockToChain(
  blockType: "genesis" | "standard",
): Promise<string> {
  return new Promise((resolve) => {
    fs.writeFile(
      "blockchain.json",
      JSON.stringify({ blockchain: [...blockchain] }),
      (err) => {
        if (err) {
          console.log("sorry, err: ", err);
        }
        resolve(`\n${blockType} block added to chain ✅`);
      },
    );
  });
}

async function createBlock(): Promise<Block> {
  const previousBlock: Block | GenesisBlock = blockchain[blockchain.length - 1];

  const block: Block = {
    type: "standard",
    blockNumber: previousBlock.blockNumber + 1,
    timestamp: Date.now(), // TODO consider what format this should be
    hash: null,
    prevHash: previousBlock.hash ?? "",
  };

  const hashedBlock: string = await hashBlock(block);

  return { ...block, hash: hashedBlock };
}

async function createGenesisBlock(): Promise<GenesisBlock> {
  const genesisBlock: GenesisBlock = {
    type: "genesis",
    blockNumber: 1,
    timestamp: Date.now(), // TODO consider what format this should be
    prevHash: null,
    hash: null,
  };

  const hashedBlock: string = await hashBlock(genesisBlock);

  return { ...genesisBlock, hash: hashedBlock };
}

async function hashBlock(block: Block | GenesisBlock): Promise<string> {
  let hash = createHash("sha256").update(JSON.stringify(block));

  return hash.digest("hex");
}

async function addBlock() {
  /* Create Genesis block */
  if (blockchain.length === 0) {
    let genesis: GenesisBlock = await createGenesisBlock();

    /* save hash as global for DB entry key */
    currentHash = genesis.hash ?? "";
    blockchain.push(genesis);
    console.log("Genesis block created 🗿 ", genesis);

    /* Write Genesis block to blockchain.json */
    let confirmationLog = await addBlockToChain("genesis");
    console.log(confirmationLog);
  } else {
    /* Create Standard block */
    let block: Block = await createBlock();

    // save hash as global for DB entry key
    currentHash = block.hash ?? "";
    blockchain.push(block);
    console.log("\nNew standard block created  ", block);

    /* Write Genesis block to blockchain.json */
    let confirmationLog = await addBlockToChain("standard");
    console.log(confirmationLog);
  }
}

/* Set up i/o interface */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/* Get new journal entry input */
function getUserInput(): Promise<string> {
  return new Promise((resolve) => {
    rl.question("\nAdd new journal entry: ", (entry) => {
      console.log(`\nRegistered entry 📋 "${entry.trim()}"`);
      rl.close();
      resolve(entry);
    });
  });
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
    generateKeyPair("ed25519", options, (err, publicKey, privateKey) => {
      if (err) throw err;
      resolve({ publicKey, privateKey });
    });
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
  journalEntry: string,
): Promise<EncryptedJournalEntry> {
  /* Create pub/priv key for encryption */
  let { publicKey, privateKey } = await getKeyPair();

  /* Encrypt the journal entry */
  const algo = "aes-192-cbc";
  let iv: Uint8Array<ArrayBuffer> = await getArrayBuffer(16);
  let symmetricKey: Uint8Array<ArrayBuffer> = await getArrayBuffer(24);

  let entryAsBuffer = Buffer.from(journalEntry, "utf8");

  /* Create a signature */
  const signature = sign(null, entryAsBuffer, privateKey);
  let stringSignature = signature.toString("base64");
  console.log("\nSignature created 🖋️ ", stringSignature);

  /* Verify the data */
  let verified = verify(null, entryAsBuffer, publicKey, signature);
  console.log("\nSignature verified ✅ ", verified);

  const cipher = createCipheriv(algo, symmetricKey, iv);
  let encrypted = cipher.update(journalEntry, "utf8", "hex");
  encrypted += cipher.final("hex");
  console.log("\nEntry encrypted 🔒 ", encrypted);

  return { entry: encrypted, signature: stringSignature };
}

function addEncryptedEntryToDatabase(
  hash: string,
  entry: EncryptedJournalEntry,
): Promise<void> {
  database[hash] = entry;

  return new Promise((resolve) => {
    fs.writeFile("database.json", JSON.stringify(database), (err) => {
      if (err) {
        console.log("sorry, err: ", err);
      }
      resolve(console.log(`\nEntry added to Database ✅`));
    });
  });
}

type Data = { compromised: boolean; message?: string };

function validateBlockchain(blockchain: Blockchain): Promise<Data> {
  return new Promise((resolve, reject) => {
    // no blocks to validate or only genesis block exists (nothing to compare)
    if (blockchain.length < 2) {
      resolve({ compromised: false });
    }

    let previousHash: string = "";
    let data: Data = { compromised: false };

    for (const block of blockchain) {
      if (block.type === "genesis") {
        previousHash = block.hash ?? "";
        continue;
      }

      if (block.type === "standard") {
        if (previousHash !== block.prevHash) {
          console.log("❌ BLOCKCHAIN COMPROMISED ❌\n");
          data = {
            compromised: true,
            message:
              `${RED}\nHash mismatch between blocks ${block.blockNumber - 1} & ${block.blockNumber}:${RESET}\n` +
              `Block 2: ${previousHash}\n` +
              ` ↓↓↓\n` +
              `Block 3: ${block.prevHash}`,
          };

          break;
        } else if (previousHash === block.prevHash) {
          previousHash = block.hash ?? "";
          data = { compromised: false };
        }
      }
    }

    if (data.compromised) {
      reject(new Error(`\n${data.message}\n`));
    } else {
      console.log("\n🔒 BLOCKCHAIN VALIDATED 🔒\n");
      resolve(data);
    }
  });
}

(function main() {
  console.log("\n-[B]-[L]-[O]-[C]-[K]-[C]-[H]-[A]-[I]-[N]-\n");
  validateBlockchain(blockchain)
    .then(() => addBlock())
    .then(() => getUserInput())
    .then((input) => encryptJournalEntry(input))
    .then((entry) => addEncryptedEntryToDatabase(currentHash, entry))
    .then(() => console.log("\nEND"));
})();
