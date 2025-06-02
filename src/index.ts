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
  publicEncrypt,
  privateDecrypt,
  createPrivateKey,
  createPublicKey,
  createDecipheriv,
  constants,
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

const privateJson = fs.readFileSync("./private.json", {
  encoding: "utf8",
});

const keysFromFile: EncryptionKeys = JSON.parse(privateJson);

interface GenesisBlock {
  type: "genesis";
  blockNumber: number;
  timestamp: string;
  prevHash: string | null;
  hash: string | null;
}

interface Block {
  type: "standard";
  blockNumber: number;
  timestamp: string;
  prevHash: string;
  hash: string | null;
}

type Blockchain = (Block | GenesisBlock)[];

interface BlockchainLedger {
  blockchain: Blockchain;
}

type Database = Record<string, EncryptedJournalEntry>;
type Data = { compromised: boolean; message?: string };
type Journey = "read" | "write";

interface EncryptedJournalEntry {
  entry: string;
  signature: string;
  encryptedSymmetricKey: string;
  iv: string;
}

interface EncryptionKeys {
  privateKey: string;
  publicKey: string;
}

interface KeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

/* Global variables */
let PRIVATE_KEY: KeyObject;
let PUBLIC_KEY: KeyObject;
const RED = "\x1b[1m\x1b[31m";
const RESET = "\x1b[0m";
const BLUE = "\x1b[1m\x1b[34m";

async function checkOrCreateKeyPair(): Promise<void> {
  /* Create new keys (only if keysFromFile DON'T already exist) */
  const keysFromFileAlreadyExist: boolean = Boolean(keysFromFile.privateKey);
  const newKeyPair: KeyPair | null = await createKeyPair(
    keysFromFileAlreadyExist,
  );

  return new Promise((resolve) => {
    if (keysFromFileAlreadyExist) {
      /* Save keysFromFile to global variables */
      PRIVATE_KEY = createPrivateKey(keysFromFile.privateKey);
      PUBLIC_KEY = createPublicKey(keysFromFile.publicKey);
      resolve();
      return;
    }

    if (!newKeyPair) {
      return;
    }

    /* Write the new KeyPair to file */
    fs.writeFile(
      "private.json",
      JSON.stringify({
        privateKey: newKeyPair.privateKey,
        publicKey: newKeyPair.publicKey,
      }),
      (err) => {
        if (err) {
          console.log(
            "Error when writing key pair to private.json, err: ",
            err,
          );
        }
        console.log(`\n${newKeyPair.publicKey} added to private.json  ✅`);
        resolve();
      },
    );

    /* Save new keys to global variables after writing them */
    PRIVATE_KEY = newKeyPair.privateKey;
    PUBLIC_KEY = newKeyPair.publicKey;
  });
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
        resolve(`\n✅${blockType} block added to chain\n`);
      },
    );
  });
}

function getTimestamp(): string {
  const timestamp = new Date();
  const formattedTimestamp = timestamp.toLocaleString("en-GB", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  return formattedTimestamp;
}

async function createBlock(): Promise<Block> {
  const previousBlock: Block | GenesisBlock = blockchain[blockchain.length - 1];

  const block: Block = {
    type: "standard",
    blockNumber: previousBlock.blockNumber + 1,
    timestamp: getTimestamp(),
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
    timestamp: getTimestamp(),
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

async function addNewBlock() {
  /* Create Genesis block */
  if (blockchain.length === 0) {
    let genesis: GenesisBlock = await createGenesisBlock();

    /* Save hash as global for DB entry key */
    currentHash = genesis.hash ?? "";
    blockchain.push(genesis);
    console.log("\n🗿Genesis block created", genesis);

    /* Write Genesis block to blockchain.json */
    let confirmationLog = await addBlockToChain("genesis");
    console.log(confirmationLog);
  } else {
    /* Create Standard block */
    let block: Block = await createBlock();

    // save hash as global for DB entry key
    currentHash = block.hash ?? "";
    blockchain.push(block);
    console.log("\n✅New standard block created  ", block);

    /* Write Genesis block to blockchain.json */
    let confirmationLog = await addBlockToChain("standard");
    console.log(confirmationLog);
  }
}

function getJournalEntryInput(): Promise<string> {
  /* Set up new i/o interface */
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\n${BLUE}Add new journal entry: ${RESET}`, (entry) => {
      rl.close();
      resolve(entry);
    });
  });
}

function createKeyPair(
  keysFromFileAlreadyExist: boolean,
): Promise<KeyPair | null> {
  const options = {
    modulusLength: 4096,
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
    if (keysFromFileAlreadyExist) {
      resolve(null);
      return;
    }

    generateKeyPair("rsa", options, (err, publicKey, privateKey) => {
      console.log("Generating keys");
      if (err) throw err;
      resolve({ publicKey, privateKey });
    });
  });
}

function getArrayBuffer(length: number): Promise<Uint8Array> {
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

  /* Prepare buffers and algorithm for encryption */
  const algo = "aes-192-cbc";
  let iv = Buffer.from(await getArrayBuffer(16));
  const symmetricKey = Buffer.from(await getArrayBuffer(24));
  const entryAsBuffer = Buffer.from(journalEntry, "hex");

  /* Create a signature */
  const signature = sign("sha256", entryAsBuffer, PRIVATE_KEY);
  const stringSignature = signature.toString("hex");

  /* Verify the journal entry data */
  const verified = verify(null, entryAsBuffer, PUBLIC_KEY, signature);
  console.log(
    `\n${verified ? "✅Signature verified" : "❌Signature NOT verified"}`,
  );

  /* Encrypt the journal entry */
  const cipher = createCipheriv(algo, symmetricKey, iv);
  let encryptedJournalEntry = cipher.update(journalEntry, "utf8", "hex");
  encryptedJournalEntry += cipher.final("hex");
  console.log("\n🔒Entry encrypted");

  /* Encrypt the symmetricKey */
  const encryptedSymmetricKey = publicEncrypt(
    {
      key: PUBLIC_KEY,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    symmetricKey,
  );

  return {
    entry: encryptedJournalEntry,
    signature: stringSignature,
    encryptedSymmetricKey: encryptedSymmetricKey.toString("hex"),
    iv: Buffer.from(iv).toString("hex"),
  };
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
      resolve(console.log(`\n✅Entry added to Database`));
    });
  });
}

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
      console.log("\n🔒BLOCKCHAIN VALIDATED");
      resolve(data);
    }
  });
}

function chooseUserJourney(): Promise<Journey> {
  /* Set up new i/o interface */
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      "\nEnter 'R' to read a journal entry or 'A' to add one: ",
      (choice) => {
        console.log(`\nRegistered choice📋 "${choice.trim()}"`);
        rl.close();
        resolve(choice === "R" || choice === "r" ? "read" : "write");
      },
    );
  });
}

async function writeJourney() {
  await addNewBlock()
    .then(() => getJournalEntryInput())
    .then((input) => encryptJournalEntry(input))
    .then((entry) => addEncryptedEntryToDatabase(currentHash, entry));
}

function clearTerminal() {
  process.stdout.write("\x1b[3J"); // Clear scrollback buffer
  process.stdout.write("\x1b[2J"); // Clear entire screen
  process.stdout.write("\x1b[0f"); // Move cursor to top left
}

/* Open a CLI to choose journal entry & return 
 its hash to look up database */
function chooseJournalEntry(): Promise<string> {
  /* Set up new i/o interface */
  readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  /* Set 'rawMode' since we are using TTY */
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  return new Promise((resolve, reject) => {
    let selected = 1;
    let chosenBlock: GenesisBlock | Block | undefined;

    /* Print initial list */
    for (const block of blockchain.reverse()) {
      process.stdout.write(
        `${block.blockNumber === selected ? "> " : "  "}${block.timestamp}\n`,
      );
    }

    const readable = process.stdin;
    readable.on("data", (chunk) => {
      if (chunk.toString() === "j") {
        clearTerminal();
        selected -= 1;
        for (const block of blockchain) {
          process.stdout.write(
            `${block.blockNumber === selected ? "> " : "  "}${block.timestamp}\n`,
          );
        }
      }

      if (chunk.toString() === "k") {
        clearTerminal();
        selected += 1;
        for (const block of blockchain) {
          process.stdout.write(
            `${block.blockNumber === selected ? "> " : "  "}${block.timestamp}\n`,
          );
        }
      }

      if (chunk.toString() === "\r") {
        clearTerminal();
        chosenBlock = blockchain.find(
          (block) => block.blockNumber === selected,
        );
        process.stdout.write(
          `\nyou selected entry: ${chosenBlock?.timestamp}\n`,
        );

        if (!chosenBlock || chosenBlock?.hash === null) {
          reject("block number is undefined");
        } else {
          resolve(chosenBlock.hash);
        }
      }
    });
  });
}

function decryptEntry(encryptedEntry: EncryptedJournalEntry): string {
  const { entry, encryptedSymmetricKey } = encryptedEntry;

  /* Convert encryptedSymmetricKey from hex back to buffer */
  const encryptedSymmetricKeyAsBuffer = Buffer.from(
    encryptedSymmetricKey,
    "hex",
  );

  const decryptedSymmetricKey = privateDecrypt(
    {
      key: PRIVATE_KEY,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    encryptedSymmetricKeyAsBuffer,
  );

  const iv = Buffer.from(encryptedEntry.iv, "hex");
  const algo = "aes-192-cbc";

  /* Convert encryptedJournalEntry from hex back to buffer */
  const encryptedJournalEntryAsBuffer: Buffer<ArrayBufferLike> = Buffer.from(
    entry,
    "hex",
  );

  /* Decrypt journal entry */
  const decipher = createDecipheriv(algo, decryptedSymmetricKey, iv);
  let decrypted = decipher
    .update(encryptedJournalEntryAsBuffer)
    .toString("utf8");
  decrypted += decipher.final();
  return decrypted;
}

function readJourney() {
  chooseJournalEntry().then((selectedBlockHash) => {
    const chosenJournalEntry = database[selectedBlockHash];

    const decryptedEntry = decryptEntry(chosenJournalEntry);
    console.log(`\n${BLUE}${decryptedEntry}\n`);

    // End Program
    process.exit(0);
  });
}

(function main() {
  console.log("\n-[B]-[L]-[O]-[C]-[K]-[C]-[H]-[A]-[I]-[N]-\n");
  checkOrCreateKeyPair()
    .then(() => validateBlockchain(blockchain))
    .then(() => chooseUserJourney())
    .then((journey) => (journey === "write" ? writeJourney() : readJourney()))
    .then(() => console.log("\nEND"));
})();
