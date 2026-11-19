const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
test('safe renderer uses text nodes only',()=>{const view=fs.readFileSync('src/components/content-view/index.wxml','utf8');assert.doesNotMatch(view,/<rich-text|web-view/);assert.match(view,/block\.text/);assert.match(view,/block\.rows/)});
