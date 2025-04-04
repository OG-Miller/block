import * as readline from "node:readline";
import fs from "node:fs";

const { createHash } = await import("node:crypto");

const blockchainJson = fs.readFileSync("./blockchain.json", {
  encoding: "utf8",
});
const parsedBlockchain: Blockchain = JSON.parse(blockchainJson);
const blockchain = parsedBlockchain.blockchain;

interface Blockchain {
  blockchain: Block[];
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

let entryInput = "";

// get entry text
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(`Add new journal entry:`, (entry) => {
  entryInput = entry;
  console.log(`Registered entry: "${entry.trim()}"`);

  rl.close();
});

let genesis: GenesisBlock;

if (blockchain.length === 0) {
  genesis = await createGenesisBlock();
  console.log("final genesis block", genesis);
}
