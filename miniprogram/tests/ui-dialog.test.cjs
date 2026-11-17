const {test}=require('node:test');
const assert=require('node:assert/strict');
let definition;
global.Component=d=>{definition=d};
require('../dist/components/ui-dialog/index.js');
function dialog(busy=false,maskClosable=true){
 const events=[];
 const instance={...definition.methods,data:{busy,maskClosable},triggerEvent:name=>events.push(name)};
 return {instance,events};
}
test('submitting dialog rejects both close button and backdrop without emitting a close',()=>{
 const {instance,events}=dialog(true);
 instance.close();instance.maskTap();assert.deepEqual(events,[]);
 instance.data.busy=false;instance.close();assert.deepEqual(events,['close']);
});
test('confirmation backdrop preserves the decision while its close button remains available',()=>{
 const {instance,events}=dialog(false,false);
 instance.maskTap();assert.deepEqual(events,[]);
 instance.close();assert.deepEqual(events,['close']);
});
