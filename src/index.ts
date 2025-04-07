import * as readline from "node:readline";
import fs from "node:fs";

const blockchainJson = fs.readFileSync("./blockchain.json", {
  encoding: "utf8",
});
const parsedBlockchain: Blockchain = JSON.parse(blockchainJson);

const blockchain = parsedBlockchain.blockchain;
const { createHash, randomFill, scrypt, createCipheriv } = await import(
  "node:crypto"
);

//const PRIVATE_KEY = fs.readFileSync("./journal-entry", { encoding: "utf8" });

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

/* Handle new journal entry */
function encryptJournalEntry(entry: string) {
  const algo = "aes-192-cbc";
  const password = "a random password";

  scrypt(password, "salt", 24, (err, derivedKey) => {
    if (err) throw err;
    console.log({ key: derivedKey });

    // make random IV (initialisation vector)
    randomFill(new Uint8Array(16), (err, iv) => {
      if (err) throw err;
      const cipher = createCipheriv(algo, derivedKey, iv);

      let encrypted = cipher.update(entry, "utf8", "hex");
      encrypted += cipher.final("hex");
      console.log({ encrypted });
    });
  });
}

function main() {
  encryptJournalEntry(entryInput);
}
