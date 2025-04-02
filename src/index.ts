import * as readline from 'node:readline';

interface Block {
  blockNumber: number;  
  timestamp: string;  
  prevHash: string | null;  
  hash: string | null;  
};

type Blockchain = Block[];

interface NewEntryData {
  prevHash: string | null;
  prevBlockNumber: number;
};

//console.log("Programming running..");

// user input
let entryInput = '';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(`Add new journal entry:`, entry => {
  
 entryInput = entry;
  console.log("Entry saved");
  rl.close();
});





function createBlock(data: NewEntryData): Block {

 const newBlock: Block = {
   blockNumber: data.prevBlockNumber += 1,
   timestamp: Date.now().toString(), 
   hash: null,
   prevHash: data.prevHash
 };
 
 return newBlock;
};

