import * as readline from "node:readline";
import fs from "node:fs";
import { publicEncrypt, sign, verify } from "node:crypto";

const blockchainJson = fs.readFileSync("./blockchain.json", {
  encoding: "utf8",
});
const parsedBlockchain: Blockchain = JSON.parse(blockchainJson);

const blockchain = parsedBlockchain.blockchain;
const { createHash, generateKeyPair, randomFill, createCipheriv } =
  await import("node:crypto");

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

interface NewEntryData {
  prevHash: string | null;
  prevBlockNumber: number | null;
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
  console.log("Genesis block created ✓:", genesis);

  /* Write Genesis block to blockchain.json */
  fs.writeFile(
    "blockchain.json",
    JSON.stringify({ blockchain: [...blockchain] }),
    (err) => {
      if (err) {
        console.log("sorry, err: ", err);
      }
      console.log(`
      genesis block added 🗿
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
  console.log(`Registered entry: "${entry.trim()}"`);

  main();
  rl.close();
});

function encryptJournalEntry(entry: string) {
  /* Create pub/priv key for encryption */

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
  generateKeyPair("ed25519", options, (err, pubKey, privKey) => {
    if (err) throw err;

    /* Encrypt the data using AES algorithm */
    const algo = "aes-192-cbc";

    randomFill(new Uint8Array(16), (err, iv) => {
      if (err) throw err;

      randomFill(new Uint8Array(24), (err, symmetricKey) => {
        if (err) throw err;

        const cipher = createCipheriv(algo, symmetricKey, iv);
        let encrypted = cipher.update(entry, "utf8", "hex");
        encrypted += cipher.final("hex");
        console.log({ encrypted });
      });
    });

    let entryBuffer = Buffer.from(entry, "utf8");

    /* Create a signature */
    const signature = sign(null, entryBuffer, privKey);
    console.log({ signature: signature.toString("base64") });

    /* Verify the data */
    let verified = verify(null, entryBuffer, pubKey, signature);
    console.log({ verified });
  });
}

function main() {
  encryptJournalEntry(entryInput);
}
