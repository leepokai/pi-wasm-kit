import {PiWasmAgent} from '../../dist/index.js';
import {openNodeJournal} from '../../dist/storage/node.js';
const agent=await PiWasmAgent.open({journal:await openNodeJournal(process.argv[2]),model:async()=>{process.send({started:true});return new Promise(()=>{});}});
const submission=await agent.submit('persist across process death','kill-test');
process.send({id:submission.id});
setInterval(()=>{},1000);
